import { Controller, Get, Param, StreamableFile } from '@nestjs/common';
import { VendorVouchersService } from '../services/vouchers/vendor.service';

/**
 * Unauthenticated vendor voucher view for shareable links.
 * Example: GET /public/vendor-vouchers/VV000001
 * QR PNG:  GET /public/vendor-vouchers/VV000001/qr
 *
 * QR encodes: `{FRONTEND_URL}/public/vendor-vouchers/VV000001`
 */
@Controller('public/vendor-vouchers')
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
