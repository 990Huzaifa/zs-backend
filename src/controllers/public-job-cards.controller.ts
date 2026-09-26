import { Controller, Get, Param, StreamableFile } from '@nestjs/common';
import { JobCardsService } from '../services/job-cards.service';

/**
 * Unauthenticated job card view for shareable links / QR.
 * Example: GET /public/job-cards/JC000001
 * QR PNG:  GET /public/job-cards/JC000001/qr
 *
 * QR encodes: `{FRONTEND_URL}/public/job-cards/JC000001`
 */
@Controller('public/job-cards')
export class PublicJobCardsController {
  constructor(private readonly jobCardsService: JobCardsService) {}

  @Get(':code/qr')
  async downloadQr(@Param('code') code: string): Promise<StreamableFile> {
    const { buffer, filename } =
      await this.jobCardsService.getPublicQrPng(code);
    return new StreamableFile(buffer, {
      type: 'image/png',
      disposition: `inline; filename="${filename}"`,
    });
  }

  @Get(':code')
  findPublic(@Param('code') code: string) {
    return this.jobCardsService.findPublic(code);
  }
}
