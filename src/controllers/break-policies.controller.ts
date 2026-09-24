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
  CreateBreakPolicyDto,
  HrListQueryDto,
  UpdateBreakPolicyDto,
} from '../auth/dto/hr.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { buildActivityContext } from '../common/activity/activity-context';
import { User } from '../database/entities/user.entity';
import { BreakPoliciesService } from '../services/break-policies.service';

@Controller('break-policies')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class BreakPoliciesController {
  constructor(private readonly breakPoliciesService: BreakPoliciesService) {}

  @Post()
  @RequirePermissions('CREATE_BREAK_POLICY')
  create(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: CreateBreakPolicyDto,
  ) {
    return this.breakPoliciesService.create(
      dto,
      buildActivityContext(user, req),
    );
  }

  @Get()
  @RequirePermissions('VIEW_BREAK_POLICY')
  findAll(@Query() query: HrListQueryDto) {
    return this.breakPoliciesService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('VIEW_BREAK_POLICY')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.breakPoliciesService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('UPDATE_BREAK_POLICY')
  update(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBreakPolicyDto,
  ) {
    return this.breakPoliciesService.update(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Delete(':id')
  @RequirePermissions('DELETE_BREAK_POLICY')
  remove(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.breakPoliciesService.remove(
      id,
      buildActivityContext(user, req),
    );
  }
}
