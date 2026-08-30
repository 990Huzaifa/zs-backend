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
  CreateWarehouseDto,
  UpdateWarehouseDto,
  WarehouseListQueryDto,
} from '../auth/dto/warehouse.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { buildActivityContext } from '../common/activity/activity-context';
import { User } from '../database/entities/user.entity';
import { WarehousesService } from '../services/warehouses.service';

@Controller('warehouses')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class WarehousesController {
  constructor(private readonly warehousesService: WarehousesService) {}

  @Post()
  @RequirePermissions('CREATE_WAREHOUSE')
  create(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: CreateWarehouseDto,
  ) {
    return this.warehousesService.create(
      dto,
      buildActivityContext(user, req),
    );
  }

  @Get()
  @RequirePermissions('VIEW_WAREHOUSE')
  findAll(@Query() query: WarehouseListQueryDto) {
    return this.warehousesService.findAll(query);
  }

  @Get('by-client/:clientId')
  @RequirePermissions('VIEW_WAREHOUSE', 'VIEW_CLIENT')
  findByClient(@Param('clientId', ParseUUIDPipe) clientId: string) {
    return this.warehousesService.findByClient(clientId);
  }

  @Get(':id')
  @RequirePermissions('VIEW_WAREHOUSE')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.warehousesService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('UPDATE_WAREHOUSE')
  update(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWarehouseDto,
  ) {
    return this.warehousesService.update(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Delete(':id')
  @RequirePermissions('DELETE_WAREHOUSE')
  remove(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.warehousesService.remove(id, buildActivityContext(user, req));
  }
}
