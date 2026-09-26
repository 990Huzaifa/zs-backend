import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import PDFDocument from 'pdfkit';
import * as QRCode from 'qrcode';
import { Repository } from 'typeorm';
import { frontendBaseUrl } from '../../common/utils/public-link.util';
import {
  PurchaseQuotation,
  PurchaseQuotationItemType,
  PurchaseQuotationStatus,
} from '../../database/entities/maintenance/purchase-quotation.entity';
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

const PQ_STATUS_LABELS: Record<PurchaseQuotationStatus, string> = {
  [PurchaseQuotationStatus.DRAFT]: 'Draft',
  [PurchaseQuotationStatus.SUBMITTED]: 'Submitted',
  [PurchaseQuotationStatus.APPROVED]: 'Approved',
  [PurchaseQuotationStatus.REJECTED]: 'Rejected',
  [PurchaseQuotationStatus.CANCELLED]: 'Cancelled',
};

const ITEM_TYPE_LABELS: Record<PurchaseQuotationItemType, string> = {
  [PurchaseQuotationItemType.PRODUCT]: 'Product',
  [PurchaseQuotationItemType.SERVICE]: 'Service',
};

export type PurchaseQuotationPdfResult = {
  buffer: Buffer;
  filename: string;
  quotationNo: string;
};

@Injectable()
export class PurchaseQuotationPdfService {
  private readonly logger = new Logger(PurchaseQuotationPdfService.name);

  constructor(
    @InjectRepository(PurchaseQuotation)
    private readonly pqRepo: Repository<PurchaseQuotation>,
    @InjectRepository(SystemSetting)
    private readonly settingRepo: Repository<SystemSetting>,
  ) {}

  async generateById(id: string): Promise<PurchaseQuotationPdfResult> {
    const pq = await this.load({ id });
    if (!pq) throw new NotFoundException('Purchase quotation not found');
    return this.renderPdf(pq);
  }

  async generateByCodeOrId(
    codeOrId: string,
  ): Promise<PurchaseQuotationPdfResult> {
    const key = codeOrId.trim();
    if (!key) throw new NotFoundException('Purchase quotation not found');

    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    const pq = uuidRe.test(key)
      ? await this.load({ id: key })
      : await this.load({ quotationNo: key.toUpperCase() });

    if (!pq) throw new NotFoundException('Purchase quotation not found');
    return this.renderPdf(pq);
  }

  private async renderPdf(
    pq: PurchaseQuotation,
  ): Promise<PurchaseQuotationPdfResult> {
    try {
      const branding = await resolveMaintBranding(this.settingRepo);
      const serial = pq.quotationNo || pq.id;
      // Match frontend print: admin detail URL (no public PQ page yet).
      const pageUrl = `${frontendBaseUrl()}/maintenance/purchase-quotations/${encodeURIComponent(pq.id)}`;
      const qrPng = await QRCode.toBuffer(pageUrl, {
        type: 'png',
        width: 256,
        margin: 1,
        errorCorrectionLevel: 'M',
        color: { dark: MAINT_NAVY, light: '#FFFFFF' },
      });
      const logoBuf = await fetchLogoBuffer(branding.logoUrl, this.logger);

      const buffer = await new Promise<Buffer>((resolve, reject) => {
        const doc = new PDFDocument({
          size: 'A4',
          margin: MAINT_MARGIN,
          info: {
            Title: `Purchase Quotation ${serial}`,
            Author: branding.name,
          },
        });
        const chunks: Buffer[] = [];
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        this.drawPage(doc, pq, branding, qrPng, logoBuf, serial);
        doc.end();
      });

      return {
        buffer,
        filename: `purchase-quotation-${serial}.pdf`,
        quotationNo: serial,
      };
    } catch (err) {
      this.logger.error(
        `Failed to generate purchase quotation PDF for ${pq.quotationNo}`,
        err instanceof Error ? err.stack : String(err),
      );
      throw new InternalServerErrorException(
        'Failed to generate purchase quotation PDF',
      );
    }
  }

  private drawPage(
    doc: PDFKit.PDFDocument,
    pq: PurchaseQuotation,
    branding: MaintPrintBranding,
    qrPng: Buffer,
    logoBuf: Buffer | null,
    serial: string,
  ) {
    const contentW = MAINT_PAGE_W - MAINT_MARGIN * 2;
    const grand = Number(pq.grandTotal) || 0;

    let y = this.drawDocHeader(
      doc,
      branding,
      logoBuf,
      qrPng,
      'Purchase Quotation',
      formatPrintDate(pq.quotationDate),
      serial,
    );

    const partyW = (contentW - 12) / 2;
    const vendorName =
      pq.vendor?.vendorName?.trim() || pq.vendor?.ownerName?.trim() || '—';

    this.drawPartyBox(doc, MAINT_MARGIN, y, partyW, 'Order by', branding.name, [
      dash(branding.addressLine),
      dash(branding.contactLine || branding.email || branding.phone),
    ]);

    const toLines = [
      `Quotation #: ${serial}`,
      `Status: ${PQ_STATUS_LABELS[pq.status] ?? titleCaseLabel(pq.status)}`,
    ];
    if (pq.validUntil) {
      toLines.push(`Valid until: ${formatPrintDate(pq.validUntil)}`);
    }
    if (pq.vendorQuotationNo) {
      toLines.push(`Vendor ref: ${pq.vendorQuotationNo}`);
    }
    if (pq.jobCard?.jobCardNo) {
      toLines.push(`Job card: ${pq.jobCard.jobCardNo}`);
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

    const items = pq.items ?? [];
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
    const terms = pq.termsAndConditions?.trim()
      ? [pq.termsAndConditions.trim()]
      : [
          'Prices are subject to change until the quotation is approved.',
          'Please quote the quotation number when placing the order.',
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
      .text(dash(pq.remarks), MAINT_MARGIN, ty + 20, { width: leftW });

    doc
      .fillColor(MAINT_MUTED)
      .fontSize(8)
      .text(
        `For any enquiries, email ${branding.email || '—'} or call ${branding.phone || branding.ptcl || '—'}.`,
        MAINT_MARGIN,
        ty + 48,
        { width: leftW },
      );

    const totalRows: [string, string, boolean?][] = [
      ['Sub Total', moneyPk(pq.subTotal)],
      ['Discount', moneyPk(pq.discountAmount)],
      ['Tax', moneyPk(pq.taxAmount)],
      ['Total', moneyPk(grand), true],
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
      .fontSize(22)
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
    where: { id: string } | { quotationNo: string },
  ): Promise<PurchaseQuotation | null> {
    return this.pqRepo.findOne({
      where,
      relations: {
        vendor: true,
        jobCard: true,
        items: { product: true },
      },
      order: { items: { createdAt: 'ASC' } },
    });
  }
}
