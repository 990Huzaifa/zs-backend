import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permission.decorator';
import { VehicleMasterListQueryDto } from '../auth/dto/vehicle-master-list-query.dto';
import {
  ChangeVehicleMasterStatusDto,
  CreateVehicleCapacityDto,
  UpdateVehicleCapacityDto,
} from '../auth/dto/vehicle-master.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { buildActivityContext } from '../common/activity/activity-context';
import { User } from '../database/entities/user.entity';
import { VehicleCapacitiesService } from '../services/vehicle-capacities.service';

@Controller('vehicle-capacities')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class VehicleCapacitiesController {
  constructor(
    private readonly vehicleCapacitiesService: VehicleCapacitiesService,
  ) {}

  @Post()
  @RequirePermissions('CREATE_VEHICLE_CAPACITY')
  create(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: CreateVehicleCapacityDto,
  ) {
    return this.vehicleCapacitiesService.create(
      dto,
      buildActivityContext(user, req),
    );
  }

  @Get()
  @RequirePermissions('VIEW_VEHICLE_CAPACITY')
  findAll(@Query() query: VehicleMasterListQueryDto) {
    return this.vehicleCapacitiesService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('VIEW_VEHICLE_CAPACITY')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.vehicleCapacitiesService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('UPDATE_VEHICLE_CAPACITY')
  update(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVehicleCapacityDto,
  ) {
    return this.vehicleCapacitiesService.update(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Patch(':id/status')
  @RequirePermissions('UPDATE_VEHICLE_CAPACITY')
  changeStatus(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeVehicleMasterStatusDto,
  ) {
    return this.vehicleCapacitiesService.changeStatus(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Delete(':id')
  @RequirePermissions('DELETE_VEHICLE_CAPACITY')
  remove(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.vehicleCapacitiesService.remove(
      id,
      buildActivityContext(user, req),
    );
  }
}
