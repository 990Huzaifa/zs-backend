import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permission.decorator';
import {
  ClientRateListQueryDto,
  CreateClientRateDto,
  UpdateClientRateDto,
} from '../auth/dto/client-rate.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { buildActivityContext } from '../common/activity/activity-context';
import { User } from '../database/entities/user.entity';
import { ClientRatesService } from '../services/client-rates.service';

@Controller('client-rates')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ClientRatesController {
  constructor(private readonly clientRatesService: ClientRatesService) {}

  @Post()
  @RequirePermissions('CREATE_CLIENT_RATE')
  create(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: CreateClientRateDto,
  ) {
    return this.clientRatesService.create(
      dto,
      buildActivityContext(user, req),
    );
  }

  @Get()
  @RequirePermissions('VIEW_CLIENT_RATE')
  findAll(@Query() query: ClientRateListQueryDto) {
    return this.clientRatesService.findAll(query);
  }

  @Get('by-client/:clientId')
  @RequirePermissions('VIEW_CLIENT_RATE', 'VIEW_CLIENT')
  findByClient(@Param('clientId', ParseUUIDPipe) clientId: string) {
    return this.clientRatesService.findByClient(clientId);
  }

  @Get(':id/logs')
  @RequirePermissions('VIEW_CLIENT_RATE')
  findLogs(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientRatesService.findLogs(id);
  }

  @Get(':id')
  @RequirePermissions('VIEW_CLIENT_RATE')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientRatesService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('UPDATE_CLIENT_RATE')
  update(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClientRateDto,
  ) {
    return this.clientRatesService.update(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Delete(':id')
  @RequirePermissions('DELETE_CLIENT_RATE')
  remove(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.clientRatesService.remove(
      id,
      buildActivityContext(user, req),
    );
  }
}
