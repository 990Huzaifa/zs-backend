import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permission.decorator';
import {
  AlertListQueryDto,
  DismissAlertDto,
  ResolveAlertDto,
} from '../auth/dto/alert.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { User } from '../database/entities/user.entity';
import { AlertsService } from '../services/alerts.service';

@Controller('alerts')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  @RequirePermissions('VIEW_ALERT')
  findAll(@Query() query: AlertListQueryDto) {
    return this.alertsService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('VIEW_ALERT')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.alertsService.findOne(id);
  }

  @Patch(':id/acknowledge')
  @RequirePermissions('UPDATE_ALERT')
  acknowledge(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.alertsService.acknowledge(id, user.id);
  }

  @Patch(':id/resolve')
  @RequirePermissions('UPDATE_ALERT')
  resolve(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveAlertDto,
  ) {
    return this.alertsService.resolve(id, user.id, dto);
  }

  @Patch(':id/dismiss')
  @RequirePermissions('UPDATE_ALERT')
  dismiss(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DismissAlertDto,
  ) {
    return this.alertsService.dismiss(id, user.id, dto);
  }
}
