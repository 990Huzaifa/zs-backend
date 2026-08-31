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
  CreateTripDriverDto,
  ReplaceTripDriversDto,
  TripDriverListQueryDto,
} from '../auth/dto/trip-driver.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { buildActivityContext } from '../common/activity/activity-context';
import { User } from '../database/entities/user.entity';
import { TripDriversService } from '../services/trip-drivers.service';

@Controller('trips/:tripId/drivers')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class TripDriversController {
  constructor(private readonly tripDriversService: TripDriversService) {}

  @Post()
  @RequirePermissions('UPDATE_TRIP')
  create(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @Body() dto: CreateTripDriverDto,
  ) {
    return this.tripDriversService.create(
      tripId,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Get()
  @RequirePermissions('VIEW_TRIP')
  findByTrip(
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @Query() query: TripDriverListQueryDto,
  ) {
    return this.tripDriversService.findByTrip(tripId, query);
  }

  @Get(':id')
  @RequirePermissions('VIEW_TRIP')
  findOne(
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tripDriversService.findOne(tripId, id);
  }

  @Put()
  @RequirePermissions('UPDATE_TRIP')
  replace(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @Body() dto: ReplaceTripDriversDto,
  ) {
    return this.tripDriversService.replace(
      tripId,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Delete(':id')
  @RequirePermissions('UPDATE_TRIP')
  remove(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tripDriversService.remove(
      tripId,
      id,
      buildActivityContext(user, req),
    );
  }
}
