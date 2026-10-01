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
  BulkCreateShiftAssignmentsDto,
  CreateShiftAssignmentDto,
  ShiftAssignmentListQueryDto,
  UpdateShiftAssignmentDto,
} from '../auth/dto/hr.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { buildActivityContext } from '../common/activity/activity-context';
import { User } from '../database/entities/user.entity';
import { ShiftAssignmentsService } from '../services/shift-assignments.service';

@Controller('shift-assignments')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ShiftAssignmentsController {
  constructor(
    private readonly shiftAssignmentsService: ShiftAssignmentsService,
  ) {}

  @Post()
  @RequirePermissions('CREATE_SHIFT_ASSIGNMENT')
  create(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: CreateShiftAssignmentDto,
  ) {
    return this.shiftAssignmentsService.create(
      dto,
      buildActivityContext(user, req),
    );
  }

  @Post('bulk')
  @RequirePermissions('CREATE_SHIFT_ASSIGNMENT')
  bulkCreate(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: BulkCreateShiftAssignmentsDto,
  ) {
    return this.shiftAssignmentsService.bulkCreate(
      dto,
      buildActivityContext(user, req),
    );
  }

  @Get()
  @RequirePermissions('VIEW_SHIFT_ASSIGNMENT')
  findAll(@Query() query: ShiftAssignmentListQueryDto) {
    return this.shiftAssignmentsService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('VIEW_SHIFT_ASSIGNMENT')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.shiftAssignmentsService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('UPDATE_SHIFT_ASSIGNMENT')
  update(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateShiftAssignmentDto,
  ) {
    return this.shiftAssignmentsService.update(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Delete(':id')
  @RequirePermissions('DELETE_SHIFT_ASSIGNMENT')
  remove(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.shiftAssignmentsService.remove(
      id,
      buildActivityContext(user, req),
    );
  }
}
