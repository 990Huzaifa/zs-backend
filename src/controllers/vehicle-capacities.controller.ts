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
  UseGuards,
} from '@nestjs/common';
import { RequirePermissions } from '../auth/decorators/require-permission.decorator';
import { VehicleMasterListQueryDto } from '../auth/dto/vehicle-master-list-query.dto';
import {
  ChangeVehicleMasterStatusDto,
  CreateVehicleCapacityDto,
  UpdateVehicleCapacityDto,
} from '../auth/dto/vehicle-master.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { VehicleCapacitiesService } from '../services/vehicle-capacities.service';

@Controller('vehicle-capacities')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class VehicleCapacitiesController {
  constructor(
    private readonly vehicleCapacitiesService: VehicleCapacitiesService,
  ) {}

  @Post()
  @RequirePermissions('CREATE_VEHICLE_CAPACITY')
  create(@Body() dto: CreateVehicleCapacityDto) {
    return this.vehicleCapacitiesService.create(dto);
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
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVehicleCapacityDto,
  ) {
    return this.vehicleCapacitiesService.update(id, dto);
  }

  @Patch(':id/status')
  @RequirePermissions('UPDATE_VEHICLE_CAPACITY')
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeVehicleMasterStatusDto,
  ) {
    return this.vehicleCapacitiesService.changeStatus(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('DELETE_VEHICLE_CAPACITY')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.vehicleCapacitiesService.remove(id);
  }
}
