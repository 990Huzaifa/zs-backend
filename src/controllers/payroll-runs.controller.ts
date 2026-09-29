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
  CalculatePayrollRunDto,
  CreatePayrollRunDto,
  PayrollRunListQueryDto,
  UpdatePayrollRunDto,
} from '../auth/dto/hr.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { buildActivityContext } from '../common/activity/activity-context';
import { User } from '../database/entities/user.entity';
import { PayrollRunsService } from '../services/payroll-runs.service';

@Controller('payroll-runs')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class PayrollRunsController {
  constructor(private readonly payrollRunsService: PayrollRunsService) {}

  @Post()
  @RequirePermissions('CREATE_PAYROLL_RUN')
  create(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: CreatePayrollRunDto,
  ) {
    return this.payrollRunsService.create(
      dto,
      buildActivityContext(user, req),
    );
  }

  @Get()
  @RequirePermissions('VIEW_PAYROLL_RUN')
  findAll(@Query() query: PayrollRunListQueryDto) {
    return this.payrollRunsService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('VIEW_PAYROLL_RUN')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.payrollRunsService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('UPDATE_PAYROLL_RUN')
  update(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePayrollRunDto,
  ) {
    return this.payrollRunsService.update(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Post(':id/calculate')
  @RequirePermissions('UPDATE_PAYROLL_RUN')
  calculate(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CalculatePayrollRunDto,
  ) {
    return this.payrollRunsService.calculate(
      id,
      dto ?? {},
      buildActivityContext(user, req),
    );
  }

  @Post(':id/approve')
  @RequirePermissions('APPROVE_PAYROLL_RUN')
  approve(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.payrollRunsService.approve(
      id,
      buildActivityContext(user, req),
    );
  }

  @Post(':id/mark-paid')
  @RequirePermissions('UPDATE_PAYROLL_RUN')
  markPaid(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.payrollRunsService.markPaid(
      id,
      buildActivityContext(user, req),
    );
  }

  @Post(':id/cancel')
  @RequirePermissions('UPDATE_PAYROLL_RUN')
  cancel(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.payrollRunsService.cancel(id, buildActivityContext(user, req));
  }

  @Delete(':id')
  @RequirePermissions('DELETE_PAYROLL_RUN')
  remove(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.payrollRunsService.remove(id, buildActivityContext(user, req));
  }
}
