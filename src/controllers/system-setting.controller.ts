import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { RequirePermissions } from '../auth/decorators/require-permission.decorator';
import { UpdateGeoSettingDto } from '../auth/dto/update-geo-setting.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
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
  updateGeo(@Body() dto: UpdateGeoSettingDto) {
    return this.systemSettingService.updateGeoSetting(dto);
  }
}
