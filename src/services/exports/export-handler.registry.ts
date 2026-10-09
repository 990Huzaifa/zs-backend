import { Injectable, NotFoundException } from '@nestjs/common';
import { ExportEntityType } from '../../database/entities/export-job.entity';
import { ExportHandler } from './export-handler.interface';
import { DriverExportHandler } from './handlers/driver-export.handler';
import { VehicleExportHandler } from './handlers/vehicle-export.handler';

@Injectable()
export class ExportHandlerRegistry {
  private readonly handlers: Map<ExportEntityType, ExportHandler>;

  constructor(
    driverHandler: DriverExportHandler,
    vehicleHandler: VehicleExportHandler,
  ) {
    this.handlers = new Map<ExportEntityType, ExportHandler>([
      [ExportEntityType.DRIVER, driverHandler],
      [ExportEntityType.VEHICLE, vehicleHandler],
    ]);
  }

  get(entityType: ExportEntityType): ExportHandler {
    const handler = this.handlers.get(entityType);
    if (!handler) {
      throw new NotFoundException(`Export handler not found for ${entityType}`);
    }
    return handler;
  }
}
