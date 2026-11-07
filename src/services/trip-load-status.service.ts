import {
  BadRequestException,
  Injectable,
  NotFoundException,
  forwardRef,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Not, Repository } from 'typeorm';
import { ChangeTripLoadStatusDto } from '../auth/dto/trip.dto';
import { ActivityActorContext } from '../common/activity/activity-context';
import {
  ActivityAction,
  ActivityModule,
} from '../database/entities/activity.entity';
import { Bilty, BiltyStatus } from '../database/entities/bilty.entity';
import {
  Trip,
  TripDowncountryLoad,
  TripLoadStatus,
  TripUpcountryLoad,
} from '../database/entities/trip.entity';
import { ActivitiesService } from './activities.service';
import { PrimaryInventoryService } from './primary-inventory.service';
import { TripsService } from './trips.service';

/** Trip load status → bilty status (LOADED has no bilty twin → APPROVED). */
export const LOAD_TO_BILTY_STATUS: Record<TripLoadStatus, BiltyStatus> = {
  [TripLoadStatus.PENDING]: BiltyStatus.PENDING,
  [TripLoadStatus.LOADED]: BiltyStatus.APPROVED,
  [TripLoadStatus.IN_TRANSIT]: BiltyStatus.IN_TRANSIT,
  [TripLoadStatus.COMPLETED]: BiltyStatus.COMPLETED,
  [TripLoadStatus.CANCELLED]: BiltyStatus.CANCELLED,
};

/** Bilty status → trip load status (APPROVED → LOADED). */
export const BILTY_TO_LOAD_STATUS: Record<BiltyStatus, TripLoadStatus> = {
  [BiltyStatus.PENDING]: TripLoadStatus.PENDING,
  [BiltyStatus.APPROVED]: TripLoadStatus.LOADED,
  [BiltyStatus.IN_TRANSIT]: TripLoadStatus.IN_TRANSIT,
  [BiltyStatus.COMPLETED]: TripLoadStatus.COMPLETED,
  [BiltyStatus.CANCELLED]: TripLoadStatus.CANCELLED,
};

/** Higher = more advanced. Used when multiple loads share one bilty. */
const LOAD_STATUS_RANK: Record<TripLoadStatus, number> = {
  [TripLoadStatus.CANCELLED]: 0,
  [TripLoadStatus.PENDING]: 1,
  [TripLoadStatus.LOADED]: 2,
  [TripLoadStatus.IN_TRANSIT]: 3,
  [TripLoadStatus.COMPLETED]: 4,
};

/** Bilty→load must not reopen/overwrite these. */
const LOAD_STATUSES_SKIP_FROM_BILTY: TripLoadStatus[] = [
  TripLoadStatus.COMPLETED,
  TripLoadStatus.CANCELLED,
];

@Injectable()
export class TripLoadStatusService {
  constructor(
    @InjectRepository(Trip)
    private readonly tripRepo: Repository<Trip>,
    @InjectRepository(TripUpcountryLoad)
    private readonly upcountryRepo: Repository<TripUpcountryLoad>,
    @InjectRepository(TripDowncountryLoad)
    private readonly downcountryRepo: Repository<TripDowncountryLoad>,
    @InjectRepository(Bilty)
    private readonly biltyRepo: Repository<Bilty>,
    private readonly dataSource: DataSource,
    private readonly activitiesService: ActivitiesService,
    private readonly primaryInventoryService: PrimaryInventoryService,
    @Inject(forwardRef(() => TripsService))
    private readonly tripsService: TripsService,
  ) {}

  async changeUpcountryLoadStatus(
    tripId: string,
    loadId: string,
    dto: ChangeTripLoadStatusDto,
    activity?: ActivityActorContext,
  ) {
    return this.changeLoadStatus('upcountry', tripId, loadId, dto, activity);
  }

  async changeDowncountryLoadStatus(
    tripId: string,
    loadId: string,
    dto: ChangeTripLoadStatusDto,
    activity?: ActivityActorContext,
  ) {
    return this.changeLoadStatus('downcountry', tripId, loadId, dto, activity);
  }

  /**
   * Recompute bilty status from all connected UC/DC loads.
   * Non-cancelled loads: pick most advanced status.
   * No active loads → CANCELLED.
   * On IN_TRANSIT, ensures warehousing primary inventory.
   */
  async syncBiltyStatusFromConnectedLoads(
    biltyId: string,
    opts: {
      manager?: EntityManager;
      activity?: ActivityActorContext;
      source?: string;
    } = {},
  ): Promise<{ changed: boolean; biltyStatus: BiltyStatus }> {
    const biltyRepo = opts.manager
      ? opts.manager.getRepository(Bilty)
      : this.biltyRepo;
    const bilty = await biltyRepo.findOne({ where: { id: biltyId } });
    if (!bilty) {
      throw new NotFoundException('Bilty not found');
    }

    const loadStatus = await this.resolveBestLoadStatusForBilty(
      biltyId,
      opts.manager,
    );
    const biltyStatus = LOAD_TO_BILTY_STATUS[loadStatus];

    if (bilty.status === biltyStatus) {
      return { changed: false, biltyStatus };
    }

    bilty.status = biltyStatus;
    await biltyRepo.save(bilty);

    if (biltyStatus === BiltyStatus.IN_TRANSIT) {
      await this.primaryInventoryService.ensureCreatedForInTransitWarehousingBilty(
        bilty,
        {
          manager: opts.manager,
          activity: opts.activity,
          source: opts.source ?? 'trip_load_status_sync',
        },
      );
    }

    return { changed: true, biltyStatus };
  }

  /**
   * @deprecated Prefer syncBiltyStatusFromConnectedLoads — kept as thin alias
   * for call sites that still pass a single load status (ignored; recomputed).
   */
  async applyLoadStatusToBilty(
    biltyId: string,
    _loadStatus: TripLoadStatus,
    opts: {
      manager?: EntityManager;
      activity?: ActivityActorContext;
      source?: string;
    } = {},
  ): Promise<{ changed: boolean; biltyStatus: BiltyStatus }> {
    return this.syncBiltyStatusFromConnectedLoads(biltyId, opts);
  }

  /**
   * Bilty → connected UC/DC loads status.
   * Skips COMPLETED and CANCELLED loads (never reopen/overwrite them).
   */
  async applyBiltyStatusToLoads(
    biltyId: string,
    biltyStatus: BiltyStatus,
    manager?: EntityManager,
  ): Promise<{ updated: number; loadStatus: TripLoadStatus }> {
    const loadStatus = BILTY_TO_LOAD_STATUS[biltyStatus];
    const ucRepo = manager
      ? manager.getRepository(TripUpcountryLoad)
      : this.upcountryRepo;
    const dcRepo = manager
      ? manager.getRepository(TripDowncountryLoad)
      : this.downcountryRepo;

    const where = {
      biltyId,
      status: Not(In(LOAD_STATUSES_SKIP_FROM_BILTY)),
    };

    const [uc, dc] = await Promise.all([
      ucRepo.update(where, { status: loadStatus }),
      dcRepo.update(where, { status: loadStatus }),
    ]);

    return {
      updated: (uc.affected ?? 0) + (dc.affected ?? 0),
      loadStatus,
    };
  }

  /**
   * Bilty deliveryChallanNumber → all connected UC/DC loads.
   * Does not re-sync back to bilty.
   */
  async applyBiltyDcToLoads(
    biltyId: string,
    deliveryChallanNumber: string | null,
    manager?: EntityManager,
  ): Promise<{ updated: number }> {
    const dc = deliveryChallanNumber?.trim() || null;
    const ucRepo = manager
      ? manager.getRepository(TripUpcountryLoad)
      : this.upcountryRepo;
    const dcRepo = manager
      ? manager.getRepository(TripDowncountryLoad)
      : this.downcountryRepo;

    const [uc, dcl] = await Promise.all([
      ucRepo.update({ biltyId }, { deliveryChallanNumber: dc }),
      dcRepo.update({ biltyId }, { deliveryChallanNumber: dc }),
    ]);

    return { updated: (uc.affected ?? 0) + (dcl.affected ?? 0) };
  }

  private async resolveBestLoadStatusForBilty(
    biltyId: string,
    manager?: EntityManager,
  ): Promise<TripLoadStatus> {
    const ucRepo = manager
      ? manager.getRepository(TripUpcountryLoad)
      : this.upcountryRepo;
    const dcRepo = manager
      ? manager.getRepository(TripDowncountryLoad)
      : this.downcountryRepo;

    const [ucLoads, dcLoads] = await Promise.all([
      ucRepo.find({
        where: { biltyId },
        select: ['status'],
      }),
      dcRepo.find({
        where: { biltyId },
        select: ['status'],
      }),
    ]);

    const active = [...ucLoads, ...dcLoads]
      .map((l) => l.status)
      .filter((s) => s !== TripLoadStatus.CANCELLED);

    if (!active.length) {
      return TripLoadStatus.CANCELLED;
    }

    return active.reduce((best, cur) =>
      LOAD_STATUS_RANK[cur] > LOAD_STATUS_RANK[best] ? cur : best,
    );
  }

  private async changeLoadStatus(
    direction: 'upcountry' | 'downcountry',
    tripId: string,
    loadId: string,
    dto: ChangeTripLoadStatusDto,
    activity?: ActivityActorContext,
  ) {
    const trip = await this.tripRepo.findOne({ where: { id: tripId } });
    if (!trip) {
      throw new NotFoundException('Trip not found');
    }

    const repo =
      direction === 'upcountry' ? this.upcountryRepo : this.downcountryRepo;
    const load = await repo.findOne({ where: { id: loadId, tripId } });
    if (!load) {
      throw new NotFoundException(`${direction} load not found`);
    }

    if (load.status === TripLoadStatus.COMPLETED) {
      throw new BadRequestException(
        `Cannot change ${direction} load status when load status is COMPLETED`,
      );
    }

    const bilty = await this.biltyRepo.findOne({
      where: { id: load.biltyId },
    });
    if (!bilty) {
      throw new NotFoundException('Bilty not found for this load');
    }

    const previousLoadStatus = load.status;
    const previousBiltyStatus = bilty.status;
    let biltyStatus = previousBiltyStatus;
    let biltyChanged = false;

    await this.dataSource.transaction(async (manager) => {
      load.status = dto.status;
      await manager.save(load);

      const synced = await this.syncBiltyStatusFromConnectedLoads(
        load.biltyId,
        {
          manager,
          activity,
          source: `trip_${direction}_load_status`,
        },
      );
      biltyStatus = synced.biltyStatus;
      biltyChanged = synced.changed;
    });

    await this.tripsService.refreshBiltyTripAssignments(tripId);

    const result = await this.tripsService.findOne(tripId);

    await this.activitiesService.logAction(
      {
        action: ActivityAction.UPDATE,
        module: ActivityModule.TRIPS,
        entityType: 'TripLoad',
        entityId: loadId,
        record: trip.tripCode,
        description: `Changed trip ${trip.tripCode} ${direction} load status to ${dto.status}${
          biltyChanged ? ` (bilty ${bilty.code} → ${biltyStatus})` : ''
        }`,
        metadata: {
          direction,
          loadId,
          status: dto.status,
          previousLoadStatus,
          biltyId: bilty.id,
          biltyCode: bilty.code,
          biltyStatus,
          previousBiltyStatus,
          biltyChanged,
        },
      },
      activity,
    );

    if (biltyChanged) {
      await this.activitiesService.logAction(
        {
          action: ActivityAction.UPDATE,
          module: ActivityModule.TRIPS,
          entityType: 'Bilty',
          entityId: bilty.id,
          record: bilty.code,
          description: `Synced bilty ${bilty.code} status to ${biltyStatus} from trip ${trip.tripCode} ${direction} load`,
          metadata: {
            status: biltyStatus,
            previousStatus: previousBiltyStatus,
            tripId,
            tripCode: trip.tripCode,
            loadId,
            direction,
            loadStatus: dto.status,
          },
        },
        activity,
      );
    }

    return result;
  }
}
