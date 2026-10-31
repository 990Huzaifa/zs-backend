import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
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
const LOAD_TO_BILTY_STATUS: Record<TripLoadStatus, BiltyStatus> = {
  [TripLoadStatus.PENDING]: BiltyStatus.PENDING,
  [TripLoadStatus.LOADED]: BiltyStatus.APPROVED,
  [TripLoadStatus.IN_TRANSIT]: BiltyStatus.IN_TRANSIT,
  [TripLoadStatus.COMPLETED]: BiltyStatus.COMPLETED,
  [TripLoadStatus.CANCELLED]: BiltyStatus.CANCELLED,
};

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
    private readonly tripsService: TripsService,
    private readonly primaryInventoryService: PrimaryInventoryService,
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

    const bilty = await this.biltyRepo.findOne({
      where: { id: load.biltyId },
    });
    if (!bilty) {
      throw new NotFoundException('Bilty not found for this load');
    }

    const biltyStatus = LOAD_TO_BILTY_STATUS[dto.status];
    const previousLoadStatus = load.status;
    const previousBiltyStatus = bilty.status;

    await this.dataSource.transaction(async (manager) => {
      load.status = dto.status;
      await manager.save(load);

      bilty.status = biltyStatus;
      await manager.save(bilty);

      // Warehousing bilty → auto primary inventory on IN_TRANSIT
      if (biltyStatus === BiltyStatus.IN_TRANSIT) {
        await this.primaryInventoryService.ensureCreatedForInTransitWarehousingBilty(
          bilty,
          {
            manager,
            activity,
            source: `trip_load_${direction}_in_transit`,
          },
        );
      }
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
        description: `Changed trip ${trip.tripCode} ${direction} load status to ${dto.status} (bilty ${bilty.code} → ${biltyStatus})`,
        metadata: {
          direction,
          loadId,
          status: dto.status,
          previousLoadStatus,
          biltyId: bilty.id,
          biltyCode: bilty.code,
          biltyStatus,
          previousBiltyStatus,
        },
      },
      activity,
    );

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

    return result;
  }
}
