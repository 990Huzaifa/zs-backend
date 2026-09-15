import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import PDFDocument from 'pdfkit';
import { Repository } from 'typeorm';
import {
  BusinessInfoSettingValue,
  SystemSetting,
  SystemSettingKey,
} from '../../database/entities/system-setting.entity';
import {
  Vendor,
  VendorContact,
  VendorTaxStatus,
} from '../../database/entities/vendor.entity';
import { VendorsService } from '../vendors.service';

const NAVY = '#1A3C70';
const GREEN = '#A9C43F';
const GREEN_SOFT = '#eef4d8';
const MUTED = '#7186A6';
const CARD_BORDER = '#e6eaf3';
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 34; // ~12mm

const DEFAULT_BUSINESS_INFO: BusinessInfoSettingValue = {
  logoUrl:
    'https://zsparktech-bucket.s3.eu-north-1.amazonaws.com/assets/logo.png',
  companyName: 'ZS Logistics Services',
  tagLine: 'Moving Business Forward',
  address: 'Head Office: Office 101, DHA Phase 7 Ext, Karachi, Pakistan',
  ptcl: null,
  phone: '+92 21 3499 0000',
  email: 'info@zslogistics.com',
};

type PrintBranding = {
  logoUrl: string;
  name: string;
  tagLine: string;
};

export type VendorPdfResult = {
  buffer: Buffer;
  filename: string;
  code: string;
};

@Injectable()
export class VendorPdfService {
  private readonly logger = new Logger(VendorPdfService.name);

  constructor(
    private readonly vendorsService: VendorsService,
    @InjectRepository(SystemSetting)
    private readonly settingRepo: Repository<SystemSetting>,
  ) {}

  async generateById(id: string): Promise<VendorPdfResult> {
    let vendor: Vendor;
    try {
      vendor = await this.vendorsService.findOne(id);
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw err;
    }
    return this.renderPdf(vendor);
  }

  private async renderPdf(vendor: Vendor): Promise<VendorPdfResult> {
    const displayName = this.displayName(vendor);
    const code = vendor.id;

    try {
      const branding = await this.resolveBranding();
      const logoBuf = await this.fetchImageBuffer(branding.logoUrl);

      const buffer = await new Promise<Buffer>((resolve, reject) => {
        const doc = new PDFDocument({
          size: 'A4',
          margin: MARGIN,
          autoFirstPage: false,
          info: {
            Title: `Vendor Profile — ${displayName}`,
            Author: branding.name,
          },
        });
        const chunks: Buffer[] = [];
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        doc.addPage({ size: 'A4', margin: MARGIN });
        this.resetPageCursor(doc);
        this.drawPage(doc, vendor, branding, logoBuf);

        doc.end();
      });

      const safeName = displayName.replace(/[^\w.-]+/g, '_').slice(0, 60);
      return {
        buffer,
        filename: `vendor-${safeName || code}.pdf`,
        code,
      };
    } catch (err) {
      this.logger.error(
        `Failed to generate vendor PDF for ${code}`,
        err instanceof Error ? err.stack : String(err),
      );
      throw new InternalServerErrorException('Failed to generate vendor PDF');
    }
  }

  /** Matches zs-frontend printVendor.ts A4 vendor profile template. */
  private drawPage(
    doc: PDFKit.PDFDocument,
    vendor: Vendor,
    branding: PrintBranding,
    logoBuf: Buffer | null,
  ): void {
    const contentW = PAGE_W - MARGIN * 2;
    let y = this.drawTopHeader(doc, branding, logoBuf);

    y = this.drawSummary(doc, vendor, y, contentW);
    y = this.drawCardsGrid(doc, vendor, y, contentW);
    y = this.drawQuote(doc, branding, y, contentW);

    this.drawFooterBar(doc, branding);
    this.resetPageCursor(doc);
  }

  private drawTopHeader(
    doc: PDFKit.PDFDocument,
    branding: PrintBranding,
    logoBuf: Buffer | null,
  ): number {
    const top = MARGIN;
    const logoSize = 48;

    if (logoBuf) {
      try {
        doc.image(logoBuf, MARGIN, top, {
          fit: [logoSize, logoSize],
          align: 'center',
          valign: 'center',
        });
      } catch {
        this.drawLogoFallback(doc, branding.name, MARGIN, top, logoSize);
      }
    } else {
      this.drawLogoFallback(doc, branding.name, MARGIN, top, logoSize);
    }

    const brandX = MARGIN + logoSize + 10;
    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(13)
      .text(branding.name.toUpperCase(), brandX, top + 6, {
        width: 200,
        lineBreak: false,
        ellipsis: true,
      });
    doc
      .fillColor(GREEN)
      .font('Helvetica-Bold')
      .fontSize(8)
      .text(branding.tagLine.toUpperCase(), brandX, top + 24, {
        width: 200,
        lineBreak: false,
        ellipsis: true,
      });

    // Center slogan
    doc
      .fillColor('#c5cdd8')
      .font('Helvetica-Bold')
      .fontSize(8)
      .text('PEOPLE · ROUTES · POSSIBILITIES', MARGIN, top + 10, {
        width: PAGE_W - MARGIN * 2,
        align: 'center',
        lineBreak: false,
      });

    // Right ribbon (navy chevron-style block)
    const ribbonW = 168;
    const ribbonH = 48;
    const ribbonX = PAGE_W - ribbonW;
    const ribbonY = top - 2;

    doc.save();
    doc
      .moveTo(ribbonX + 16, ribbonY)
      .lineTo(PAGE_W, ribbonY)
      .lineTo(PAGE_W, ribbonY + ribbonH)
      .lineTo(ribbonX + 16, ribbonY + ribbonH)
      .lineTo(ribbonX, ribbonY + ribbonH / 2)
      .closePath()
      .fill(NAVY);
    // Green notch
    doc
      .moveTo(ribbonX + 10, ribbonY)
      .lineTo(ribbonX + 18, ribbonY)
      .lineTo(ribbonX + 10, ribbonY + ribbonH / 2)
      .lineTo(ribbonX + 18, ribbonY + ribbonH)
      .lineTo(ribbonX + 10, ribbonY + ribbonH)
      .lineTo(ribbonX + 2, ribbonY + ribbonH / 2)
      .closePath()
      .fill(GREEN);
    doc.restore();

    doc
      .fillColor('#ffffff')
      .font('Helvetica-Bold')
      .fontSize(12)
      .text('VENDOR PROFILE', ribbonX + 28, ribbonY + 10, {
        width: ribbonW - 40,
        align: 'right',
        lineBreak: false,
      });
    doc
      .fillColor('#ffffff')
      .font('Helvetica')
      .fontSize(7)
      .text('Trusted partners stronger supply chains', ribbonX + 28, ribbonY + 28, {
        width: ribbonW - 40,
        align: 'right',
        lineBreak: false,
      });

    this.resetPageCursor(doc);
    return top + logoSize + 14;
  }

  private drawSummary(
    doc: PDFKit.PDFDocument,
    vendor: Vendor,
    y: number,
    contentW: number,
  ): number {
    const h = 58;
    const name = this.displayName(vendor);
    const category = vendor.vendorCategory?.name?.trim() || 'Vendor';
    const owner = this.dash(vendor.ownerName);

    doc.roundedRect(MARGIN, y, contentW, h, 12).fill(GREEN_SOFT);

    // Icon box
    const iconX = MARGIN + 12;
    const iconY = y + 7;
    const iconSize = 44;
    doc.roundedRect(iconX, iconY, iconSize, iconSize, 10).fill('#ffffff');
    this.drawCategoryGlyph(doc, category, iconX, iconY, iconSize);

    const textX = iconX + iconSize + 12;
    const textW = contentW - iconSize - 140;
    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(15)
      .text(name, textX, y + 12, {
        width: textW,
        lineBreak: false,
        ellipsis: true,
      });
    doc
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(9)
      .text(`${category} | Owned by: ${owner}`, textX, y + 34, {
        width: textW,
        lineBreak: false,
        ellipsis: true,
      });

    // Tax pill + since (right)
    const rightX = MARGIN + contentW - 118;
    this.drawTaxPill(doc, vendor.taxStatus, rightX, y + 12, 106);
    doc
      .fillColor(MUTED)
      .font('Helvetica-Bold')
      .fontSize(8)
      .text(`Vendor Since ${this.fmtDate(vendor.joiningDate)}`, rightX, y + 34, {
        width: 106,
        align: 'right',
        lineBreak: false,
      });

    this.resetPageCursor(doc);
    return y + h + 14;
  }

  private drawCardsGrid(
    doc: PDFKit.PDFDocument,
    vendor: Vendor,
    y: number,
    contentW: number,
  ): number {
    const gap = 12;
    const leftW = Math.floor(contentW * 0.55);
    const rightW = contentW - leftW - gap;
    const leftX = MARGIN;
    const rightX = MARGIN + leftW + gap;

    const category = vendor.vendorCategory?.name?.trim() || 'Vendor';
    const location = [vendor.city?.name, vendor.state?.name, vendor.zipCode]
      .filter(Boolean)
      .join(', ');

    let leftY = y;
    leftY = this.drawCard(doc, leftX, leftY, leftW, 'Basic Information', [
      ['Owner Name', this.dash(vendor.ownerName)],
      ['Vendor / Trade Name', this.dash(vendor.vendorName)],
      ['Category', this.dash(category)],
      ['Joining Date', this.fmtDate(vendor.joiningDate)],
      ['Email', this.dash(vendor.email)],
      ['Phone', this.dash(vendor.phone)],
      ['Alternate Phone', this.dash(vendor.altPhone)],
    ]);

    leftY = this.drawCard(doc, leftX, leftY, leftW, 'Address Information', [
      ['Street Address', this.dash(vendor.address)],
      ['City', this.dash(vendor.city?.name)],
      ['State / Province', this.dash(vendor.state?.name)],
      ['ZIP Code', this.dash(vendor.zipCode)],
      ['Location', this.dash(location || null)],
      ['Coordinates', this.coords(vendor.lat, vendor.lng)],
    ]);

    let rightY = y;
    rightY = this.drawCard(
      doc,
      rightX,
      rightY,
      rightW,
      'Tax Information',
      [['Tax Status', this.taxLabel(vendor.taxStatus)]],
      { taxBadge: vendor.taxStatus },
    );

    rightY = this.drawCard(doc, rightX, rightY, rightW, 'Bank Details', [
      ['Bank Name', this.dash(vendor.bankName)],
      ['Account Number', this.dash(vendor.bankAccountNumber)],
    ]);

    rightY = this.drawContactsCard(
      doc,
      rightX,
      rightY,
      rightW,
      vendor.contacts ?? [],
    );

    return Math.max(leftY, rightY) + 8;
  }

  private drawCard(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    w: number,
    title: string,
    rows: Array<[string, string]>,
    opts?: { taxBadge?: VendorTaxStatus },
  ): number {
    const headH = 28;
    const rowH = 22;
    const bodyPad = 8;
    const bodyH = bodyPad + rows.length * rowH + 4;
    const h = headH + bodyH;

    doc.roundedRect(x, y, w, h, 10).fillAndStroke('#ffffff', CARD_BORDER);
    // Header background
    doc.save();
    doc.roundedRect(x, y, w, headH, 10).clip();
    doc.rect(x, y, w, headH + 8).fill('#f7f9fc');
    doc.restore();
    doc
      .moveTo(x, y + headH)
      .lineTo(x + w, y + headH)
      .strokeColor('#eef1f6')
      .lineWidth(0.8)
      .stroke();

    // Icon chip
    doc.roundedRect(x + 10, y + 6, 16, 16, 4).fill(GREEN_SOFT);
    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(9)
      .text(title.toUpperCase(), x + 32, y + 10, {
        width: w - 42,
        lineBreak: false,
        ellipsis: true,
      });

    let rowY = y + headH + bodyPad;
    const labelW = Math.min(110, Math.floor(w * 0.42));
    for (const [label, value] of rows) {
      doc
        .fillColor(MUTED)
        .font('Helvetica-Bold')
        .fontSize(8)
        .text(label, x + 12, rowY, {
          width: labelW,
          lineBreak: false,
          ellipsis: true,
        });

      if (opts?.taxBadge && label === 'Tax Status') {
        this.drawTaxBadge(doc, opts.taxBadge, x + 12 + labelW + 4, rowY - 2);
      } else {
        doc
          .fillColor(NAVY)
          .font('Helvetica-Bold')
          .fontSize(9)
          .text(value, x + 12 + labelW + 4, rowY, {
            width: w - labelW - 28,
            lineBreak: false,
            ellipsis: true,
          });
      }

      doc
        .moveTo(x + 12, rowY + 16)
        .lineTo(x + w - 12, rowY + 16)
        .strokeColor('#f1f4f9')
        .lineWidth(0.6)
        .stroke();
      rowY += rowH;
    }

    this.resetPageCursor(doc);
    return y + h + 12;
  }

  private drawContactsCard(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    w: number,
    contacts: VendorContact[],
  ): number {
    const headH = 28;
    let bodyH: number;
    if (!contacts.length) {
      bodyH = 72;
    } else {
      bodyH =
        10 +
        contacts.reduce((sum, c) => sum + (c.email?.trim() ? 56 : 46), 0);
    }
    const h = headH + bodyH;

    doc.roundedRect(x, y, w, h, 10).fillAndStroke('#ffffff', CARD_BORDER);
    doc.save();
    doc.roundedRect(x, y, w, headH, 10).clip();
    doc.rect(x, y, w, headH + 8).fill('#f7f9fc');
    doc.restore();
    doc
      .moveTo(x, y + headH)
      .lineTo(x + w, y + headH)
      .strokeColor('#eef1f6')
      .lineWidth(0.8)
      .stroke();

    doc.roundedRect(x + 10, y + 6, 16, 16, 4).fill(GREEN_SOFT);
    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(9)
      .text('CONTACTS', x + 32, y + 10, {
        width: w - 42,
        lineBreak: false,
      });

    if (!contacts.length) {
      doc
        .fillColor('#6b7280')
        .font('Helvetica-Bold')
        .fontSize(9)
        .text('No contacts available', x + 12, y + headH + 18, {
          width: w - 24,
          align: 'center',
        });
      doc
        .fillColor('#9ca3af')
        .font('Helvetica')
        .fontSize(8)
        .text(
          'Contacts for this vendor have not been added yet.',
          x + 12,
          y + headH + 34,
          { width: w - 24, align: 'center' },
        );
    } else {
      let cy = y + headH + 8;
      for (const c of contacts) {
        const hasEmail = Boolean(c.email?.trim());
        const boxH = hasEmail ? 50 : 40;
        doc
          .roundedRect(x + 10, cy, w - 20, boxH, 6)
          .fillAndStroke('#f8fafc', '#eef2f7');
        doc
          .fillColor(NAVY)
          .font('Helvetica-Bold')
          .fontSize(9)
          .text(this.dash(c.name), x + 18, cy + 8, {
            width: w - 36,
            lineBreak: false,
            ellipsis: true,
          });
        doc
          .fillColor(MUTED)
          .font('Helvetica')
          .fontSize(8)
          .text(
            `${this.dash(c.designation)} · ${this.dash(c.phone)}`,
            x + 18,
            cy + 22,
            { width: w - 36, lineBreak: false, ellipsis: true },
          );
        if (hasEmail) {
          doc
            .fillColor(MUTED)
            .font('Helvetica')
            .fontSize(8)
            .text(this.dash(c.email), x + 18, cy + 34, {
              width: w - 36,
              lineBreak: false,
              ellipsis: true,
            });
        }
        cy += boxH + 6;
      }
    }

    this.resetPageCursor(doc);
    return y + h + 12;
  }

  private drawQuote(
    doc: PDFKit.PDFDocument,
    branding: PrintBranding,
    y: number,
    contentW: number,
  ): number {
    // Quote mark block
    doc
      .fillColor(GREEN)
      .font('Helvetica-Bold')
      .fontSize(28)
      .text('“', MARGIN, y, { width: 24, lineBreak: false });

    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(11)
      .text('Reliable Partners for a Stronger Tomorrow', MARGIN + 28, y + 8, {
        width: contentW - 28,
        lineBreak: false,
      });
    doc
      .fillColor(MUTED)
      .font('Helvetica-Bold')
      .fontSize(8)
      .text(branding.name, MARGIN + 28, y + 26, {
        width: contentW - 28,
        lineBreak: false,
      });

    this.resetPageCursor(doc);
    return y + 44;
  }

  private drawFooterBar(doc: PDFKit.PDFDocument, branding: PrintBranding) {
    const barH = 26;
    const y = PAGE_H - barH;
    const split = Math.floor(PAGE_W * 0.55);

    doc.rect(0, y, split + 8, barH).fill(NAVY);
    // Green slanted right bar
    doc
      .moveTo(split - 6, y)
      .lineTo(PAGE_W, y)
      .lineTo(PAGE_W, y + barH)
      .lineTo(split - 18, y + barH)
      .closePath()
      .fill(GREEN);

    doc
      .fillColor('#ffffff')
      .font('Helvetica-Bold')
      .fontSize(8)
      .text(branding.name.toUpperCase(), MARGIN, y + 9, {
        width: split - MARGIN - 16,
        lineBreak: false,
        ellipsis: true,
      });
    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(8)
      .text(branding.tagLine.toUpperCase(), split + 8, y + 9, {
        width: PAGE_W - split - MARGIN - 8,
        align: 'right',
        lineBreak: false,
        ellipsis: true,
      });
  }

  private drawTaxPill(
    doc: PDFKit.PDFDocument,
    tax: VendorTaxStatus,
    x: number,
    y: number,
    w: number,
  ) {
    const active = tax === VendorTaxStatus.ACTIVE;
    const bg = active ? '#d1fae5' : '#dcfce7';
    const fg = active ? '#065f46' : '#166534';
    const label = active ? 'TAX ACTIVE' : 'TAX NON-ACTIVE';
    doc.roundedRect(x, y, w, 16, 8).fill(bg);
    doc
      .fillColor(fg)
      .font('Helvetica-Bold')
      .fontSize(7.5)
      .text(label, x, y + 4, { width: w, align: 'center', lineBreak: false });
  }

  private drawTaxBadge(
    doc: PDFKit.PDFDocument,
    tax: VendorTaxStatus,
    x: number,
    y: number,
  ) {
    const active = tax === VendorTaxStatus.ACTIVE;
    const bg = active ? '#d1fae5' : '#fee2e2';
    const fg = active ? '#065f46' : '#991b1b';
    const label = active ? 'Active' : 'Non-Active';
    const w = 72;
    doc.roundedRect(x, y, w, 14, 7).fill(bg);
    doc
      .fillColor(fg)
      .font('Helvetica-Bold')
      .fontSize(8)
      .text(label, x, y + 3, { width: w, align: 'center', lineBreak: false });
  }

  private drawCategoryGlyph(
    doc: PDFKit.PDFDocument,
    categoryName: string,
    x: number,
    y: number,
    size: number,
  ) {
    const n = categoryName.toLowerCase();
    const isFuel =
      n.includes('gas') ||
      n.includes('fuel') ||
      n.includes('petrol') ||
      n.includes('pump');
    const cx = x + size / 2;
    const cy = y + size / 2;

    if (isFuel) {
      doc
        .roundedRect(cx - 8, cy - 10, 12, 20, 2)
        .strokeColor(GREEN)
        .lineWidth(1.5)
        .stroke();
      doc
        .moveTo(cx + 4, cy - 2)
        .lineTo(cx + 10, cy - 2)
        .lineTo(cx + 10, cy + 6)
        .strokeColor(GREEN)
        .lineWidth(1.5)
        .stroke();
    } else {
      doc
        .moveTo(cx - 10, cy - 2)
        .lineTo(cx - 8, cy - 10)
        .lineTo(cx + 8, cy - 10)
        .lineTo(cx + 10, cy - 2)
        .strokeColor(GREEN)
        .lineWidth(1.5)
        .stroke();
      doc
        .roundedRect(cx - 10, cy - 2, 20, 12, 1)
        .strokeColor(GREEN)
        .lineWidth(1.5)
        .stroke();
    }
  }

  private drawLogoFallback(
    doc: PDFKit.PDFDocument,
    name: string,
    x: number,
    y: number,
    size: number,
  ) {
    doc.roundedRect(x, y, size, size, 6).fillAndStroke('#eef2f7', CARD_BORDER);
    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(8)
      .text(name, x + 2, y + size / 2 - 6, {
        width: size - 4,
        align: 'center',
      });
  }

  private async resolveBranding(): Promise<PrintBranding> {
    const setting = await this.settingRepo.findOne({
      where: { key: SystemSettingKey.BUSINESS_INFO },
    });
    const value: BusinessInfoSettingValue = {
      ...DEFAULT_BUSINESS_INFO,
      ...((setting?.value as BusinessInfoSettingValue | undefined) ?? {}),
    };

    return {
      logoUrl:
        (value.logoUrl ?? '').trim() || DEFAULT_BUSINESS_INFO.logoUrl || '',
      name:
        (value.companyName ?? '').trim() ||
        DEFAULT_BUSINESS_INFO.companyName ||
        'ZS Logistics Services',
      tagLine:
        (value.tagLine ?? '').trim() ||
        DEFAULT_BUSINESS_INFO.tagLine ||
        'Moving Business Forward',
    };
  }

  private async fetchImageBuffer(url: string): Promise<Buffer | null> {
    if (!url) return null;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8_000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      this.logger.warn(`Could not fetch image: ${String(err)}`);
      return null;
    }
  }

  private displayName(vendor: Vendor): string {
    const trade = vendor.vendorName?.trim();
    if (trade) return trade;
    return vendor.ownerName?.trim() || 'Vendor';
  }

  private taxLabel(tax: VendorTaxStatus): string {
    return tax === VendorTaxStatus.ACTIVE ? 'Active' : 'Non-Active';
  }

  private coords(lat?: string | null, lng?: string | null): string {
    const a = (lat ?? '').trim();
    const b = (lng ?? '').trim();
    if (!a && !b) return '—';
    return [a, b].filter(Boolean).join(', ');
  }

  private dash(value?: string | null): string {
    const v = (value ?? '').trim();
    return v || '—';
  }

  private toDate(value?: string | Date | null): Date | null {
    if (value == null || value === '') return null;
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }
    const raw = String(value);
    const d = new Date(raw.includes('T') ? raw : `${raw.slice(0, 10)}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  private fmtDate(value?: string | Date | null): string {
    const d = this.toDate(value);
    if (!d) return '—';
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  private resetPageCursor(doc: PDFKit.PDFDocument) {
    doc.x = MARGIN;
    doc.y = MARGIN;
  }
}
