import { Controller, Get, Param, StreamableFile } from '@nestjs/common';
import { BiltyFreightsService } from '../services/bilty-freights.service';

/**
 * Unauthenticated bilty freight voucher view for shareable links.
 * Example: GET /public/bilty-freights/BF000001
 * QR PNG:  GET /public/bilty-freights/BF000001/qr
 *
 * QR encodes: `{FRONTEND_URL}/public/bilty-freights/BF000001`
 */
@Controller('public/bilty-freights')
export class PublicBiltyFreightsController {
  constructor(private readonly biltyFreightsService: BiltyFreightsService) {}

  @Get(':code/qr')
  async downloadQr(@Param('code') code: string): Promise<StreamableFile> {
    const { buffer, filename } =
      await this.biltyFreightsService.getPublicQrPng(code);
    return new StreamableFile(buffer, {
      type: 'image/png',
      disposition: `inline; filename="${filename}"`,
    });
  }

  @Get(':code')
  findPublic(@Param('code') code: string) {
    return this.biltyFreightsService.findPublic(code);
  }
}
