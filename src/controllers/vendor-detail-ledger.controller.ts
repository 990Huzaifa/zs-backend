import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RequirePermissions } from '../auth/decorators/require-permission.decorator';
import { VendorDetailLedgerQueryDto } from '../auth/dto/vendor-detail-ledger.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { VendorDetailLedgerService } from '../services/vendor-detail-ledger.service';

@Controller('vendor-detail-ledger')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class VendorDetailLedgerController {
  constructor(
    private readonly vendorDetailLedgerService: VendorDetailLedgerService,
  ) {}

  /**
   * Detail Ledger — purchases (cash/HSD) + payments in one response.
   * Use instead of calling /vendor-transaction-summary + /vendor-ledger together.
   */
  @Get()
  @RequirePermissions('LIST_VENDOR_LEDGER', 'VIEW_VENDOR_LEDGER')
  getDetailLedger(@Query() query: VendorDetailLedgerQueryDto) {
    return this.vendorDetailLedgerService.getDetailLedger(query);
  }
}
