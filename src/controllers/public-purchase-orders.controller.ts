import { Controller, Get, Param, StreamableFile } from '@nestjs/common';
import { PurchaseOrdersService } from '../services/purchase-orders.service';
import { PurchaseOrderPdfService } from '../services/pdf/purchaseorder-pdf.service';

/**
 * Unauthenticated purchase order view for shareable links / QR.
 * Example: GET /public/purchase-orders/PO000001
 * QR PNG:  GET /public/purchase-orders/PO000001/qr
 * PDF:     GET /public/purchase-orders/PO000001/pdf
 *
 * QR encodes: `{FRONTEND_URL}/public/purchase-orders/PO000001`
 */
@Controller('public/purchase-orders')
export class PublicPurchaseOrdersController {
  constructor(
    private readonly purchaseOrdersService: PurchaseOrdersService,
    private readonly purchaseOrderPdfService: PurchaseOrderPdfService,
  ) {}

  @Get(':code/qr')
  async downloadQr(@Param('code') code: string): Promise<StreamableFile> {
    const { buffer, filename } =
      await this.purchaseOrdersService.getPublicQrPng(code);
    return new StreamableFile(buffer, {
      type: 'image/png',
      disposition: `inline; filename="${filename}"`,
    });
  }

  @Get(':code/pdf')
  async downloadPdf(@Param('code') code: string): Promise<StreamableFile> {
    const { buffer, filename } =
      await this.purchaseOrderPdfService.generateByCodeOrId(code);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${filename}"`,
    });
  }

  @Get(':code')
  findPublic(@Param('code') code: string) {
    return this.purchaseOrdersService.findPublic(code);
  }
}
