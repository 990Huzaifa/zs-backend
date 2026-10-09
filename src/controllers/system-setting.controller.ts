import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permission.decorator';
import { UpdateAlertsSettingDto } from '../auth/dto/update-alerts-setting.dto';
import { UpdateBusinessInfoSettingDto } from '../auth/dto/update-business-info-setting.dto';
import { UpdateGeoSettingDto } from '../auth/dto/update-geo-setting.dto';
import { UpdateMaintenanceSettingDto } from '../auth/dto/update-maintenance-setting.dto';
import { UpdatePayrollSettingDto } from '../auth/dto/update-payroll-setting.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { buildActivityContext } from '../common/activity/activity-context';
import { User } from '../database/entities/user.entity';
import { SystemSettingService } from '../services/system-setting.service';

@Controller('system-settings')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class SystemSettingController {
  constructor(private readonly systemSettingService: SystemSettingService) {}

  @Get('geo')
  @RequirePermissions('VIEW_SYSTEM_SETTING')
  getGeo() {
    return this.systemSettingService.getGeoSetting();
  }

  @Put('geo')
  @RequirePermissions('UPDATE_SYSTEM_SETTING')
  updateGeo(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: UpdateGeoSettingDto,
  ) {
    return this.systemSettingService.updateGeoSetting(
      dto,
      buildActivityContext(user, req),
    );
  }

  @Get('business-info')
  @RequirePermissions('VIEW_SYSTEM_SETTING')
  getBusinessInfo() {
    return this.systemSettingService.getBusinessInfoSetting();
  }

  @Put('business-info')
  @RequirePermissions('UPDATE_SYSTEM_SETTING')
  updateBusinessInfo(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: UpdateBusinessInfoSettingDto,
  ) {
    return this.systemSettingService.updateBusinessInfoSetting(
      dto,
      buildActivityContext(user, req),
    );
  }

  /**
   * Maintenance inventory prefs — batch picking method (FIFO / LIFO / MANUAL).
   */
  @Get('maintenance')
  @RequirePermissions(
    'VIEW_SYSTEM_SETTING',
    'VIEW_MAINTENANCE_INVENTORY',
    'CREATE_MAINTENANCE_STOCK_ISSUE',
    'UPDATE_MAINTENANCE_STOCK_ISSUE',
    'ADJUST_MAINTENANCE_INVENTORY',
  )
  getMaintenance() {
    return this.systemSettingService.getMaintenanceSetting();
  }

  @Put('maintenance')
  @RequirePermissions('UPDATE_SYSTEM_SETTING')
  updateMaintenance(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: UpdateMaintenanceSettingDto,
  ) {
    return this.systemSettingService.updateMaintenanceSetting(
      dto,
      buildActivityContext(user, req),
    );
  }

  /**
   * Payroll automation — MANUAL vs AUTO (day-of-month + time + timezone).
   */
  @Get('payroll')
  @RequirePermissions(
    'VIEW_SYSTEM_SETTING',
    'VIEW_PAYROLL_RUN',
    'VIEW_PAY_PERIOD',
  )
  getPayroll() {
    return this.systemSettingService.getPayrollSetting();
  }

  @Put('payroll')
  @RequirePermissions('UPDATE_SYSTEM_SETTING')
  updatePayroll(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: UpdatePayrollSettingDto,
  ) {
    return this.systemSettingService.updatePayrollSetting(
      dto,
      buildActivityContext(user, req),
    );
  }

  /**
   * Document-expiry alert windows — warningDaysBefore / criticalDaysBefore.
   */
  @Get('alerts')
  @RequirePermissions('VIEW_SYSTEM_SETTING', 'VIEW_ALERT')
  getAlerts() {
    return this.systemSettingService.getAlertsSetting();
  }

  @Put('alerts')
  @RequirePermissions('UPDATE_SYSTEM_SETTING')
  updateAlerts(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: UpdateAlertsSettingDto,
  ) {
    return this.systemSettingService.updateAlertsSetting(
      dto,
      buildActivityContext(user, req),
    );
  }
}
