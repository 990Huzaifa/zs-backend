import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RequirePermissions } from '../auth/decorators/require-permission.decorator';
import { VendorLedgerQueryDto } from '../auth/dto/vendor-ledger.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { VendorLedgerService } from '../services/vendor-ledger.service';

@Controller('vendor-ledger')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class VendorLedgerController {
  constructor(private readonly vendorLedgerService: VendorLedgerService) {}

  /**
   * Vendor AP statement — trip pump expenses (cash/HSD) + vouchers + running balance.
   */
  @Get()
  @RequirePermissions('VIEW_VENDOR_LEDGER')
  getLedger(@Query() query: VendorLedgerQueryDto) {
    return this.vendorLedgerService.getLedger(query);
  }
}
