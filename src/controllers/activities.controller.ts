import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RequirePermissions } from '../auth/decorators/require-permission.decorator';
import { ActivityListQueryDto } from '../auth/dto/activity.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { ActivitiesService } from '../services/activities.service';

@Controller('activities')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  @Get()
  @RequirePermissions('VIEW_ACTIVITY')
  findAll(@Query() query: ActivityListQueryDto) {
    return this.activitiesService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('VIEW_ACTIVITY')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.activitiesService.findOne(id);
  }
}
