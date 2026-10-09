import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  DriverLicenseType,
  DriverStatus,
  DriverType,
  Driver,
  EmployeerType,
} from '../../../database/entities/driver.entity';
import {
  ExportEntityType,
  ExportFormat,
  ExportMode,
} from '../../../database/entities/export-job.entity';
import { ExportHandler } from '../export-handler.interface';
import { GeneratedExportFile } from '../export.types';
import {
  DriverExportGenerator,
  ExportDriverRow,
} from '../generators/driver-export.generator';

export const MAX_EXPORT_RECORDS = 5000;

export type DriverExportFilters = {
  search?: string;
  status?: DriverStatus;
  driverType?: DriverType;
  employeerType?: EmployeerType;
  licenseType?: DriverLicenseType;
};

@Injectable()
export class DriverExportHandler implements ExportHandler {
  readonly entityType = ExportEntityType.DRIVER;
  readonly auditRecord = 'DRIVER_EXPORT_CREATED';
  readonly storageFolder = 'drivers';
  readonly emptyMessage = 'No drivers to export';

  constructor(
    @InjectRepository(Driver)
    private readonly driverRepo: Repository<Driver>,
    private readonly generator: DriverExportGenerator,
  ) {}

  async resolveRecordIds(
    recordIds: string[] | null,
    filters: Record<string, unknown> | object | null,
  ): Promise<string[]> {
    if (recordIds?.length) {
      return this.resolveSelectedIds(recordIds);
    }
    return this.resolveFilterIds((filters ?? {}) as DriverExportFilters);
  }

  async loadRecords(ids: string[], mode: ExportMode): Promise<ExportDriverRow[]> {
    const qb = this.driverRepo
      .createQueryBuilder('driver')
      .leftJoinAndSelect('driver.user', 'user')
      .where('driver.id IN (:...ids)', { ids });

    if (mode === ExportMode.DOCUMENTS) {
      qb.leftJoinAndSelect('driver.documents', 'documents');
    }
    if (mode === ExportMode.DETAIL_PAGES) {
      qb.leftJoinAndSelect('driver.assignedDrivers', 'assignedDrivers')
        .leftJoinAndSelect('assignedDrivers.vehicle', 'vehicle');
    }

    const rows = await qb.getMany();
    const order = new Map(ids.map((id, i) => [id, i]));
    rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    return rows as ExportDriverRow[];
  }

  async generateFile(
    records: unknown[],
    format: ExportFormat,
    mode: ExportMode,
  ): Promise<GeneratedExportFile> {
    return this.generator.generate(records as ExportDriverRow[], format, mode);
  }

  private async resolveSelectedIds(ids: string[]): Promise<string[]> {
    const unique = [...new Set(ids)];
    const rows = await this.driverRepo.find({
      where: { id: In(unique) },
      select: ['id'],
    });
    const found = new Set(rows.map((r) => r.id));
    return unique.filter((id) => found.has(id));
  }

  private async resolveFilterIds(
    filters: DriverExportFilters,
  ): Promise<string[]> {
    const qb = this.driverRepo
      .createQueryBuilder('driver')
      .leftJoin('driver.user', 'user')
      .select('driver.id')
      .orderBy('driver.createdAt', 'DESC');

    if (filters.status) {
      qb.andWhere('driver.status = :status', { status: filters.status });
    }
    if (filters.driverType) {
      qb.andWhere('driver.driverType = :driverType', {
        driverType: filters.driverType,
      });
    }
    if (filters.licenseType) {
      qb.andWhere('driver.licenseType = :licenseType', {
        licenseType: filters.licenseType,
      });
    }
    if (filters.employeerType) {
      qb.andWhere('driver.employeerType = :employeerType', {
        employeerType: filters.employeerType,
      });
    }

    const search = filters.search?.trim();
    if (search) {
      qb.andWhere(
        `(
          user.name ILIKE :search
          OR user.email ILIKE :search
          OR user.phone ILIKE :search
          OR user.code ILIKE :search
          OR driver.fatherName ILIKE :search
          OR driver.phone ILIKE :search
          OR driver.cnicNo ILIKE :search
          OR driver.licenseNo ILIKE :search
          OR driver.gurantorName ILIKE :search
          OR driver.gurantorCNIC ILIKE :search
        )`,
        { search: `%${search}%` },
      );
    }

    qb.take(MAX_EXPORT_RECORDS + 1);
    const rows = await qb.getMany();
    return rows.map((r) => r.id);
  }
}
