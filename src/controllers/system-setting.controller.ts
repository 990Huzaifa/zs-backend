import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permission.decorator';
import { UpdateBusinessInfoSettingDto } from '../auth/dto/update-business-info-setting.dto';
import { UpdateGeoSettingDto } from '../auth/dto/update-geo-setting.dto';
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
}
