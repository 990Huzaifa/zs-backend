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
import {
  AssignedVehicleListQueryDto,
  ChangeAssignedVehicleStatusDto,
  CreateAssignedVehicleDto,
  UpdateAssignedVehicleDto,
} from '../auth/dto/assigned-vehicle.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { buildActivityContext } from '../common/activity/activity-context';
import { AssignedVehicleStatus } from '../database/entities/driver.entity';
import { User } from '../database/entities/user.entity';
import { AssignedVehiclesService } from '../services/assigned-vehicles.service';

@Controller('assigned-vehicles')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class AssignedVehiclesController {
  constructor(
    private readonly assignedVehiclesService: AssignedVehiclesService,
  ) {}

  @Post()
  @RequirePermissions('CREATE_ASSIGNED_VEHICLE')
  create(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: CreateAssignedVehicleDto,
  ) {
    return this.assignedVehiclesService.create(
      dto,
      buildActivityContext(user, req),
    );
  }

  @Get()
  @RequirePermissions('VIEW_ASSIGNED_VEHICLE')
  findAll(@Query() query: AssignedVehicleListQueryDto) {
    return this.assignedVehiclesService.findAll(query);
  }

  @Get('by-driver/:driverId')
  @RequirePermissions('VIEW_ASSIGNED_VEHICLE', 'VIEW_DRIVER')
  findByDriver(
    @Param('driverId', ParseUUIDPipe) driverId: string,
    @Query('status') status?: AssignedVehicleStatus,
  ) {
    return this.assignedVehiclesService.findByDriver(driverId, status);
  }

  @Get('by-vehicle/:vehicleId')
  @RequirePermissions('VIEW_ASSIGNED_VEHICLE', 'VIEW_VEHICLE')
  findByVehicle(
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Query('status') status?: AssignedVehicleStatus,
  ) {
    return this.assignedVehiclesService.findByVehicle(vehicleId, status);
  }

  @Get(':id')
  @RequirePermissions('VIEW_ASSIGNED_VEHICLE')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.assignedVehiclesService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('UPDATE_ASSIGNED_VEHICLE')
  update(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAssignedVehicleDto,
  ) {
    return this.assignedVehiclesService.update(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Patch(':id/status')
  @RequirePermissions('UPDATE_ASSIGNED_VEHICLE')
  changeStatus(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeAssignedVehicleStatusDto,
  ) {
    return this.assignedVehiclesService.changeStatus(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Delete(':id')
  @RequirePermissions('DELETE_ASSIGNED_VEHICLE')
  remove(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.assignedVehiclesService.remove(
      id,
      buildActivityContext(user, req),
    );
  }
}
