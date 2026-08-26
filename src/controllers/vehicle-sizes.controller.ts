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
  CreateVehicleSizeDto,
  UpdateVehicleSizeDto,
} from '../auth/dto/vehicle-master.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { VehicleSizesService } from '../services/vehicle-sizes.service';

@Controller('vehicle-sizes')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class VehicleSizesController {
  constructor(private readonly vehicleSizesService: VehicleSizesService) {}

  @Post()
  @RequirePermissions('CREATE_VEHICLE_SIZE')
  create(@Body() dto: CreateVehicleSizeDto) {
    return this.vehicleSizesService.create(dto);
  }

  @Get()
  @RequirePermissions('VIEW_VEHICLE_SIZE')
  findAll(@Query() query: VehicleMasterListQueryDto) {
    return this.vehicleSizesService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('VIEW_VEHICLE_SIZE')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.vehicleSizesService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('UPDATE_VEHICLE_SIZE')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVehicleSizeDto,
  ) {
    return this.vehicleSizesService.update(id, dto);
  }

  @Patch(':id/status')
  @RequirePermissions('UPDATE_VEHICLE_SIZE')
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeVehicleMasterStatusDto,
  ) {
    return this.vehicleSizesService.changeStatus(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('DELETE_VEHICLE_SIZE')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.vehicleSizesService.remove(id);
  }
}
