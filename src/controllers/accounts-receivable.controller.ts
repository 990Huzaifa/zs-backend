import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RequirePermissions } from '../auth/decorators/require-permission.decorator';
import { AccountsReceivableListQueryDto } from '../auth/dto/accounts-receivable.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { AccountsReceivableService } from '../services/accounts-receivable.service';

@Controller('accounts-receivable')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class AccountsReceivableController {
  constructor(
    private readonly accountsReceivableService: AccountsReceivableService,
  ) {}

  /**
   * Party-wise AR balances (customer receivables) with summary cards.
   * Optional dateFrom/dateTo — balance as of dateTo; period movement when dateFrom set.
   */
  @Get()
  @RequirePermissions('VIEW_CLIENT')
  findAll(@Query() query: AccountsReceivableListQueryDto) {
    return this.accountsReceivableService.findAll(query);
  }
}
