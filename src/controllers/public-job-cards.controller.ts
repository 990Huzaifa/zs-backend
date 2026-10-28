import {
  Controller,
  Get,
  Param,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { DocumentOnlineVerificationGuard } from '../auth/guards/document-online-verification.guard';
import { JobCardsService } from '../services/job-cards.service';
import { JobCardPdfService } from '../services/pdf/jobcard-pdf.service';

/**
 * Unauthenticated job card view for shareable links / QR.
 * Blocked when DOCUMENT_ONLINE_VERIFICATION.enabled is false.
 */
@Controller('public/job-cards')
@UseGuards(DocumentOnlineVerificationGuard)
export class PublicJobCardsController {
  constructor(
    private readonly jobCardsService: JobCardsService,
    private readonly jobCardPdfService: JobCardPdfService,
  ) {}

  @Get(':code/qr')
  async downloadQr(@Param('code') code: string): Promise<StreamableFile> {
    const { buffer, filename } =
      await this.jobCardsService.getPublicQrPng(code);
    return new StreamableFile(buffer, {
      type: 'image/png',
      disposition: `inline; filename="${filename}"`,
    });
  }

  @Get(':code/pdf')
  async downloadPdf(@Param('code') code: string): Promise<StreamableFile> {
    const { buffer, filename } =
      await this.jobCardPdfService.generateByCodeOrId(code);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${filename}"`,
    });
  }

  @Get(':code')
  findPublic(@Param('code') code: string) {
    return this.jobCardsService.findPublic(code);
  }
}
