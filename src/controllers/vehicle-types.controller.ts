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
  CreateVehicleTypeDto,
  UpdateVehicleTypeDto,
} from '../auth/dto/vehicle-master.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { VehicleTypesService } from '../services/vehicle-types.service';

@Controller('vehicle-types')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class VehicleTypesController {
  constructor(private readonly vehicleTypesService: VehicleTypesService) {}

  @Post()
  @RequirePermissions('CREATE_VEHICLE_TYPE')
  create(@Body() dto: CreateVehicleTypeDto) {
    return this.vehicleTypesService.create(dto);
  }

  @Get()
  @RequirePermissions('VIEW_VEHICLE_TYPE')
  findAll(@Query() query: VehicleMasterListQueryDto) {
    return this.vehicleTypesService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('VIEW_VEHICLE_TYPE')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.vehicleTypesService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('UPDATE_VEHICLE_TYPE')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVehicleTypeDto,
  ) {
    return this.vehicleTypesService.update(id, dto);
  }

  @Patch(':id/status')
  @RequirePermissions('UPDATE_VEHICLE_TYPE')
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeVehicleMasterStatusDto,
  ) {
    return this.vehicleTypesService.changeStatus(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('DELETE_VEHICLE_TYPE')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.vehicleTypesService.remove(id);
  }
}
