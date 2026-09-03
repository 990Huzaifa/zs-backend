import { Controller, Get, Header, Param, StreamableFile } from '@nestjs/common';
import { BiltyPdfService } from '../services/bilty-pdf.service';
import { BiltysService } from '../services/biltys.service';

/**
 * Unauthenticated bilty view for shareable / printable links.
 * Example: GET /public/biltys/ZS000001
 * PDF:     GET /public/biltys/ZS000001/pdf
 */
@Controller('public/biltys')
export class PublicBiltysController {
  constructor(
    private readonly biltysService: BiltysService,
    private readonly biltyPdfService: BiltyPdfService,
  ) {}

  @Get(':code/pdf')
  @Header('Content-Type', 'application/pdf')
  async downloadPdf(@Param('code') code: string): Promise<StreamableFile> {
    const { buffer, filename } =
      await this.biltyPdfService.generateByCodeOrId(code);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${filename}"`,
    });
  }

  @Get(':code')
  findPublic(@Param('code') code: string) {
    return this.biltysService.findPublic(code);
  }
}
