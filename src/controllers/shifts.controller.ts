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
  CreateShiftDto,
  ShiftListQueryDto,
  UpdateShiftDto,
} from '../auth/dto/hr.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { buildActivityContext } from '../common/activity/activity-context';
import { User } from '../database/entities/user.entity';
import { ShiftsService } from '../services/shifts.service';

@Controller('shifts')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ShiftsController {
  constructor(private readonly shiftsService: ShiftsService) {}

  @Post()
  @RequirePermissions('CREATE_SHIFT')
  create(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: CreateShiftDto,
  ) {
    return this.shiftsService.create(dto, buildActivityContext(user, req));
  }

  @Get()
  @RequirePermissions('VIEW_SHIFT')
  findAll(@Query() query: ShiftListQueryDto) {
    return this.shiftsService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('VIEW_SHIFT')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.shiftsService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('UPDATE_SHIFT')
  update(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateShiftDto,
  ) {
    return this.shiftsService.update(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Delete(':id')
  @RequirePermissions('DELETE_SHIFT')
  remove(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.shiftsService.remove(id, buildActivityContext(user, req));
  }
}
