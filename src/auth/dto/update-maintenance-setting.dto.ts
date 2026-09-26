import { IsEnum, IsOptional } from 'class-validator';
import { MaintenanceBatchPickingMethod } from '../../database/entities/system-setting.entity';

export class UpdateMaintenanceSettingDto {
  @IsOptional()
  @IsEnum(MaintenanceBatchPickingMethod)
  batchPickingMethod?: MaintenanceBatchPickingMethod;
}
