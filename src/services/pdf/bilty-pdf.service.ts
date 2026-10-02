import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import PDFDocument from 'pdfkit';
import { Repository } from 'typeorm';
import { buildCode128PngBuffer } from '../../common/utils/barcode.util';
import {
  Bilty,
  BiltyLoading,
  BiltyOffLoading,
  BiltyStatus,
} from '../../database/entities/bilty.entity';
import {
  BusinessInfoSettingValue,
  SystemSetting,
  SystemSettingKey,
} from '../../database/entities/system-setting.entity';

const NAVY = '#1A3C70';
const MUTED = '#64748b';
const LABEL = '#94a3b8';
const VALUE = '#0f172a';
const BORDER = '#d8e0ec';
const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
/** ~8mm — matches FE `@page { margin: 8mm }` */
const MARGIN = 23;

/** Stop-card layout (loading / offloading). */
const STOP_FONT = 7.5;
const STOP_ROW_PAD_Y = 4;
const STOP_GAP_X = 8;
const STOP_SECTION_H = 15;
const STOP_BODY_TOP = 30; // title + divider
const STOP_BODY_BOTTOM = 8;

/**
 * Party card (Transporter / POC) — Date blank + tall stamp/signature
 * matching FE printBilty `.party-col` / `.party-stamp` / `.party-signature`.
 */
const PARTY_CARD_H = 188;

/** Footer text is clamped to this height so it never wraps onto a new page. */
const FOOTER_MAX_H = 20;

const BILTY_COPY_MARKS = [
  'Office Copy',
  'Transporter Copy',
  'Receiving Copy',
] as const;

type BiltyCopyMark = (typeof BILTY_COPY_MARKS)[number];

type StopContact = { name: string; phone: string; address: string };

/** Label/value row, section header, or compact stop-contact line (matches FE print). */
type StopCardRow =
  | [string, string]
  | { section: string }
  | { line: string };

const BILTY_STATUS_LABELS: Record<BiltyStatus, string> = {
  [BiltyStatus.PENDING]: 'Pending',
  [BiltyStatus.APPROVED]: 'Approved',
  [BiltyStatus.CANCELLED]: 'Cancelled',
  [BiltyStatus.COMPLETED]: 'Completed',
};

const DEFAULT_BUSINESS_INFO: BusinessInfoSettingValue = {
  logoUrl:
    'https://zsparktech-bucket.s3.eu-north-1.amazonaws.com/assets/logo.png',
  ntn: null,
  companyName: 'ZS Logistics',
  tagLine: null,
  govtRegNo: null,
  primaryAddress: 'Head Office: Office 101, DHA Phase 7 Ext, Karachi, Pakistan',
  secondaryAddress: null,
  ptcl: null,
  phone: '+92 21 3499 0000',
  whatsapp: null,
  email: 'info@zslogistics.com',
};

type PrintBranding = {
  logoUrl: string;
  ntn: string;
  govtRegNo: string;
  name: string;
  tagLine: string;
  /** Bilty header address = secondaryAddress (shown as Address). */
  addressLine: string;
  phone: string;
  ptcl: string;
  whatsapp: string;
  email: string;
  footerLine: string;
};

export type BiltyPdfResult = {
  buffer: Buffer;
  filename: string;
  code: string;
};

@Injectable()
export class BiltyPdfService {
  private readonly logger = new Logger(BiltyPdfService.name);

  constructor(
    @InjectRepository(Bilty)
    private readonly biltyRepo: Repository<Bilty>,
    @InjectRepository(SystemSetting)
    private readonly settingRepo: Repository<SystemSetting>,
  ) {}

  /** Authenticated download by bilty UUID. */
  async generateById(id: string): Promise<BiltyPdfResult> {
    const bilty = await this.loadBilty({ id });
    if (!bilty) {
      throw new NotFoundException('Bilty not found');
    }
    return this.renderPdf(bilty);
  }

  /** Public download by bilty code (e.g. ZS000001) or UUID. */
  async generateByCodeOrId(codeOrId: string): Promise<BiltyPdfResult> {
    const key = codeOrId.trim();
    if (!key) {
      throw new NotFoundException('Bilty not found');
    }

    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    const bilty = uuidRe.test(key)
      ? await this.loadBilty({ id: key })
      : await this.loadBilty({ code: key.toUpperCase() });

    if (!bilty) {
      throw new NotFoundException('Bilty not found');
    }
    return this.renderPdf(bilty);
  }

  private async renderPdf(bilty: Bilty): Promise<BiltyPdfResult> {
    try {
      const branding = await this.resolveBranding();
      const barcodePng = await buildCode128PngBuffer(bilty.code, {
        scale: 3,
        height: 12,
        includetext: false,
      });
      const logoBuf = await this.fetchLogoBuffer(branding.logoUrl);

      const buffer = await new Promise<Buffer>((resolve, reject) => {
        const doc = new PDFDocument({
          size: 'A4',
          margin: MARGIN,
          autoFirstPage: false,
          info: {
            Title: `Bilty ${bilty.code} — 3 copies`,
            Author: branding.name,
          },
        });
        const chunks: Buffer[] = [];
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        for (const mark of BILTY_COPY_MARKS) {
          // bottom: 0 → PDFKit never auto-inserts a page when the footer is
          // drawn near the bottom edge (everything is positioned absolutely).
          doc.addPage({
            size: 'A4',
            margins: { top: MARGIN, left: MARGIN, right: MARGIN, bottom: 0 },
          });
          this.drawPage(doc, bilty, branding, mark, barcodePng, logoBuf);
        }

        doc.end();
      });

      return {
        buffer,
        filename: `bilty-${bilty.code}.pdf`,
        code: bilty.code,
      };
    } catch (err) {
      this.logger.error(
        `Failed to generate bilty PDF for ${bilty.code}`,
        err instanceof Error ? err.stack : String(err),
      );
      throw new InternalServerErrorException('Failed to generate bilty PDF');
    }
  }

  private drawPage(
    doc: PDFKit.PDFDocument,
    bilty: Bilty,
    branding: PrintBranding,
    copyMark: BiltyCopyMark,
    barcodePng: Buffer,
    logoBuf: Buffer | null,
  ) {
    const contentW = PAGE_W - MARGIN * 2;
    const loading = bilty.loadings?.[0];
    const offLoading = bilty.offLoadings?.[0];
    const statusLabel =
      bilty.status === BiltyStatus.PENDING
        ? 'DRAFT'
        : (BILTY_STATUS_LABELS[bilty.status] ?? bilty.status);

    this.drawWatermark(doc, statusLabel, bilty.status);

    const headerTop = MARGIN;
    const logoSize = 72;
    const leftCol = 80;
    const barcodeW = 120;
    const barcodeH = 40;
    const barcodeX = PAGE_W - MARGIN - barcodeW;

    // Logo (left)
    if (logoBuf) {
      try {
        doc.image(logoBuf, MARGIN, headerTop, {
          fit: [logoSize, logoSize],
          align: 'center',
          valign: 'center',
        });
      } catch {
        this.drawLogoFallback(doc, branding.name, MARGIN, headerTop, logoSize);
      }
    } else {
      this.drawLogoFallback(doc, branding.name, MARGIN, headerTop, logoSize);
    }

    // Center letterhead — matches FE printBilty header
    const centerX = MARGIN + leftCol + 6;
    const centerW = barcodeX - centerX - 8;
    let cy = headerTop + 2;

    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(20)
      .text(branding.name, centerX, cy, { width: centerW, align: 'center' });
    cy = doc.y + 1;

    if (branding.tagLine) {
      doc
        .fillColor(MUTED)
        .font('Helvetica-Bold')
        .fontSize(10)
        .text(branding.tagLine.toUpperCase(), centerX, cy, {
          width: centerW,
          align: 'center',
        });
      cy = doc.y + 1;
    }

    if (branding.addressLine) {
      doc
        .fillColor('#475569')
        .font('Helvetica-Bold')
        .fontSize(7)
        .text(branding.addressLine, centerX, cy, {
          width: centerW,
          align: 'center',
        });
      cy = doc.y + 1;
    }

    const contactLine = this.companyContactLine(branding);
    if (contactLine) {
      doc
        .fillColor(NAVY)
        .font('Helvetica-Bold')
        .fontSize(7)
        .text(contactLine, centerX, cy, { width: centerW, align: 'center' });
      cy = doc.y + 3;
    } else {
      cy += 2;
    }

    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(11)
      .text('BILTY', centerX, cy, { width: centerW, align: 'center' });
    const biltyTitleBottom = doc.y;

    // Barcode (right) encodes bilty code + human-readable code + copy mark
    doc.image(barcodePng, barcodeX, headerTop, {
      width: barcodeW,
      height: barcodeH,
    });
    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(8)
      .text(bilty.code, barcodeX - 4, headerTop + barcodeH + 2, {
        width: barcodeW + 8,
        align: 'center',
      });
    const codeBottom = doc.y;
    doc
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(7)
      .text(copyMark, barcodeX - 8, codeBottom + 1, {
        width: barcodeW + 16,
        align: 'center',
      });
    const barcodeBlockBottom = doc.y;

    let y = Math.max(
      headerTop + logoSize + 8,
      biltyTitleBottom + 6,
      barcodeBlockBottom + 4,
    );
    doc
      .moveTo(MARGIN, y)
      .lineTo(PAGE_W - MARGIN, y)
      .strokeColor('#e2e8f0')
      .lineWidth(1)
      .stroke();

    // Meta card — 9 fields (same as FE print)
    y += 10;
    const metaPad = 12;
    const metaColW = (contentW - metaPad * 2) / 3;
    const metaRowH = 34;
    const metaItems: Array<[string, string]> = [
      ['BILTY CODE', this.dashPlain(bilty.code)],
      ['ISSUE DATE', this.fmtDate(bilty.issueDate)],
      ['PRODUCT DESCRIPTION', this.dashPlain(bilty.description)],
      ['CLIENT REFERENCE', this.dashPlain(bilty.refNumber)],
      ['TOTAL WEIGHT', this.dashPlain(bilty.totalWeight)],
      ['PACKAGES', this.dashPlain(bilty.noOfPackages)],
      ['DRIVER NAME', this.dashPlain(bilty.driver?.user?.name)],
      ['DRIVER PHONE', this.dashPlain(bilty.driver?.phone)],
      [
        'VEHICLE NO.',
        this.dashPlain(
          bilty.vehicle?.regNo ?? bilty.vehicleRegistrationNumber,
        ),
      ],
    ];
    const metaRows = Math.ceil(metaItems.length / 3);
    const metaH = metaPad * 2 + metaRows * metaRowH - 4;
    this.roundedRect(doc, MARGIN, y, contentW, metaH, 10);
    metaItems.forEach(([label, value], i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const mx = MARGIN + metaPad + col * metaColW;
      const my = y + metaPad + row * metaRowH;
      doc
        .fillColor(LABEL)
        .font('Helvetica-Bold')
        .fontSize(6.5)
        .text(label, mx, my, { width: metaColW - 8 });
      doc
        .fillColor(VALUE)
        .font('Helvetica-Bold')
        .fontSize(10)
        .text(value, mx, my + 10, {
          width: metaColW - 8,
          lineBreak: false,
          ellipsis: true,
        });
    });

    // Loading / Offloading
    y += metaH + 10;
    const stopGap = 10;
    const stopW = (contentW - stopGap) / 2;
    const loadingRows = this.loadingRows(loading);
    const offLoadingRows = this.offLoadingRows(offLoading);
    const stopH = Math.max(
      this.measureStopCardHeight(doc, stopW, loadingRows),
      this.measureStopCardHeight(doc, stopW, offLoadingRows),
    );
    this.drawStopCard(
      doc,
      MARGIN,
      y,
      stopW,
      stopH,
      'LOADING DETAILS',
      loadingRows,
    );
    this.drawStopCard(
      doc,
      MARGIN + stopW + stopGap,
      y,
      stopW,
      stopH,
      'OFFLOADING DETAILS',
      offLoadingRows,
    );

    // Terms & Conditions first (FE: stops → terms → parties → footer)
    y += stopH + 10;
    y = this.drawTermsAndConditions(doc, MARGIN, y, contentW, branding);

    // Parties — Transporter / POC Loading / POC Offloading + Date / stamp / signature
    y += 12;
    const partyGap = 8;
    const partyW = (contentW - partyGap * 2) / 3;
    const partyH = PARTY_CARD_H;
    this.drawPartyCard(
      doc,
      MARGIN,
      y,
      partyW,
      partyH,
      'TRANSPORTER',
      this.dashPlain(bilty.transaportorName),
      this.dashPlain(bilty.transaportorPhone),
    );
    this.drawPartyCard(
      doc,
      MARGIN + partyW + partyGap,
      y,
      partyW,
      partyH,
      'POC LOADING',
      this.dashPlain(loading?.loadingContactName),
      this.dashPlain(loading?.loadingContactPhone),
    );
    this.drawPartyCard(
      doc,
      MARGIN + (partyW + partyGap) * 2,
      y,
      partyW,
      partyH,
      'POC OFFLOADING',
      this.dashPlain(offLoading?.offLoadingContactName),
      this.dashPlain(offLoading?.offLoadingContactPhone),
    );

    // Page footer — matches FE printBilty `.page-footer`
    y += partyH;
    doc.fillColor(LABEL).font('Helvetica').fontSize(7);
    const footerText = `This is a system generated document. Thanks for choosing ${branding.name}.`;
    const footerH = Math.min(
      doc.heightOfString(footerText, { width: contentW }),
      FOOTER_MAX_H,
    );
    const footerY = Math.max(y + 10, PAGE_H - MARGIN - footerH);
    doc.text(footerText, MARGIN, footerY, {
      width: contentW,
      height: FOOTER_MAX_H,
      align: 'center',
      ellipsis: true,
    });
  }

  /** Matches FE bilty contact line: Govt Reg No | Phone | Email | WhatsApp (no NTN). */
  private companyContactLine(branding: PrintBranding): string {
    const govtRegNo = branding.govtRegNo.trim();
    const landline = branding.ptcl.trim();
    const mobile = branding.phone.trim();
    const whatsapp = branding.whatsapp.trim();
    const email = branding.email.trim();
    const phone = landline || mobile;
    const parts: string[] = [];
    if (govtRegNo) parts.push(`Govt Reg No: ${govtRegNo}`);
    if (phone) parts.push(`Phone: ${phone}`);
    if (email) parts.push(`Email: ${email}`);
    // Only show WhatsApp when it is actually set in business info.
    if (whatsapp) parts.push(`WhatsApp: ${whatsapp}`);
    return parts.join('  |  ');
  }

  private normalizeStopContacts(
    list?: StopContact[] | null,
  ): StopContact[] {
    if (!Array.isArray(list)) return [];
    return list
      .map((s) => ({
        name: (s?.name ?? '').trim(),
        phone: (s?.phone ?? '').trim(),
        address: (s?.address ?? '').trim(),
      }))
      .filter((s) => s.name || s.phone || s.address);
  }

  /**
   * Flat rows for stop card. Base fields first; then optional
   * compact "Stop contacts" lines — matches FE `stopContactsBlock`.
   */
  private loadingRows(loading?: BiltyLoading): StopCardRow[] {
    const rows: StopCardRow[] = [
      ['Consignee / Sender', this.dashPlain(loading?.client?.companyName)],
      ['Loading Date', this.fmtDate(loading?.loadingDate)],
      [
        'Arrival date & time',
        this.fmtDateTime(loading?.loadingArrivalDateTime),
      ],
      [
        'No of loading stops',
        loading?.noOfLoadingStops != null
          ? String(loading.noOfLoadingStops)
          : '—',
      ],
      [
        'Pickup Address',
        this.addressOf(
          loading?.pickupLocation?.name,
          loading?.pickupLocation?.address,
        ),
      ],
    ];
    return [...rows, ...this.stopContactRows(loading?.stopsContact)];
  }

  private offLoadingRows(offLoading?: BiltyOffLoading): StopCardRow[] {
    const rows: StopCardRow[] = [
      ['Receiver', this.dashPlain(offLoading?.client?.companyName)],
      [
        'Offloading date & time',
        this.fmtDateTime(offLoading?.offLoadingDateTime),
      ],
      [
        'Arrival date & time',
        this.fmtDateTime(offLoading?.offLoadingArrivalDateTime),
      ],
      [
        'No of Offloading stop',
        offLoading?.noOfOffLoadingStops != null
          ? String(offLoading.noOfOffLoadingStops)
          : '—',
      ],
      [
        'Destination Address',
        this.addressOf(
          offLoading?.dropoffLocation?.name,
          offLoading?.dropoffLocation?.address,
        ),
      ],
    ];
    return [...rows, ...this.stopContactRows(offLoading?.stopsContact)];
  }

  /** Compact one-line per contact: `address (name) · phone` (FE print). */
  private formatStopContactLine(s: StopContact): string {
    const head =
      s.address && s.name
        ? `${s.address} (${s.name})`
        : s.name || s.address;
    return [head, s.phone].filter(Boolean).join(' · ');
  }

  private stopContactRows(stops?: StopContact[] | null): StopCardRow[] {
    const list = this.normalizeStopContacts(stops);
    if (!list.length) return [];
    const lines = list
      .map((s) => this.formatStopContactLine(s))
      .filter(Boolean);
    if (!lines.length) return [];
    return [{ section: 'STOP CONTACTS' }, ...lines.map((line) => ({ line }))];
  }

  /** Height of one label/value stop row — value wraps like FE `.stop-value`. */
  private stopRowHeight(
    doc: PDFKit.PDFDocument,
    w: number,
    label: string,
    value: string,
  ): number {
    const labelW = this.stopLabelWidth(w);
    const valueW = this.stopValueWidth(w);
    doc.font('Helvetica').fontSize(STOP_FONT);
    const labelH = doc.heightOfString(label, { width: labelW });
    doc.font('Helvetica-Bold').fontSize(STOP_FONT);
    const valueH = doc.heightOfString(value, { width: valueW });
    return Math.max(labelH, valueH, STOP_FONT + 2) + STOP_ROW_PAD_Y * 2;
  }

  private stopLabelWidth(w: number): number {
    return (w - 20) * 0.38;
  }

  private stopValueWidth(w: number): number {
    return (w - 20) * 0.62 - STOP_GAP_X;
  }

  /** Height of one compact stop-contact line (FE `.stop-contact-line`). */
  private stopContactLineHeight(
    doc: PDFKit.PDFDocument,
    w: number,
    line: string,
  ): number {
    doc.font('Helvetica-Bold').fontSize(STOP_FONT);
    const h = doc.heightOfString(line, { width: w - 20 });
    return Math.max(h, STOP_FONT + 2) + 2;
  }

  /** Card height grows with wrapped addresses / stop contacts. */
  private measureStopCardHeight(
    doc: PDFKit.PDFDocument,
    w: number,
    rows: StopCardRow[],
  ): number {
    let h = STOP_BODY_TOP;
    for (const row of rows) {
      if ('section' in row) h += STOP_SECTION_H;
      else if ('line' in row) h += this.stopContactLineHeight(doc, w, row.line);
      else h += this.stopRowHeight(doc, w, row[0], row[1]);
    }
    return h + STOP_BODY_BOTTOM;
  }

  private drawStopCard(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    w: number,
    h: number,
    title: string,
    rows: StopCardRow[],
  ) {
    this.roundedRect(doc, x, y, w, h, 10);
    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(9)
      .text(title, x + 10, y + 9, { width: w - 20, lineBreak: false });
    doc
      .moveTo(x + 10, y + 24)
      .lineTo(x + w - 10, y + 24)
      .strokeColor('#eef2f7')
      .stroke();

    const labelW = this.stopLabelWidth(w);
    const valueW = this.stopValueWidth(w);
    const valueX = x + 10 + labelW + STOP_GAP_X;

    let rowY = y + STOP_BODY_TOP;
    rows.forEach((row, idx) => {
      if ('section' in row) {
        const isHead = row.section === 'STOP CONTACTS';
        doc
          .fillColor(isHead ? LABEL : '#475569')
          .font('Helvetica-Bold')
          .fontSize(isHead ? 7 : 7)
          .text(row.section, x + 10, rowY + 3, {
            width: w - 20,
            lineBreak: false,
          });
        rowY += STOP_SECTION_H;
        return;
      }

      if ('line' in row) {
        const lineH = this.stopContactLineHeight(doc, w, row.line);
        doc
          .fillColor('#334155')
          .font('Helvetica-Bold')
          .fontSize(STOP_FONT)
          .text(row.line, x + 10, rowY, { width: w - 20 });
        rowY += lineH;
        return;
      }

      const [label, value] = row;
      const rowH = this.stopRowHeight(doc, w, label, value);
      const textY = rowY + STOP_ROW_PAD_Y;
      doc
        .fillColor(MUTED)
        .font('Helvetica')
        .fontSize(STOP_FONT)
        .text(label, x + 10, textY, { width: labelW });
      doc
        .fillColor(VALUE)
        .font('Helvetica-Bold')
        .fontSize(STOP_FONT)
        .text(value, valueX, textY, { width: valueW, align: 'right' });
      rowY += rowH;

      // Dotted divider between label/value rows only (not contact lines).
      const next = rows[idx + 1];
      if (next && Array.isArray(next)) {
        doc
          .moveTo(x + 10, rowY)
          .lineTo(x + w - 10, rowY)
          .dash(1.5, { space: 2 })
          .strokeColor(BORDER)
          .stroke()
          .undash();
      }
    });
  }

  /**
   * Matches FE `termsAndConditionsBlock` — 4 declaration clauses with firm name.
   * Returns Y just below the drawn box.
   */
  private drawTermsAndConditions(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    w: number,
    branding: PrintBranding,
  ): number {
    const firm = branding.name.trim() || 'ZS Logistics';
    const padX = 10;
    const padY = 8;
    const title = 'IMPORTANT TERMS & CONDITIONS / DECLARATION:';
    const items = [
      `We accept goods from ${firm} & I confirm that goods condition is good at the time of delivery.`,
      `After delivery ${firm} does NOT responsible for anything. Please check & counts goods item before receiving sign & stamp.`,
      'Company is not responsible for any leakage, breakage or damage due to road accident or natural calamity.',
      "Goods booked at owner's risk. No claim after delivery.",
    ];

    const innerW = w - padX * 2;
    const titleFont = 8;
    const itemFont = 7;
    const lineGap = 2;
    const itemGap = 3;

    doc.font('Helvetica-Bold').fontSize(titleFont);
    const titleH = doc.heightOfString(title, { width: innerW });

    let bodyH = 0;
    doc.font('Helvetica').fontSize(itemFont);
    items.forEach((item, i) => {
      bodyH +=
        doc.heightOfString(`${i + 1}. ${item}`, { width: innerW }) + itemGap;
    });
    bodyH -= itemGap; // no gap after last item

    const boxH = padY + titleH + 5 + bodyH + padY;
    // Transparent fill like FE `.terms { background: transparent }`
    doc.roundedRect(x, y, w, boxH, 8).lineWidth(1).strokeColor(BORDER).stroke();

    let cy = y + padY;
    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(titleFont)
      .text(title, x + padX, cy, { width: innerW });
    cy = doc.y + 5;

    items.forEach((item, i) => {
      const line = `${i + 1}. ${item}`;
      doc
        .fillColor('#334155')
        .font('Helvetica')
        .fontSize(itemFont)
        .text(line, x + padX, cy, { width: innerW, lineGap });
      cy = doc.y + itemGap;
    });

    return y + boxH;
  }

  private drawPartyCard(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    w: number,
    h: number,
    title: string,
    name: string,
    phone: string,
  ) {
    this.roundedRect(doc, x, y, w, h, 10);
    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(8)
      .text(title, x + 10, y + 9, { width: w - 20 });

    doc
      .fillColor(LABEL)
      .font('Helvetica-Bold')
      .fontSize(6.5)
      .text('NAME', x + 10, y + 26);
    doc
      .fillColor(VALUE)
      .font('Helvetica-Bold')
      .fontSize(9)
      .text(name, x + 10, y + 35, {
        width: w - 20,
        lineBreak: false,
        ellipsis: true,
      });

    doc
      .fillColor(LABEL)
      .font('Helvetica-Bold')
      .fontSize(6.5)
      .text('CELL NO.', x + 10, y + 48);
    doc
      .fillColor(VALUE)
      .font('Helvetica-Bold')
      .fontSize(9)
      .text(phone, x + 10, y + 57, {
        width: w - 20,
        lineBreak: false,
        ellipsis: true,
      });

    // Blank Date row (FE partyCol — handwritten date space)
    doc
      .fillColor(LABEL)
      .font('Helvetica-Bold')
      .fontSize(6.5)
      .text('DATE', x + 10, y + 70);

    // Stamp + Signature (FE: taller stamp 56px / signature 40px)
    const signTop = y + 86;
    doc
      .moveTo(x + 10, signTop)
      .lineTo(x + w - 10, signTop)
      .dash(1.5, { space: 2 })
      .strokeColor(BORDER)
      .stroke()
      .undash();

    doc
      .fillColor(LABEL)
      .font('Helvetica-Bold')
      .fontSize(6.5)
      .text('STAMP', x + 10, signTop + 4);
    doc
      .roundedRect(x + 10, signTop + 13, w - 20, 42, 5)
      .lineWidth(0.8)
      .dash(2, { space: 2 })
      .strokeColor('#cbd5e1')
      .stroke()
      .undash();

    doc
      .fillColor(LABEL)
      .font('Helvetica-Bold')
      .fontSize(6.5)
      .text('SIGNATURE', x + 10, signTop + 60);
    doc
      .moveTo(x + 10, signTop + 88)
      .lineTo(x + w - 10, signTop + 88)
      .strokeColor('#94a3b8')
      .lineWidth(0.8)
      .stroke();
  }

  private drawWatermark(
    doc: PDFKit.PDFDocument,
    label: string,
    status: BiltyStatus,
  ) {
    const color = this.statusWatermarkColor(status);
    doc.save();
    doc.opacity(0.12);
    doc
      .fillColor(color)
      .font('Helvetica-Bold')
      .fontSize(64)
      .rotate(-28, { origin: [PAGE_W / 2, PAGE_H / 2] })
      .text(label.toUpperCase(), 40, PAGE_H / 2 - 20, {
        width: PAGE_W - 80,
        align: 'center',
        lineBreak: false,
      });
    doc.restore();
  }

  private drawLogoFallback(
    doc: PDFKit.PDFDocument,
    name: string,
    x: number,
    y: number,
    size = 72,
  ) {
    doc.roundedRect(x, y, size, size, 8).fillAndStroke('#eef2f7', BORDER);
    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(9)
      .text(name, x + 4, y + size / 2 - 6, {
        width: size - 8,
        align: 'center',
      });
  }

  private roundedRect(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ) {
    doc.lineWidth(1).strokeColor(BORDER).roundedRect(x, y, w, h, r).stroke();
  }

  private statusWatermarkColor(status: BiltyStatus): string {
    if (status === BiltyStatus.COMPLETED) return '#1d4ed8';
    if (status === BiltyStatus.APPROVED) return '#059669';
    if (status === BiltyStatus.CANCELLED) return '#dc2626';
    return '#b45309';
  }

  private async loadBilty(
    where: { id: string } | { code: string },
  ): Promise<Bilty | null> {
    const bilty = await this.biltyRepo.findOne({
      where,
      relations: {
        driver: { user: true },
        broker: true,
        transporter: true,
        vehicle: true,
        loadings: { client: true, pickupLocation: true },
        offLoadings: { client: true, dropoffLocation: true },
      },
    });
    if (!bilty) return null;

    bilty.loadings = [...(bilty.loadings ?? [])].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    bilty.offLoadings = [...(bilty.offLoadings ?? [])].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    return bilty;
  }

  private async resolveBranding(): Promise<PrintBranding> {
    const setting = await this.settingRepo.findOne({
      where: { key: SystemSettingKey.BUSINESS_INFO },
    });
    const value: BusinessInfoSettingValue = {
      ...DEFAULT_BUSINESS_INFO,
      ...((setting?.value as BusinessInfoSettingValue | undefined) ?? {}),
    };

    const name =
      (value.companyName ?? '').trim() ||
      DEFAULT_BUSINESS_INFO.companyName ||
      'ZS Logistics';
    const ntn = (value.ntn ?? '').trim() || '';
    const govtRegNo = (value.govtRegNo ?? '').trim() || '';
    const tagLine = (value.tagLine ?? '').trim() || '';
    // Bilty shows secondaryAddress as the Address line (fallback primary).
    const addressLine =
      (value.secondaryAddress ?? '').trim() ||
      (value.primaryAddress ?? '').trim() ||
      DEFAULT_BUSINESS_INFO.secondaryAddress ||
      DEFAULT_BUSINESS_INFO.primaryAddress ||
      '';
    const phone =
      (value.phone ?? '').trim() || DEFAULT_BUSINESS_INFO.phone || '';
    const ptcl = (value.ptcl ?? '').trim() || '';
    const whatsapp = (value.whatsapp ?? '').trim() || '';
    const email =
      (value.email ?? '').trim() || DEFAULT_BUSINESS_INFO.email || '';
    const logoUrl =
      (value.logoUrl ?? '').trim() || DEFAULT_BUSINESS_INFO.logoUrl || '';

    const footerParts = [name, addressLine].filter(Boolean);
    if (govtRegNo) footerParts.push(`Govt Reg No: ${govtRegNo}`);
    if (phone) footerParts.push(`Phone: ${phone}`);
    if (ptcl) footerParts.push(`PTCL: ${ptcl}`);
    if (whatsapp) footerParts.push(`WhatsApp: ${whatsapp}`);
    if (email) footerParts.push(`Email: ${email}`);

    return {
      logoUrl,
      ntn,
      govtRegNo,
      name,
      tagLine,
      addressLine,
      phone,
      ptcl,
      whatsapp,
      email,
      footerLine: footerParts.join(' | '),
    };
  }

  private async fetchLogoBuffer(logoUrl: string): Promise<Buffer | null> {
    if (!logoUrl) return null;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8_000);
      const res = await fetch(logoUrl, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) return null;
      const arr = await res.arrayBuffer();
      return Buffer.from(arr);
    } catch (err) {
      this.logger.warn(`Could not fetch bilty logo: ${String(err)}`);
      return null;
    }
  }

  private dashPlain(value?: string | null): string {
    const v = (value ?? '').trim();
    return v || '—';
  }

  private addressOf(name?: string | null, address?: string | null): string {
    const joined = [name, address].filter(Boolean).join(', ');
    return joined || '—';
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

  private fmtDateTime(value?: string | Date | null): string {
    if (value == null || value === '') return '—';
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
