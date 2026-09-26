import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import PDFDocument from 'pdfkit';
import { Repository } from 'typeorm';
import { buildPublicQrPngBuffer } from '../../common/utils/public-link.util';
import {
  PurchaseOrder,
  PurchaseOrderReceivingStatus,
  PurchaseOrderStatus,
} from '../../database/entities/maintenance/purchase-order.entity';
import { PurchaseQuotationItemType } from '../../database/entities/maintenance/purchase-quotation.entity';
import { SystemSetting } from '../../database/entities/system-setting.entity';
import {
  amountInWords,
  dash,
  drawLogoFallback,
  drawTableHeader,
  fetchLogoBuffer,
  formatPrintDate,
  MAINT_MARGIN,
  MAINT_MUTED,
  MAINT_NAVY,
  MAINT_PAGE_H,
  MAINT_PAGE_W,
  MaintPrintBranding,
  money,
  moneyPk,
  resolveMaintBranding,
  titleCaseLabel,
} from './maintenance-pdf.util';

const PO_STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  [PurchaseOrderStatus.DRAFT]: 'Draft',
  [PurchaseOrderStatus.PENDING_APPROVAL]: 'Pending Approval',
  [PurchaseOrderStatus.APPROVED]: 'Approved',
  [PurchaseOrderStatus.REJECTED]: 'Rejected',
  [PurchaseOrderStatus.CANCELLED]: 'Cancelled',
};

const PO_RECEIVING_LABELS: Record<PurchaseOrderReceivingStatus, string> = {
  [PurchaseOrderReceivingStatus.NOT_RECEIVED]: 'Not Received',
  [PurchaseOrderReceivingStatus.PARTIALLY_RECEIVED]: 'Partially Received',
  [PurchaseOrderReceivingStatus.RECEIVED]: 'Received',
};

const ITEM_TYPE_LABELS: Record<PurchaseQuotationItemType, string> = {
  [PurchaseQuotationItemType.PRODUCT]: 'Product',
  [PurchaseQuotationItemType.SERVICE]: 'Service',
};

export type PurchaseOrderPdfResult = {
  buffer: Buffer;
  filename: string;
  purchaseOrderNo: string;
};

@Injectable()
export class PurchaseOrderPdfService {
  private readonly logger = new Logger(PurchaseOrderPdfService.name);

  constructor(
    @InjectRepository(PurchaseOrder)
    private readonly poRepo: Repository<PurchaseOrder>,
    @InjectRepository(SystemSetting)
    private readonly settingRepo: Repository<SystemSetting>,
  ) {}

  async generateById(id: string): Promise<PurchaseOrderPdfResult> {
    const po = await this.load({ id });
    if (!po) throw new NotFoundException('Purchase order not found');
    return this.renderPdf(po);
  }

  async generateByCodeOrId(codeOrId: string): Promise<PurchaseOrderPdfResult> {
    const key = codeOrId.trim();
    if (!key) throw new NotFoundException('Purchase order not found');

    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    const po = uuidRe.test(key)
      ? await this.load({ id: key })
      : await this.load({ purchaseOrderNo: key.toUpperCase() });

    if (!po) throw new NotFoundException('Purchase order not found');
    return this.renderPdf(po);
  }

  private async renderPdf(po: PurchaseOrder): Promise<PurchaseOrderPdfResult> {
    try {
      const branding = await resolveMaintBranding(this.settingRepo);
      const serial = po.purchaseOrderNo || po.id;
      const qrPng = await buildPublicQrPngBuffer('purchase-orders', serial);
      const logoBuf = await fetchLogoBuffer(branding.logoUrl, this.logger);

      const buffer = await new Promise<Buffer>((resolve, reject) => {
        const doc = new PDFDocument({
          size: 'A4',
          margin: MAINT_MARGIN,
          info: {
            Title: `Purchase Order ${serial}`,
            Author: branding.name,
          },
        });
        const chunks: Buffer[] = [];
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        this.drawPage(doc, po, branding, qrPng, logoBuf, serial);
        doc.end();
      });

      return {
        buffer,
        filename: `purchase-order-${serial}.pdf`,
        purchaseOrderNo: serial,
      };
    } catch (err) {
      this.logger.error(
        `Failed to generate purchase order PDF for ${po.purchaseOrderNo}`,
        err instanceof Error ? err.stack : String(err),
      );
      throw new InternalServerErrorException(
        'Failed to generate purchase order PDF',
      );
    }
  }

  private drawPage(
    doc: PDFKit.PDFDocument,
    po: PurchaseOrder,
    branding: MaintPrintBranding,
    qrPng: Buffer,
    logoBuf: Buffer | null,
    serial: string,
  ) {
    const contentW = MAINT_PAGE_W - MAINT_MARGIN * 2;
    const grand = Number(po.grandTotal) || 0;

    let y = this.drawDocHeader(
      doc,
      branding,
      logoBuf,
      qrPng,
      'Purchase Order',
      formatPrintDate(po.orderDate),
      serial,
    );

    // Parties
    const partyW = (contentW - 12) / 2;
    const vendorName =
      po.vendor?.vendorName?.trim() || po.vendor?.ownerName?.trim() || '—';
    this.drawPartyBox(doc, MAINT_MARGIN, y, partyW, 'Order by', branding.name, [
      dash(branding.addressLine),
      dash(branding.contactLine || branding.email || branding.phone),
    ]);

    const toLines = [
      `Order #: ${serial}`,
      `Status: ${PO_STATUS_LABELS[po.status] ?? titleCaseLabel(po.status)}`,
    ];
    if (po.expectedDeliveryDate) {
      toLines.push(`Expected: ${formatPrintDate(po.expectedDeliveryDate)}`);
    }
    toLines.push(
      `Receiving: ${PO_RECEIVING_LABELS[po.receivingStatus] ?? titleCaseLabel(po.receivingStatus)}`,
    );
    if (po.purchaseQuotation?.quotationNo) {
      toLines.push(`PQ: ${po.purchaseQuotation.quotationNo}`);
    }
    if (po.purchaseQuotation?.jobCard?.jobCardNo) {
      toLines.push(`Job card: ${po.purchaseQuotation.jobCard.jobCardNo}`);
    }
    this.drawPartyBox(
      doc,
      MAINT_MARGIN + partyW + 12,
      y,
      partyW,
      'Order to',
      vendorName,
      toLines,
    );
    y += 100;

    // Items table
    const cols = [
      { x: MAINT_MARGIN, w: contentW * 0.54, label: 'Item # / Item description' },
      {
        x: MAINT_MARGIN + contentW * 0.54,
        w: contentW * 0.12,
        label: 'Qty.',
        align: 'right' as const,
      },
      {
        x: MAINT_MARGIN + contentW * 0.66,
        w: contentW * 0.16,
        label: 'Rate',
        align: 'right' as const,
      },
      {
        x: MAINT_MARGIN + contentW * 0.82,
        w: contentW * 0.18,
        label: 'Amount',
        align: 'right' as const,
      },
    ];
    y = drawTableHeader(doc, y, cols);

    const items = po.items ?? [];
    if (!items.length) {
      doc
        .fillColor(MAINT_MUTED)
        .font('Helvetica')
        .fontSize(10)
        .text('No line items', MAINT_MARGIN + 6, y + 10);
      y += 28;
    } else {
      items.forEach((it, i) => {
        if (y > MAINT_PAGE_H - 220) {
          doc.addPage({ size: 'A4', margin: MAINT_MARGIN });
          y = MAINT_MARGIN;
          y = drawTableHeader(doc, y, cols);
        }
        const qty = Number(it.quantity) || 0;
        const rate = Number(it.unitPrice) || 0;
        const line = Number(it.totalAmount) || qty * rate;
        const typeLabel =
          ITEM_TYPE_LABELS[it.itemType] ?? titleCaseLabel(it.itemType);
        const title = `${i + 1}. ${it.itemName || '—'}`;
        const sub = `${typeLabel}${it.description ? ` · ${it.description}` : ''}`;

        const titleH = doc.heightOfString(title, { width: cols[0].w - 12 });
        const subH = doc.heightOfString(sub, { width: cols[0].w - 12 });
        const rowH = Math.max(24, titleH + subH + 10);

        if (i % 2 === 1) {
          doc.rect(MAINT_MARGIN, y, contentW, rowH).fill('#f9fafb');
        }

        doc
          .fillColor('#111827')
          .font('Helvetica')
          .fontSize(10)
          .text(title, cols[0].x + 6, y + 5, { width: cols[0].w - 12 });
        doc
          .fillColor(MAINT_MUTED)
          .fontSize(8)
          .text(sub, cols[0].x + 6, y + 5 + titleH, {
            width: cols[0].w - 12,
          });
        doc
          .fillColor('#111827')
          .fontSize(10)
          .text(money(qty), cols[1].x + 4, y + 5, {
            width: cols[1].w - 8,
            align: 'right',
          });
        doc.text(moneyPk(rate), cols[2].x + 4, y + 5, {
          width: cols[2].w - 8,
          align: 'right',
        });
        doc.text(moneyPk(line), cols[3].x + 4, y + 5, {
          width: cols[3].w - 8,
          align: 'right',
        });

        doc
          .moveTo(MAINT_MARGIN, y + rowH)
          .lineTo(MAINT_PAGE_W - MAINT_MARGIN, y + rowH)
          .strokeColor('#e5e7eb')
          .lineWidth(0.5)
          .stroke();
        y += rowH;
      });
    }

    // Footer: terms + totals
    y += 16;
    if (y > MAINT_PAGE_H - 200) {
      doc.addPage({ size: 'A4', margin: MAINT_MARGIN });
      y = MAINT_MARGIN;
    }

    const leftW = contentW * 0.55;
    const rightX = MAINT_MARGIN + leftW + 16;
    const rightW = contentW - leftW - 16;

    doc
      .fillColor('#111827')
      .font('Helvetica-Bold')
      .fontSize(10)
      .text('Terms and Conditions', MAINT_MARGIN, y);
    const terms = po.termsAndConditions?.trim()
      ? [po.termsAndConditions.trim()]
      : [
          'Please deliver goods as per the expected delivery date.',
          'Quote the purchase order number on all delivery documents.',
        ];
    let ty = y + 14;
    doc.fillColor('#4b5563').font('Helvetica').fontSize(9);
    terms.forEach((t, i) => {
      doc.text(`${i + 1}. ${t}`, MAINT_MARGIN, ty, { width: leftW });
      ty += doc.heightOfString(`${i + 1}. ${t}`, { width: leftW }) + 4;
    });

    doc
      .fillColor('#111827')
      .font('Helvetica-Bold')
      .fontSize(10)
      .text('Additional Notes', MAINT_MARGIN, ty + 6);
    doc
      .fillColor('#4b5563')
      .font('Helvetica')
      .fontSize(9)
      .text(dash(po.remarks), MAINT_MARGIN, ty + 20, { width: leftW });

    doc
      .fillColor(MAINT_MUTED)
      .fontSize(8)
      .text(
        `For any enquiries, email ${branding.email || '—'} or call ${branding.phone || branding.ptcl || '—'}.`,
        MAINT_MARGIN,
        ty + 48,
        { width: leftW },
      );

    // Totals
    const totalRows: [string, string, boolean?][] = [
      ['Sub Total', moneyPk(po.subTotal)],
      ['Discount', moneyPk(po.discountAmount)],
      ['Tax', moneyPk(po.taxAmount)],
      ['Total Due', moneyPk(grand), true],
    ];
    let ry = y;
    for (const [k, v, grandRow] of totalRows) {
      if (grandRow) {
        ry += 4;
        doc
          .moveTo(rightX, ry)
          .lineTo(rightX + rightW, ry)
          .strokeColor('#111827')
          .lineWidth(1.5)
          .stroke();
        ry += 6;
        doc
          .fillColor(MAINT_NAVY)
          .font('Helvetica-Bold')
          .fontSize(14)
          .text(k, rightX, ry);
        doc.text(v, rightX, ry, { width: rightW, align: 'right' });
        ry += 20;
      } else {
        doc
          .fillColor('#374151')
          .font('Helvetica')
          .fontSize(10)
          .text(k, rightX, ry);
        doc.text(v, rightX, ry, { width: rightW, align: 'right' });
        ry += 16;
      }
    }

    doc
      .fillColor(MAINT_MUTED)
      .font('Helvetica')
      .fontSize(8)
      .text('Total (in words)', rightX, ry);
    doc
      .fillColor('#111827')
      .fontSize(9)
      .text(amountInWords(grand), rightX, ry + 12, { width: rightW });

    ry += 48;
    doc
      .moveTo(rightX + rightW - 140, ry)
      .lineTo(rightX + rightW, ry)
      .strokeColor('#9ca3af')
      .lineWidth(1)
      .stroke();
    doc
      .fillColor(MAINT_MUTED)
      .font('Helvetica')
      .fontSize(9)
      .text('Authorized Signature', rightX + rightW - 140, ry + 6, {
        width: 140,
        align: 'center',
      });
  }

  private drawDocHeader(
    doc: PDFKit.PDFDocument,
    branding: MaintPrintBranding,
    logoBuf: Buffer | null,
    qrPng: Buffer,
    title: string,
    dateLabel: string,
    serial: string,
  ): number {
    const contentW = MAINT_PAGE_W - MAINT_MARGIN * 2;
    const headerTop = MAINT_MARGIN;

    if (logoBuf) {
      try {
        doc.image(logoBuf, MAINT_MARGIN, headerTop, {
          fit: [72, 72],
          align: 'center',
          valign: 'center',
        });
      } catch {
        drawLogoFallback(doc, branding.name, MAINT_MARGIN, headerTop);
      }
    } else {
      drawLogoFallback(doc, branding.name, MAINT_MARGIN, headerTop);
    }

    doc
      .fillColor(MAINT_NAVY)
      .font('Helvetica-Bold')
      .fontSize(24)
      .text(title, MAINT_MARGIN + 80, headerTop + 28, {
        width: contentW - 170,
        align: 'center',
      });

    const qrX = MAINT_PAGE_W - MAINT_MARGIN - 72;
    doc.image(qrPng, qrX, headerTop, { width: 72, height: 72 });

    let y = headerTop + 78;
    doc
      .fillColor(MAINT_MUTED)
      .font('Helvetica')
      .fontSize(10)
      .text(`Date `, MAINT_MARGIN, y, { continued: true })
      .fillColor('#111827')
      .font('Helvetica-Bold')
      .text(dateLabel);

    doc
      .fillColor(MAINT_NAVY)
      .font('Helvetica-Bold')
      .fontSize(10)
      .text(serial, qrX - 4, y, { width: 80, align: 'center' });

    y += 18;
    doc
      .moveTo(MAINT_MARGIN, y)
      .lineTo(MAINT_PAGE_W - MAINT_MARGIN, y)
      .strokeColor('#e5e7eb')
      .lineWidth(1)
      .stroke();

    return y + 14;
  }

  private drawPartyBox(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    w: number,
    label: string,
    title: string,
    lines: string[],
  ) {
    const h = Math.max(88, 36 + lines.length * 13);
    doc.roundedRect(x, y, w, h, 6).fill('#f3f4f6');
    doc
      .fillColor(MAINT_MUTED)
      .font('Helvetica-Bold')
      .fontSize(8)
      .text(label.toUpperCase(), x + 12, y + 10);
    doc
      .fillColor('#111827')
      .font('Helvetica-Bold')
      .fontSize(11)
      .text(title, x + 12, y + 24, { width: w - 24 });
    let ly = y + 42;
    doc.fillColor('#374151').font('Helvetica').fontSize(9);
    for (const line of lines) {
      doc.text(line, x + 12, ly, { width: w - 24 });
      ly += 13;
    }
  }

  private async load(
    where: { id: string } | { purchaseOrderNo: string },
  ): Promise<PurchaseOrder | null> {
    return this.poRepo.findOne({
      where,
      relations: {
        vendor: true,
        purchaseQuotation: { jobCard: true },
        items: { product: true },
      },
      order: { items: { createdAt: 'ASC' } },
    });
  }
}
