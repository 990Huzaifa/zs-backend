import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, In, Repository } from 'typeorm';
import {
  ExportEntityType,
  ExportFormat,
  ExportMode,
} from '../../../database/entities/export-job.entity';
import {
  Vehicle,
  VehicleOwnerShip,
  VehicleStatus,
} from '../../../database/entities/vehicle.entity';
import { ExportHandler } from '../export-handler.interface';
import { GeneratedExportFile } from '../export.types';
import {
  ExportVehicleRow,
  VehicleExportGenerator,
} from '../generators/vehicle-export.generator';
import { MAX_EXPORT_RECORDS } from './driver-export.handler';

export type VehicleExportFilters = {
  search?: string;
  status?: VehicleStatus;
  ownership?: VehicleOwnerShip;
  vehicleTypeId?: string;
  vehicleSizeId?: string;
  vehicleCapacityId?: string;
};

@Injectable()
export class VehicleExportHandler implements ExportHandler {
  readonly entityType = ExportEntityType.VEHICLE;
  readonly auditRecord = 'VEHICLE_EXPORT_CREATED';
  readonly storageFolder = 'vehicles';
  readonly emptyMessage = 'No vehicles to export';

  constructor(
    @InjectRepository(Vehicle)
    private readonly vehicleRepo: Repository<Vehicle>,
    private readonly generator: VehicleExportGenerator,
  ) {}

  async resolveRecordIds(
    recordIds: string[] | null,
    filters: Record<string, unknown> | object | null,
  ): Promise<string[]> {
    if (recordIds?.length) {
      return this.resolveSelectedIds(recordIds);
    }
    return this.resolveFilterIds((filters ?? {}) as VehicleExportFilters);
  }

  async loadRecords(
    ids: string[],
    mode: ExportMode,
  ): Promise<ExportVehicleRow[]> {
    const qb = this.vehicleRepo
      .createQueryBuilder('vehicle')
      .leftJoinAndSelect('vehicle.vehicleType', 'vehicleType')
      .leftJoinAndSelect('vehicle.vehicleSize', 'vehicleSize')
      .leftJoinAndSelect('vehicle.vehicleCapacity', 'vehicleCapacity')
      .where('vehicle.id IN (:...ids)', { ids });

    if (mode === ExportMode.DOCUMENTS || mode === ExportMode.DETAIL_PAGES) {
      qb.leftJoinAndSelect('vehicle.documents', 'documents');
    }

    const rows = await qb.getMany();
    const order = new Map(ids.map((id, i) => [id, i]));
    rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    return rows as ExportVehicleRow[];
  }

  async generateFile(
    records: unknown[],
    format: ExportFormat,
    mode: ExportMode,
  ): Promise<GeneratedExportFile> {
    return this.generator.generate(
      records as ExportVehicleRow[],
      format,
      mode,
    );
  }

  private async resolveSelectedIds(ids: string[]): Promise<string[]> {
    const unique = [...new Set(ids)];
    const rows = await this.vehicleRepo.find({
      where: { id: In(unique) },
      select: ['id'],
    });
    const found = new Set(rows.map((r) => r.id));
    return unique.filter((id) => found.has(id));
  }

  private async resolveFilterIds(
    filters: VehicleExportFilters,
  ): Promise<string[]> {
    const where: Record<string, unknown> = {};
    if (filters.status) where.status = filters.status;
    if (filters.ownership) where.ownership = filters.ownership;
    if (filters.vehicleTypeId) where.vehicleTypeId = filters.vehicleTypeId;
    if (filters.vehicleSizeId) where.vehicleSizeId = filters.vehicleSizeId;
    if (filters.vehicleCapacityId) {
      where.vehicleCapacityId = filters.vehicleCapacityId;
    }

    const search = filters.search?.trim();
    const whereClause = search
      ? [
          { ...where, regNo: ILike(`%${search}%`) },
          { ...where, enginNo: ILike(`%${search}%`) },
          { ...where, chassisNo: ILike(`%${search}%`) },
          { ...where, ownerFirstName: ILike(`%${search}%`) },
          { ...where, ownerLastName: ILike(`%${search}%`) },
          { ...where, contactPersonName: ILike(`%${search}%`) },
          { ...where, contactNo: ILike(`%${search}%`) },
        ]
      : where;

    const rows = await this.vehicleRepo.find({
      where: whereClause as never,
      select: ['id'],
      order: { createdAt: 'DESC' },
      take: MAX_EXPORT_RECORDS + 1,
    });
    return rows.map((r) => r.id);
  }
}
