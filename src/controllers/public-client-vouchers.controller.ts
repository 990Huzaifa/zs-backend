import { Controller, Get, Param, StreamableFile } from '@nestjs/common';
import { ClientVouchersService } from '../services/vouchers/client.service';

/**
 * Unauthenticated client voucher view for shareable links.
 * Example: GET /public/client-vouchers/CLV000001
 * QR PNG:  GET /public/client-vouchers/CLV000001/qr
 *
 * QR encodes: `{FRONTEND_URL}/public/client-vouchers/CLV000001`
 */
@Controller('public/client-vouchers')
export class PublicClientVouchersController {
  constructor(private readonly clientVouchersService: ClientVouchersService) {}

  @Get(':code/qr')
  async downloadQr(@Param('code') code: string): Promise<StreamableFile> {
    const { buffer, filename } =
      await this.clientVouchersService.getPublicQrPng(code);
    return new StreamableFile(buffer, {
      type: 'image/png',
      disposition: `inline; filename="${filename}"`,
    });
  }

  @Get(':code')
  findPublic(@Param('code') code: string) {
    return this.clientVouchersService.findPublic(code);
  }
}
