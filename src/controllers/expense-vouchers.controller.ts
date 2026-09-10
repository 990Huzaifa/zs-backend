import {
  Body,
  Controller,
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
  ChangeExpenseVoucherStatusDto,
  CreateExpenseVoucherBatchDto,
  ExpenseVoucherListQueryDto,
  UpdateExpenseVoucherDto,
} from '../auth/dto/expense-voucher.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { buildActivityContext } from '../common/activity/activity-context';
import { User } from '../database/entities/user.entity';
import { ExpenseVouchersService } from '../services/vouchers/expense.service';

@Controller('expense-vouchers')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ExpenseVouchersController {
  constructor(
    private readonly expenseVouchersService: ExpenseVouchersService,
  ) {}

  @Post()
  @RequirePermissions('CREATE_EXPENSE_VOUCHER')
  create(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Body() dto: CreateExpenseVoucherBatchDto,
  ) {
    return this.expenseVouchersService.createBatch(
      dto,
      buildActivityContext(user, req),
    );
  }

  @Get()
  @RequirePermissions('VIEW_EXPENSE_VOUCHER')
  findAll(@Query() query: ExpenseVoucherListQueryDto) {
    return this.expenseVouchersService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('VIEW_EXPENSE_VOUCHER')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.expenseVouchersService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('UPDATE_EXPENSE_VOUCHER')
  update(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExpenseVoucherDto,
  ) {
    return this.expenseVouchersService.update(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }

  @Patch(':id/status')
  @RequirePermissions('UPDATE_EXPENSE_VOUCHER')
  changeStatus(
    @CurrentUser() user: User,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeExpenseVoucherStatusDto,
  ) {
    return this.expenseVouchersService.changeStatus(
      id,
      dto,
      buildActivityContext(user, req),
    );
  }
}
