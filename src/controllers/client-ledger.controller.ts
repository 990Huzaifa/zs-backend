import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RequirePermissions } from '../auth/decorators/require-permission.decorator';
import { ClientLedgerQueryDto } from '../auth/dto/client-ledger.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { ClientLedgerService } from '../services/client-ledger.service';

@Controller('client-ledger')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ClientLedgerController {
  constructor(private readonly clientLedgerService: ClientLedgerService) {}

  /**
   * Client AR statement — invoices (tax breakup) + payments + running balance.
   */
  @Get()
  @RequirePermissions('VIEW_CLIENT_LEDGER')
  getLedger(@Query() query: ClientLedgerQueryDto) {
    return this.clientLedgerService.getLedger(query);
  }
}
