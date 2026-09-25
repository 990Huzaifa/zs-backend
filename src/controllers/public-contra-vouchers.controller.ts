import { Controller, Get, Param, StreamableFile } from '@nestjs/common';
import { ContraVouchersService } from '../services/vouchers/contra.service';

/**
 * Unauthenticated contra voucher view for shareable links.
 * Example: GET /public/contra-vouchers/CV000001
 * QR PNG:  GET /public/contra-vouchers/CV000001/qr
 *
 * QR encodes: `{FRONTEND_URL}/public/contra-vouchers/CV000001`
 */
@Controller('public/contra-vouchers')
export class PublicContraVouchersController {
  constructor(private readonly contraVouchersService: ContraVouchersService) {}

  @Get(':code/qr')
  async downloadQr(@Param('code') code: string): Promise<StreamableFile> {
    const { buffer, filename } =
      await this.contraVouchersService.getPublicQrPng(code);
    return new StreamableFile(buffer, {
      type: 'image/png',
      disposition: `inline; filename="${filename}"`,
    });
  }

  @Get(':code')
  findPublic(@Param('code') code: string) {
    return this.contraVouchersService.findPublic(code);
  }
}
