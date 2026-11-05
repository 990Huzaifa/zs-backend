import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RequirePermissions } from '../auth/decorators/require-permission.decorator';
import { VendorTransactionSummaryQueryDto } from '../auth/dto/vendor-transaction-summary.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionGuard } from '../auth/guards/permission.guard';
import { VendorTransactionSummaryService } from '../services/vendor-transaction-summary.service';

@Controller('vendor-transaction-summary')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class VendorTransactionSummaryController {
  constructor(
    private readonly vendorTransactionSummaryService: VendorTransactionSummaryService,
  ) {}

  /**
   * Vendor CR-only statement (pump / PO). Same columns as ledger minus DR.
   */
  @Get()
  @RequirePermissions('LIST_VENDOR_LEDGER', 'VIEW_VENDOR_LEDGER')
  getSummary(@Query() query: VendorTransactionSummaryQueryDto) {
    return this.vendorTransactionSummaryService.getSummary(query);
  }
}
