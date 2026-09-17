import { Controller, Get, Param, StreamableFile } from '@nestjs/common';
import { ClientInvoicesService } from '../services/client-invoices.service';
import { InvoicePdfService } from '../services/pdf/invoice-pdf.service';

/**
 * Unauthenticated client invoice view for shareable / printable links.
 * Example: GET /public/client-invoices/CI000001
 * QR PNG:  GET /public/client-invoices/CI000001/qr
 * PDF:     GET /public/client-invoices/CI000001/pdf
 *
 * QR encodes the frontend public page:
 *   `{FRONTEND_URL}/public/client-invoices/CI000001`
 */
@Controller('public/client-invoices')
export class PublicClientInvoicesController {
  constructor(
    private readonly clientInvoicesService: ClientInvoicesService,
    private readonly invoicePdfService: InvoicePdfService,
  ) {}

  @Get(':code/qr')
  async downloadQr(@Param('code') code: string): Promise<StreamableFile> {
    const { buffer, filename } =
      await this.clientInvoicesService.getPublicQrPng(code);
    return new StreamableFile(buffer, {
      type: 'image/png',
      disposition: `inline; filename="${filename}"`,
    });
  }

  @Get(':code/pdf')
  async downloadPdf(@Param('code') code: string): Promise<StreamableFile> {
    const { buffer, filename } =
      await this.invoicePdfService.generateByCodeOrId(code);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${filename}"`,
    });
  }

  @Get(':code')
  findPublic(@Param('code') code: string) {
    return this.clientInvoicesService.findPublic(code);
  }
}
