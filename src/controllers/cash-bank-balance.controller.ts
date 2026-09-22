import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RequirePermissions } from '../auth/decorators/require-permission.decorator';
import { CashBankBalanceListQueryDto } from '../auth/dto/cash-bank-balance.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { CashBankBalanceService } from '../services/cash-bank-balance.service';

@Controller('cash-bank-balance')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class CashBankBalanceController {
  constructor(
    private readonly cashBankBalanceService: CashBankBalanceService,
  ) {}

  /**
   * Cash & Bank leaf balances with summary cards.
   * Optional dateFrom/dateTo — balance as of dateTo; period movement when dateFrom set.
   */
  @Get()
  @RequirePermissions('VIEW_CASH_BANK_BALANCE')
  findAll(@Query() query: CashBankBalanceListQueryDto) {
    return this.cashBankBalanceService.findAll(query);
  }
}
