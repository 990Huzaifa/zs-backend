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
  AssignedDriverListQueryDto,
  ChangeAssignedDriverStatusDto,
  CreateAssignedDriverDto,
  UpdateAssignedDriverDto,
} from '../auth/dto/assigned-driver.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { buildActivityContext } from '../common/activity/activity-context';
import { AssignedDriverStatus } from '../database/entities/vehicle.entity';
import { User } from '../database/entities/user.entity';
import { AssignedDriversService } from '../services/assigned-drivers.service';

@Controller('assigned-drivers')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class AssignedDriversController {
  constructor(
    private readonly assignedDriversService: AssignedDriversService,
  ) {}

  @Post()
  @RequirePermissions('CREATE_ASSIGNED_DRIVER')
  create(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: CreateAssignedDriverDto,
  ) {
    return this.assignedDriversService.create(
      dto,
      buildActivityContext(user, req),
    );
  }

  @Get()
  @RequirePermissions('VIEW_ASSIGNED_DRIVER')
  findAll(@Query() query: AssignedDriverListQueryDto) {
    return this.assignedDriversService.findAll(query);
  }

  @Get('by-vehicle/:vehicleId')
  @RequirePermissions('VIEW_ASSIGNED_DRIVER', 'VIEW_VEHICLE')
  findByVehicle(
    @Param('vehicleId', ParseUUIDPipe) vehicleId: string,
    @Query('status') status?: AssignedDriverStatus,
  ) {
    return this.assignedDriversService.findByVehicle(vehicleId, status);
  }

  @Get('by-driver/:driverId')
  @RequirePermissions('VIEW_ASSIGNED_DRIVER', 'VIEW_DRIVER')
  findByDriver(
    @Param('driverId', ParseUUIDPipe) driverId: string,
    @Query('status') status?: AssignedDriverStatus,
  ) {
    return this.assignedDriversService.findByDriver(driverId, status);
  }

  @Get(':id')
  @RequirePermissions('VIEW_ASSIGNED_DRIVER')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.assignedDriversService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('UPDATE_ASSIGNED_DRIVER')
  update(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAssignedDriverDto,
  ) {
    return this.assignedDriversService.update(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Patch(':id/status')
  @RequirePermissions('UPDATE_ASSIGNED_DRIVER')
  changeStatus(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeAssignedDriverStatusDto,
  ) {
    return this.assignedDriversService.changeStatus(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Delete(':id')
  @RequirePermissions('DELETE_ASSIGNED_DRIVER')
  remove(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.assignedDriversService.remove(
      id,
      buildActivityContext(user, req),
    );
  }
}
