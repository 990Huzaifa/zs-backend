import {
  Controller,
  Get,
  Param,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { DocumentOnlineVerificationGuard } from '../auth/guards/document-online-verification.guard';
import { BiltyFreightsService } from '../services/bilty-freights.service';

/**
 * Unauthenticated bilty freight voucher view for shareable links.
 * Blocked when DOCUMENT_ONLINE_VERIFICATION.enabled is false.
 */
@Controller('public/bilty-freights')
@UseGuards(DocumentOnlineVerificationGuard)
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
