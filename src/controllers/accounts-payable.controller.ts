import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RequirePermissions } from '../auth/decorators/require-permission.decorator';
import { AccountsPayableListQueryDto } from '../auth/dto/accounts-payable.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { AccountsPayableService } from '../services/accounts-payable.service';

@Controller('accounts-payable')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class AccountsPayableController {
  constructor(
    private readonly accountsPayableService: AccountsPayableService,
  ) {}

  /**
   * Party-wise AP balances (vendor payables) with summary cards.
   * Optional dateFrom/dateTo — balance as of dateTo; period movement when dateFrom set.
   */
  @Get()
  @RequirePermissions('VIEW_ACCOUNTS_PAYABLE')
  findAll(@Query() query: AccountsPayableListQueryDto) {
    return this.accountsPayableService.findAll(query);
  }
}
