import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permission.decorator';
import {
  PayslipListQueryDto,
  UpdatePayslipDto,
} from '../auth/dto/hr.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { buildActivityContext } from '../common/activity/activity-context';
import { User } from '../database/entities/user.entity';
import { PayslipsService } from '../services/payslips.service';

@Controller('payslips')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class PayslipsController {
  constructor(private readonly payslipsService: PayslipsService) {}

  @Get()
  @RequirePermissions('VIEW_PAYSLIP')
  findAll(@Query() query: PayslipListQueryDto) {
    return this.payslipsService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('VIEW_PAYSLIP')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.payslipsService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('UPDATE_PAYSLIP')
  update(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePayslipDto,
  ) {
    return this.payslipsService.update(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }
}
