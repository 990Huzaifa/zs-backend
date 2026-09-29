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
  CreatePayPeriodDto,
  PayPeriodListQueryDto,
  UpdatePayPeriodDto,
} from '../auth/dto/hr.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { buildActivityContext } from '../common/activity/activity-context';
import { User } from '../database/entities/user.entity';
import { PayPeriodsService } from '../services/pay-periods.service';

@Controller('pay-periods')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class PayPeriodsController {
  constructor(private readonly payPeriodsService: PayPeriodsService) {}

  @Post()
  @RequirePermissions('CREATE_PAY_PERIOD')
  create(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: CreatePayPeriodDto,
  ) {
    return this.payPeriodsService.create(dto, buildActivityContext(user, req));
  }

  @Get()
  @RequirePermissions('VIEW_PAY_PERIOD')
  findAll(@Query() query: PayPeriodListQueryDto) {
    return this.payPeriodsService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('VIEW_PAY_PERIOD')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.payPeriodsService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('UPDATE_PAY_PERIOD')
  update(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePayPeriodDto,
  ) {
    return this.payPeriodsService.update(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Post(':id/lock')
  @RequirePermissions('UPDATE_PAY_PERIOD')
  lock(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.payPeriodsService.lock(id, buildActivityContext(user, req));
  }

  @Post(':id/close')
  @RequirePermissions('UPDATE_PAY_PERIOD')
  close(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.payPeriodsService.close(id, buildActivityContext(user, req));
  }

  @Delete(':id')
  @RequirePermissions('DELETE_PAY_PERIOD')
  remove(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.payPeriodsService.remove(id, buildActivityContext(user, req));
  }
}
