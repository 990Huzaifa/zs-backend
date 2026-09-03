import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActivityActorContext } from '../common/activity/activity-context';
import {
  ActivityAction,
  ActivityActorType,
  ActivityModule,
} from '../database/entities/activity.entity';
import { City } from '../database/entities/city.entity';
import {
  Client,
  ClientRate,
  ClientRateLog,
} from '../database/entities/client.entity';
import {
  VehicleCapacity,
  VehicleSize,
  VehicleType,
} from '../database/entities/vehicle.entity';
import {
  RateStatus,
  VendorProduct,
  VendorRate,
} from '../database/entities/vendor.entity';
import { ActivitiesService } from './activities.service';

/** Rolling price history retained per client rate (same as ClientRatesService). */
const CLIENT_RATE_LOG_LIMIT = 10;

export type ClientRateFuelSyncSource = 'vendor-rate' | 'cron';

@Injectable()
export class ClientRateFuelAdjustmentService {
  private readonly logger = new Logger(ClientRateFuelAdjustmentService.name);

  constructor(
    @InjectRepository(ClientRate)
    private readonly clientRateRepo: Repository<ClientRate>,
    @InjectRepository(ClientRateLog)
    private readonly logRepo: Repository<ClientRateLog>,
    @InjectRepository(VendorRate)
    private readonly vendorRateRepo: Repository<VendorRate>,
    private readonly activitiesService: ActivitiesService,
  ) {}

  async syncProducts(
    productIds: string[],
    activity?: ActivityActorContext,
    source: ClientRateFuelSyncSource = 'vendor-rate',
  ): Promise<{ updated: number; skipped: number }> {
    const unique = [...new Set(productIds.filter(Boolean))];
    let updated = 0;
    let skipped = 0;
    for (const productId of unique) {
      const result = await this.syncProduct(productId, activity, source);
      updated += result.updated;
      skipped += result.skipped;
    }
    return { updated, skipped };
  }

  /**
   * Scale variable (40%) of every client rate for this product by the change
   * in highest ACTIVE vendor fuel price. Fixed rate is unchanged.
   * newFreight = fixed + newVariable.
   */
  async syncProduct(
    productId: string,
    activity?: ActivityActorContext,
    source: ClientRateFuelSyncSource = 'vendor-rate',
  ): Promise<{ updated: number; skipped: number }> {
    const newHighest = await this.getHighestActivePrice(productId);
    if (newHighest === null) {
      this.logger.debug(
        `No ACTIVE vendor rate for product ${productId}; skipping client rate sync`,
      );
      return { updated: 0, skipped: 0 };
    }

    const rates = await this.clientRateRepo.find({
      where: { vendorProductId: productId },
      relations: {
        client: true,
        vehicleType: true,
        vehicleSize: true,
        vehicleCapacity: true,
        city: true,
        vendorProduct: true,
      },
    });

    if (rates.length === 0) {
      return { updated: 0, skipped: 0 };
    }

    const today = this.todayUtc();
    const newFuelFormatted = this.formatRate(Number(newHighest));
    const newFuel = Number(newFuelFormatted);
    let updated = 0;
    let skipped = 0;

    for (const rate of rates) {
      const oldFuel = Number(rate.fuelrate);
      if (!Number.isFinite(oldFuel) || oldFuel <= 0) {
        skipped += 1;
        continue;
      }

      if (this.formatRate(oldFuel) === newFuelFormatted) {
        skipped += 1;
        continue;
      }

      const previousFuelrate = rate.fuelrate;
      const previousVariablerate = rate.variablerate;
      const previousFreightrate = rate.freightrate;
      const previousEffectiveFrom = rate.effectiveFromDate;

      const ratio = newFuel / oldFuel;
      const newVariable = this.round2(Number(rate.variablerate) * ratio);
      const newFreight = this.round2(Number(rate.fixedrate) + newVariable);

      rate.fuelrate = newFuelFormatted;
      rate.variablerate = this.formatRate(newVariable);
      rate.freightrate = this.formatRate(newFreight);
      rate.effectiveFromDate = today as unknown as Date;

      await this.clientRateRepo.save(rate);

      await this.writeLog(
        rate.id,
        previousFreightrate,
        previousEffectiveFrom
          ? String(previousEffectiveFrom).slice(0, 10)
          : null,
        today,
      );

      await this.activitiesService.logAction(
        {
          action: ActivityAction.UPDATE,
          module: ActivityModule.BILLING,
          entityType: 'ClientRate',
          entityId: rate.id,
          record: this.rateRecordLabel(rate),
          description: `Adjusted client rate ${this.rateRecordLabel(rate)} for fuel price change`,
          metadata: {
            clientId: rate.clientId,
            vendorProductId: rate.vendorProductId,
            previousFuelrate,
            newFuelrate: rate.fuelrate,
            ratio: Number(ratio.toFixed(6)),
            previousVariablerate,
            newVariablerate: rate.variablerate,
            previousFreightrate,
            newFreightrate: rate.freightrate,
            fixedrate: rate.fixedrate,
            source,
          },
          actorType:
            source === 'cron' ? ActivityActorType.SYSTEM : undefined,
        },
        source === 'cron' ? undefined : activity,
      );

      updated += 1;
    }

    this.logger.log(
      `Client rate fuel sync for product ${productId}: updated ${updated}, skipped ${skipped} (highest=${newFuelFormatted})`,
    );

    return { updated, skipped };
  }

  private async getHighestActivePrice(
    productId: string,
  ): Promise<string | null> {
    const rate = await this.vendorRateRepo
      .createQueryBuilder('rate')
      .where('rate.productId = :productId', { productId })
      .andWhere('rate.status = :status', { status: RateStatus.ACTIVE })
      .orderBy('rate.price', 'DESC')
      .addOrderBy('rate.effectiveFromDate', 'DESC')
      .addOrderBy('rate.createdAt', 'DESC')
      .getOne();

    return rate?.price ?? null;
  }

  private async writeLog(
    clientRateId: string,
    previousPrice: string | null,
    effectiveFromDate?: string | null,
    effectiveToDate?: string | null,
  ): Promise<void> {
    await this.logRepo.save(
      this.logRepo.create({
        clientRateId,
        previousPrice,
        effectiveFromDate: effectiveFromDate as unknown as Date | null,
        effectiveToDate: effectiveToDate as unknown as Date | null,
      }),
    );
    await this.pruneOldLogs(clientRateId);
  }

  private async pruneOldLogs(clientRateId: string): Promise<void> {
    const keep = await this.logRepo.find({
      where: { clientRateId },
      order: { createdAt: 'DESC' },
      take: CLIENT_RATE_LOG_LIMIT,
      select: { id: true },
    });

    if (keep.length < CLIENT_RATE_LOG_LIMIT) {
      return;
    }

    const keepIds = keep.map((row) => row.id);
    await this.logRepo
      .createQueryBuilder()
      .delete()
      .from(ClientRateLog)
      .where('clientRateId = :clientRateId', { clientRateId })
      .andWhere('id NOT IN (:...keepIds)', { keepIds })
      .execute();
  }

  private rateRecordLabel(
    rate: Pick<ClientRate, 'id' | 'freightrate'> & {
      client?: Pick<Client, 'companyName'> | null;
      vehicleType?: Pick<VehicleType, 'name'> | null;
      vehicleSize?: Pick<VehicleSize, 'name'> | null;
      vehicleCapacity?: Pick<VehicleCapacity, 'name'> | null;
      city?: Pick<City, 'name'> | null;
      vendorProduct?: Pick<VendorProduct, 'name'> | null;
    },
  ): string {
    const parts = [
      rate.client?.companyName,
      rate.vehicleType?.name,
      rate.vehicleSize?.name || rate.vehicleCapacity?.name,
      rate.city?.name,
      rate.vendorProduct?.name,
      rate.freightrate != null ? `$${rate.freightrate}` : null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(' / ') : rate.id;
  }

  private round2(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private formatRate(rate: number): string {
    return rate.toFixed(2);
  }

  private todayUtc(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
