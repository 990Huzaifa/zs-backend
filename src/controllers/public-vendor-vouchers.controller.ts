import {
  Controller,
  Get,
  Param,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { DocumentOnlineVerificationGuard } from '../auth/guards/document-online-verification.guard';
import { VendorVouchersService } from '../services/vouchers/vendor.service';

/**
 * Unauthenticated vendor voucher view for shareable links.
 * Blocked when DOCUMENT_ONLINE_VERIFICATION.enabled is false.
 */
@Controller('public/vendor-vouchers')
@UseGuards(DocumentOnlineVerificationGuard)
export class PublicVendorVouchersController {
  constructor(private readonly vendorVouchersService: VendorVouchersService) {}

  @Get(':code/qr')
  async downloadQr(@Param('code') code: string): Promise<StreamableFile> {
    const { buffer, filename } =
      await this.vendorVouchersService.getPublicQrPng(code);
    return new StreamableFile(buffer, {
      type: 'image/png',
      disposition: `inline; filename="${filename}"`,
    });
  }

  @Get(':code')
  findPublic(@Param('code') code: string) {
    return this.vendorVouchersService.findPublic(code);
  }
}
