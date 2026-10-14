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
import { buildCode128PngBuffer } from '../../common/utils/barcode.util';
import { buildPublicPageUrl } from '../../common/utils/public-link.util';
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
const NAVY_SOFT = '#E8F1FB';
/** FE `DRIVER_BG` — light blue driver strip. */
const DRIVER_BG = '#ADD8E6';
/** FE `VEHICLE_BG` — green vehicle column. */
const VEHICLE_BG = '#C5E17A';
const ZS_GREEN = '#A9C43F';
const MUTED = '#64748b';
const LABEL = '#94a3b8';
const VALUE = '#1A3C70';
const BORDER = '#cfd9e8';
const ICON_BG = '#E8F1FB';
const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
/** ~7mm — matches FE `@page { margin: 7mm }` */
const MARGIN = 20;

/** Meta card icon + text — matches FE `.meta-field` / `.meta-icon` (circle). */
const META_ICON = 18;
const META_ICON_GAP = 6;
const META_ROW_H = 38;

type MetaIconKind =
  | 'hash'
  | 'tag'
  | 'calendar'
  | 'file'
  | 'weight'
  | 'box'
  | 'truck';

/** Stop-card layout (loading / offloading). */
const STOP_FONT = 7.5;
const STOP_ROW_PAD_Y = 4;
const STOP_GAP_X = 8;
const STOP_SECTION_H = 15;
const STOP_HEAD_H = 26;
const STOP_BODY_TOP = STOP_HEAD_H + 4;
const STOP_BODY_BOTTOM = 8;

/**
 * Party card — FE `.party-col` navy head + stamp/signature body.
 */
const PARTY_HEAD_H = 26;
const PARTY_CARD_H = 196;

/** Footer QR inside terms card — FE `.terms-qr` (~64px). */
const FOOTER_QR_SIZE = 64;
const FOOTER_QR_LABEL_H = 12;
const FOOTER_QR_BLOCK_H = FOOTER_QR_SIZE + 4 + FOOTER_QR_LABEL_H;

/** Footer note text is clamped so it never wraps onto a new page. */
const FOOTER_NOTE_MAX_H = 20;

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
      const qrPng = await this.buildPublicQrPng(bilty.code);
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
          this.drawPage(doc, bilty, branding, mark, barcodePng, qrPng, logoBuf);
        }

        doc.end();
      });

      const vehicleReg =
        bilty.vehicle?.regNo ?? bilty.vehicleRegistrationNumber ?? null;
      const safeCode = String(bilty.code).replace(/[^\w.-]+/g, '_');
      const safeReg = (vehicleReg?.trim() || 'NO-VEHICLE')
        .replace(/[^\w.-]+/g, '_')
        .slice(0, 60);
      // Format: biltyCode-VehicleRegNo-(DD-MM-YY).pdf
      const safeIssueDate = this.fmtDateForFilename(bilty.issueDate);

      return {
        buffer,
        filename: `${safeCode}-${safeReg}-(${safeIssueDate}).pdf`,
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
    qrPng: Buffer,
    logoBuf: Buffer | null,
  ) {
    const contentW = PAGE_W - MARGIN * 2;
    const loading = bilty.loadings?.[0];
    const offLoading = bilty.offLoadings?.[0];
    const statusLabel =
      bilty.status === BiltyStatus.PENDING
        ? 'DRAFT'
        : (BILTY_STATUS_LABELS[bilty.status] ?? bilty.status);

    this.drawWatermark(doc, statusLabel, bilty.status, logoBuf);

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
      cy + 4,
      barcodeBlockBottom + 4,
    );

    // FE `.doc-banner-row` — green rules + navy pill
    y = this.drawDocBanner(doc, MARGIN, y, contentW);

    // Driver (light blue) + Vehicle (green) — FE `.banner-row`
    y += 8;
    y = this.drawDriverVehicleBanners(doc, MARGIN, y, contentW, bilty);

    // Meta card — FE `.meta-grid` (4 cols; description/remarks span-2)
    y += 8;
    y = this.drawMetaCard(doc, MARGIN, y, contentW, bilty);

    // Loading / Offloading
    y += 8;
    const stopGap = 8;
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
      'loading',
    );
    this.drawStopCard(
      doc,
      MARGIN + stopW + stopGap,
      y,
      stopW,
      stopH,
      'OFFLOADING DETAILS',
      offLoadingRows,
      'offload',
    );

    // Parties — FE printBilty: always 3 cols
    // Transporter (or company details if no transporter) | POC Loading | POC Offloading
    y += stopH + 10;
    const transporterName = (
      bilty.transporterName ||
      bilty.transporter?.companyName ||
      ''
    ).trim();
    const transporterPhone = (bilty.transporterPhone || '').trim();
    const hasTransporter = Boolean(transporterName || transporterPhone);

    type PartyCol = { title: string; name: string; phone: string };
    const parties: PartyCol[] = [
      {
        title: 'TRANSPORTER',
        name: hasTransporter
          ? this.dashPlain(transporterName)
          : this.dashPlain(branding.name),
        phone: hasTransporter
          ? this.dashPlain(transporterPhone)
          : this.dashPlain(branding.phone || branding.ptcl),
      },
      {
        title: 'POC LOADING',
        name: this.dashPlain(loading?.loadingContactName),
        phone: this.dashPlain(loading?.loadingContactPhone),
      },
      {
        title: 'POC OFFLOADING',
        name: this.dashPlain(offLoading?.offLoadingContactName),
        phone: this.dashPlain(offLoading?.offLoadingContactPhone),
      },
    ];

    const partyGap = 8;
    const partyCount = parties.length;
    const partyW = (contentW - partyGap * (partyCount - 1)) / partyCount;
    const partyH = PARTY_CARD_H;
    parties.forEach((party, i) => {
      this.drawPartyCard(
        doc,
        MARGIN + i * (partyW + partyGap),
        y,
        partyW,
        partyH,
        party.title,
        party.name,
        party.phone,
      );
    });

    // Terms + QR single card (FE `.terms-card`)
    y += partyH + 8;
    y = this.drawTermsAndConditions(doc, MARGIN, y, contentW, branding, qrPng);

    // Page footer note (centered, navy)
    const footerText = `This is a system generated document. Thanks for choosing ${branding.name}.`;
    const footerY = Math.min(y + 8, PAGE_H - MARGIN - FOOTER_NOTE_MAX_H);
    doc
      .fillColor(NAVY)
      .font('Helvetica')
      .fontSize(7)
      .text(footerText, MARGIN, footerY, {
        width: contentW,
        height: FOOTER_NOTE_MAX_H,
        align: 'center',
        ellipsis: true,
      });
  }

  /** FE `.doc-banner-row` — green rules flanking navy pill. */
  private drawDocBanner(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    contentW: number,
  ): number {
    const pillLabel = 'DIGITAL CONSIGNMENT NOTE';
    doc.font('Helvetica-Bold').fontSize(11);
    const textW = doc.widthOfString(pillLabel);
    const pillPadX = 18;
    const pillH = 24;
    const pillW = textW + pillPadX * 2;
    const gap = 10;
    const ruleW = Math.max(12, (contentW - pillW - gap * 2) / 2);
    const midY = y + pillH / 2;

    doc
      .moveTo(x, midY)
      .lineTo(x + ruleW, midY)
      .strokeColor(ZS_GREEN)
      .lineWidth(2)
      .stroke();

    const pillX = x + ruleW + gap;
    doc.save();
    doc.roundedRect(pillX, y, pillW, pillH, pillH / 2).fill(NAVY);
    doc
      .fillColor('#FFFFFF')
      .font('Helvetica-Bold')
      .fontSize(11)
      .text(pillLabel, pillX, y + 6, {
        width: pillW,
        align: 'center',
        lineBreak: false,
      });
    doc.restore();

    doc
      .moveTo(pillX + pillW + gap, midY)
      .lineTo(x + contentW, midY)
      .strokeColor(ZS_GREEN)
      .lineWidth(2)
      .stroke();

    return y + pillH;
  }

  /**
   * FE `.banner-row`: bordered shell → light-blue driver cols + green vehicle.
   */
  private drawDriverVehicleBanners(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    contentW: number,
    bilty: Bilty,
  ): number {
    const shellPad = 5;
    const innerH = 44;
    const shellH = innerH + shellPad * 2;
    const gap = 6;

    const driverName = this.dashPlain(bilty.driver?.user?.name).toUpperCase();
    const driverPhone = this.dashPlain(bilty.driver?.phone).toUpperCase();
    const vehicleNo = this.dashPlain(
      bilty.vehicle?.regNo ?? bilty.vehicleRegistrationNumber,
    ).toUpperCase();

    const vehicleW = Math.min(160, Math.max(120, contentW * 0.28));
    const driverW = contentW - shellPad * 2 - gap - vehicleW;
    const innerY = y + shellPad;
    const driverX = x + shellPad;
    const vehicleX = driverX + driverW + gap;

    this.roundedRect(doc, x, y, contentW, shellH, 10);

    // Driver strip (2 cols)
    doc.save();
    doc.roundedRect(driverX, innerY, driverW, innerH, 7).fill(DRIVER_BG);
    const half = driverW / 2;
    this.drawBannerCol(
      doc,
      driverX,
      innerY,
      half,
      innerH,
      'user',
      'ASSIGNED DRIVER',
      driverName,
    );
    doc
      .moveTo(driverX + half, innerY + 8)
      .lineTo(driverX + half, innerY + innerH - 8)
      .strokeColor('#7BA3C9')
      .lineWidth(0.8)
      .stroke();
    this.drawBannerCol(
      doc,
      driverX + half,
      innerY,
      half,
      innerH,
      'phone',
      'DRIVER PHONE',
      driverPhone,
    );
    doc.restore();

    // Vehicle strip
    doc.save();
    doc.roundedRect(vehicleX, innerY, vehicleW, innerH, 7).fill(VEHICLE_BG);
    this.drawBannerCol(
      doc,
      vehicleX,
      innerY,
      vehicleW,
      innerH,
      'truck',
      'VEHICLE NO.',
      vehicleNo,
    );
    doc.restore();

    return y + shellH;
  }

  private drawBannerCol(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    w: number,
    h: number,
    icon: 'user' | 'phone' | 'truck',
    label: string,
    value: string,
  ) {
    const ico = 22;
    const padX = 10;
    const icoX = x + padX;
    const icoY = y + (h - ico) / 2;
    this.drawBannerIcon(doc, icoX, icoY, ico, icon);

    const tx = icoX + ico + 8;
    const tw = Math.max(20, w - (tx - x) - 8);
    const textY = y + (h - 22) / 2;
    doc
      .fillColor('#4A6A94')
      .font('Helvetica-Bold')
      .fontSize(6.5)
      .text(label, tx, textY, { width: tw, lineBreak: false });
    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(10)
      .text(value, tx, textY + 10, {
        width: tw,
        lineBreak: false,
        ellipsis: true,
      });
  }

  private drawBannerIcon(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    s: number,
    kind: 'user' | 'phone' | 'truck',
  ) {
    const cx = x + s / 2;
    const cy = y + s / 2;
    doc.save();
    doc.circle(cx, cy, s / 2).fill(NAVY);
    doc.strokeColor('#FFFFFF').fillColor('#FFFFFF').lineWidth(1.2);

    if (kind === 'user') {
      doc.circle(cx, cy - 3, 3).fill('#FFFFFF');
      doc
        .moveTo(cx - 5, cy + 6)
        .quadraticCurveTo(cx, cy + 2, cx + 5, cy + 6)
        .stroke();
    } else if (kind === 'phone') {
      doc
        .roundedRect(cx - 3.5, cy - 6, 7, 12, 1.5)
        .stroke();
      doc
        .moveTo(cx - 1.5, cy + 4.5)
        .lineTo(cx + 1.5, cy + 4.5)
        .stroke();
    } else {
      // truck silhouette
      doc
        .roundedRect(cx - 7, cy - 2, 9, 6, 1)
        .fill('#FFFFFF');
      doc
        .roundedRect(cx + 1, cy - 4, 6, 8, 1)
        .fill('#FFFFFF');
      doc.circle(cx - 4, cy + 5, 1.8).fill('#FFFFFF');
      doc.circle(cx + 4, cy + 5, 1.8).fill('#FFFFFF');
    }
    doc.restore();
  }

  /** FE `.meta-grid` with span-2 description / remarks. */
  private drawMetaCard(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    contentW: number,
    bilty: Bilty,
  ): number {
    type MetaCell = {
      icon: MetaIconKind;
      label: string;
      value: string;
      span?: 1 | 2;
    };
    const cells: MetaCell[] = [
      { icon: 'tag', label: 'BILTY CODE', value: this.dashPlain(bilty.code) },
      {
        icon: 'calendar',
        label: 'ISSUE DATE',
        value: this.fmtDate(bilty.issueDate),
      },
      {
        icon: 'file',
        label: 'CLIENT REFERENCE',
        value: this.dashPlain(bilty.refNumber),
      },
      {
        icon: 'weight',
        label: 'TOTAL WEIGHT',
        value: this.dashPlain(bilty.totalWeight),
      },
      {
        icon: 'box',
        label: 'PACKAGES',
        value: this.dashPlain(bilty.noOfPackages),
      },
      {
        icon: 'truck',
        label: 'PRODUCT ITEM',
        value: this.dashPlain(bilty.transportationProduct?.name),
      },
      {
        icon: 'file',
        label: 'PRODUCT DESCRIPTION',
        value: this.dashPlain(bilty.description),
        span: 2,
      },
    ];
    if (bilty.remarks?.trim()) {
      cells.push({
        icon: 'file',
        label: 'REMARKS',
        value: this.dashPlain(bilty.remarks),
        span: 2,
      });
    }

    const cols = 4;
    const colW = contentW / cols;
    // Pack into rows respecting span
    const rows: MetaCell[][] = [];
    let cur: MetaCell[] = [];
    let used = 0;
    for (const cell of cells) {
      const span = cell.span ?? 1;
      if (used + span > cols) {
        rows.push(cur);
        cur = [];
        used = 0;
      }
      cur.push(cell);
      used += span;
      if (used === cols) {
        rows.push(cur);
        cur = [];
        used = 0;
      }
    }
    if (cur.length) rows.push(cur);

    const metaH = rows.length * META_ROW_H;
    this.roundedRect(doc, x, y, contentW, metaH, 10);

    rows.forEach((row, ri) => {
      let col = 0;
      row.forEach((cell) => {
        const span = cell.span ?? 1;
        const mx = x + col * colW;
        const my = y + ri * META_ROW_H;
        const mw = colW * span;
        this.drawMetaField(doc, mx + 10, my + 8, mw - 16, cell.icon, cell.label, cell.value);

        // Vertical divider (not after last col / span-2 end)
        if (col + span < cols) {
          doc
            .moveTo(mx + mw, my + META_ROW_H * 0.2)
            .lineTo(mx + mw, my + META_ROW_H * 0.8)
            .strokeColor('#dbe3ef')
            .lineWidth(0.8)
            .stroke();
        }
        col += span;
      });
      // Horizontal rule under row 1 only (FE)
      if (ri === 0) {
        doc
          .moveTo(x, y + META_ROW_H)
          .lineTo(x + contentW, y + META_ROW_H)
          .strokeColor('#dbe3ef')
          .lineWidth(0.8)
          .stroke();
      }
    });

    return y + metaH;
  }

  /** FE `.meta-field`: circular icon + label/value. */
  private drawMetaField(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    w: number,
    icon: MetaIconKind,
    label: string,
    value: string,
  ) {
    this.drawMetaIcon(doc, x, y + 1, icon);
    const tx = x + META_ICON + META_ICON_GAP;
    const tw = Math.max(20, w - META_ICON - META_ICON_GAP);
    doc
      .fillColor(LABEL)
      .font('Helvetica-Bold')
      .fontSize(6.5)
      .text(label, tx, y, { width: tw, lineBreak: false });
    doc
      .fillColor(VALUE)
      .font('Helvetica-Bold')
      .fontSize(9.5)
      .text(value, tx, y + 11, {
        width: tw,
        lineBreak: false,
        ellipsis: true,
      });
  }

  private drawMetaIcon(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    kind: MetaIconKind,
  ) {
    const s = META_ICON;
    doc.save();
    doc.circle(x + s / 2, y + s / 2, s / 2).fill(ICON_BG);
    const cx = x + s / 2;
    const cy = y + s / 2;
    doc.strokeColor(NAVY).lineWidth(1.1).lineCap('round').lineJoin('round');

    if (kind === 'hash' || kind === 'tag') {
      // tag-ish / hash
      if (kind === 'tag') {
        doc
          .moveTo(x + 5, y + 6)
          .lineTo(x + 9, y + 4)
          .lineTo(x + s - 4, y + 9)
          .lineTo(x + s - 6, y + s - 5)
          .lineTo(x + 5, y + 11)
          .closePath()
          .stroke();
        doc.circle(x + 8, y + 8, 1.2).fill(NAVY);
      } else {
        doc
          .moveTo(x + 5, y + 7)
          .lineTo(x + s - 5, y + 7)
          .moveTo(x + 5, y + 11)
          .lineTo(x + s - 5, y + 11)
          .moveTo(x + 7.5, y + 4.5)
          .lineTo(x + 6, y + s - 4.5)
          .moveTo(x + s - 6, y + 4.5)
          .lineTo(x + s - 7.5, y + s - 4.5)
          .stroke();
      }
    } else if (kind === 'calendar') {
      doc.roundedRect(x + 4.5, y + 5.5, s - 9, s - 10, 1.5).stroke();
      doc
        .moveTo(x + 7, y + 4)
        .lineTo(x + 7, y + 7)
        .moveTo(x + s - 7, y + 4)
        .lineTo(x + s - 7, y + 7)
        .moveTo(x + 4.5, y + 9)
        .lineTo(x + s - 4.5, y + 9)
        .stroke();
    } else if (kind === 'file') {
      doc
        .moveTo(x + 6, y + 4)
        .lineTo(x + 11, y + 4)
        .lineTo(x + s - 5, y + 8)
        .lineTo(x + s - 5, y + s - 4)
        .lineTo(x + 6, y + s - 4)
        .closePath()
        .stroke();
      doc
        .moveTo(x + 11, y + 4)
        .lineTo(x + 11, y + 8)
        .lineTo(x + s - 5, y + 8)
        .stroke();
    } else if (kind === 'weight') {
      doc
        .moveTo(cx, y + 4)
        .lineTo(cx, y + 7)
        .moveTo(x + 5.5, y + s - 4.5)
        .lineTo(x + s - 5.5, y + s - 4.5)
        .lineTo(x + s - 7, y + 9)
        .lineTo(x + 7, y + 9)
        .closePath()
        .stroke();
    } else if (kind === 'truck') {
      doc
        .roundedRect(x + 4, y + 7, 7, 5, 1)
        .stroke();
      doc
        .roundedRect(x + 10, y + 5, 4.5, 7, 1)
        .stroke();
      doc.circle(x + 6.5, y + 13, 1.4).stroke();
      doc.circle(x + 12.5, y + 13, 1.4).stroke();
    } else {
      // box
      doc
        .moveTo(cx, y + 4.5)
        .lineTo(x + s - 5, y + 8)
        .lineTo(x + s - 5, y + s - 6)
        .lineTo(cx, y + s - 3.5)
        .lineTo(x + 5, y + s - 6)
        .lineTo(x + 5, y + 8)
        .closePath()
        .stroke();
      doc
        .moveTo(cx, y + 4.5)
        .lineTo(cx, cy + 1)
        .moveTo(x + 5, y + 8)
        .lineTo(cx, cy + 1)
        .lineTo(x + s - 5, y + 8)
        .stroke();
    }
    doc.restore();
  }

  /** QR PNG encoding the frontend public bilty page URL (FE `biltyPublicQrSvg`). */
  private async buildPublicQrPng(code: string): Promise<Buffer> {
    return QRCode.toBuffer(buildPublicPageUrl('biltys', code), {
      type: 'png',
      width: 160,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: NAVY, light: '#FFFFFF' },
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
      [
        'Departure date & time',
        this.fmtDateTime(loading?.departureDateTime),
      ],
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
    return [
      ...rows,
      ...this.stopContactRows(loading?.stopsContact, 'LOADING STATIONS'),
    ];
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
    return [
      ...rows,
      ...this.stopContactRows(
        offLoading?.stopsContact,
        'OFF LOADING STATIONS',
      ),
    ];
  }

  /** Compact one-line per contact: `address (name) · phone` (FE print). */
  private formatStopContactLine(s: StopContact): string {
    const head =
      s.address && s.name
        ? `${s.address} (${s.name})`
        : s.name || s.address;
    return [head, s.phone].filter(Boolean).join(' · ');
  }

  private stopContactRows(
    stops?: StopContact[] | null,
    sectionTitle = 'STOP CONTACTS',
  ): StopCardRow[] {
    const list = this.normalizeStopContacts(stops);
    if (!list.length) return [];
    const lines = list
      .map((s) => this.formatStopContactLine(s))
      .filter(Boolean);
    if (!lines.length) return [];
    return [{ section: sectionTitle }, ...lines.map((line) => ({ line }))];
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
    variant: 'loading' | 'offload' = 'loading',
  ) {
    this.roundedRect(doc, x, y, w, h, 10);

    // FE `.stop-head` — navy (loading) / green (offload)
    const headColor = variant === 'offload' ? ZS_GREEN : NAVY;
    doc.save();
    doc
      .moveTo(x, y + STOP_HEAD_H)
      .lineTo(x, y + 10)
      .quadraticCurveTo(x, y, x + 10, y)
      .lineTo(x + w - 10, y)
      .quadraticCurveTo(x + w, y, x + w, y + 10)
      .lineTo(x + w, y + STOP_HEAD_H)
      .closePath()
      .fill(headColor);
    doc
      .fillColor('#FFFFFF')
      .font('Helvetica-Bold')
      .fontSize(9)
      .text(title, x + 12, y + 8, { width: w - 24, lineBreak: false });
    doc.restore();

    const labelW = this.stopLabelWidth(w);
    const valueW = this.stopValueWidth(w);
    const valueX = x + 10 + labelW + STOP_GAP_X;

    let rowY = y + STOP_BODY_TOP;
    rows.forEach((row, idx) => {
      if ('section' in row) {
        doc
          .fillColor(NAVY)
          .font('Helvetica-Bold')
          .fontSize(7)
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
          .fillColor(NAVY)
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
   * FE `.terms-card` — navy icon + terms list + vertical divider + QR.
   */
  private drawTermsAndConditions(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    w: number,
    branding: PrintBranding,
    qrPng?: Buffer,
  ): number {
    const firm = branding.name.trim() || 'ZS Logistics';
    const padX = 12;
    const padY = 10;
    const ico = 22;
    const gap = 10;
    const title = 'IMPORTANT TERMS & CONDITIONS / DECLARATION:';
    const items = [
      `We accept goods from ${firm} & I confirm that goods condition is good at the time of delivery.`,
      `After delivery ${firm} does NOT responsible for anything. Please check & counts goods item before receiving sign & stamp.`,
      'Company is not responsible for any leakage, breakage or damage due to road accident or natural calamity.',
      "Goods booked at owner's risk. No claim after delivery.",
    ];

    const qrBlockW = qrPng ? FOOTER_QR_SIZE + 16 : 0;
    const mainX = x + padX + ico + gap;
    const mainW =
      w - padX * 2 - ico - gap - (qrPng ? qrBlockW + gap + 8 : 0);
    const titleFont = 8;
    const itemFont = 7;
    const itemGap = 3;

    doc.font('Helvetica-Bold').fontSize(titleFont);
    const titleH = doc.heightOfString(title, { width: mainW });
    let bodyH = 0;
    doc.font('Helvetica').fontSize(itemFont);
    items.forEach((item, i) => {
      bodyH +=
        doc.heightOfString(`${i + 1}. ${item}`, { width: mainW }) + itemGap;
    });
    bodyH -= itemGap;

    const contentH = titleH + 5 + bodyH;
    const boxH = Math.max(
      padY * 2 + contentH,
      qrPng ? padY * 2 + FOOTER_QR_BLOCK_H : 0,
    );

    this.roundedRect(doc, x, y, w, boxH, 10);

    // Navy file icon box
    doc.save();
    doc
      .roundedRect(x + padX, y + padY, ico, ico, 5)
      .fill(NAVY);
    doc.strokeColor('#FFFFFF').lineWidth(1);
    doc
      .moveTo(x + padX + 6, y + padY + 5)
      .lineTo(x + padX + 12, y + padY + 5)
      .lineTo(x + padX + 16, y + padY + 9)
      .lineTo(x + padX + 16, y + padY + 17)
      .lineTo(x + padX + 6, y + padY + 17)
      .closePath()
      .stroke();
    doc
      .moveTo(x + padX + 12, y + padY + 5)
      .lineTo(x + padX + 12, y + padY + 9)
      .lineTo(x + padX + 16, y + padY + 9)
      .stroke();
    doc.restore();

    let cy = y + padY;
    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(titleFont)
      .text(title, mainX, cy, { width: mainW });
    cy = doc.y + 4;

    items.forEach((item, i) => {
      doc
        .fillColor('#475569')
        .font('Helvetica')
        .fontSize(itemFont)
        .text(`${i + 1}. ${item}`, mainX, cy, { width: mainW, lineGap: 1 });
      cy = doc.y + itemGap;
    });

    if (qrPng) {
      const divX = x + w - padX - qrBlockW - 6;
      doc
        .moveTo(divX, y + padY)
        .lineTo(divX, y + boxH - padY)
        .strokeColor('#e2e8f0')
        .lineWidth(1)
        .stroke();

      const qrX = divX + 10;
      const qrY = y + (boxH - FOOTER_QR_BLOCK_H) / 2;
      doc.image(qrPng, qrX, qrY, {
        width: FOOTER_QR_SIZE,
        height: FOOTER_QR_SIZE,
      });
      doc
        .fillColor(NAVY)
        .font('Helvetica-Bold')
        .fontSize(7)
        .text('SCAN', qrX, qrY + FOOTER_QR_SIZE + 3, {
          width: FOOTER_QR_SIZE,
          align: 'center',
        });
    }

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

    // FE `.party-head` navy bar
    doc.save();
    doc
      .moveTo(x, y + PARTY_HEAD_H)
      .lineTo(x, y + 10)
      .quadraticCurveTo(x, y, x + 10, y)
      .lineTo(x + w - 10, y)
      .quadraticCurveTo(x + w, y, x + w, y + 10)
      .lineTo(x + w, y + PARTY_HEAD_H)
      .closePath()
      .fill(NAVY);
    doc
      .fillColor('#FFFFFF')
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .text(title, x + 12, y + 8, { width: w - 24, lineBreak: false });
    doc.restore();

    const bx = x + 10;
    const bw = w - 20;
    let by = y + PARTY_HEAD_H + 8;

    const row = (label: string, value: string, blank = false) => {
      doc
        .fillColor(LABEL)
        .font('Helvetica-Bold')
        .fontSize(6.5)
        .text(label, bx, by);
      if (!blank) {
        doc
          .fillColor(VALUE)
          .font('Helvetica-Bold')
          .fontSize(9)
          .text(value, bx, by + 9, {
            width: bw,
            lineBreak: false,
            ellipsis: true,
          });
      }
      by += blank ? 22 : 28;
      doc
        .moveTo(bx, by - 4)
        .lineTo(bx + bw, by - 4)
        .strokeColor('#e2e8f0')
        .lineWidth(0.7)
        .stroke();
    };

    row('NAME', name);
    row('CELL NO.', phone);
    row('DATE', '', true);

    // Stamp box (FE dashed blue)
    doc
      .fillColor(LABEL)
      .font('Helvetica-Bold')
      .fontSize(6.5)
      .text('STAMP', bx, by);
    by += 10;
    doc
      .roundedRect(bx, by, bw, 40, 6)
      .lineWidth(1.2)
      .dash(2.5, { space: 2 })
      .strokeColor('#93c5fd')
      .stroke()
      .undash();
    by += 48;

    doc
      .fillColor(LABEL)
      .font('Helvetica-Bold')
      .fontSize(6.5)
      .text('SIGNATURE', bx, by);
    by += 14;
    doc
      .moveTo(bx, by)
      .lineTo(bx + bw, by)
      .strokeColor(NAVY)
      .lineWidth(1.2)
      .stroke();
  }

  /**
   * Centered logo + status text watermarks.
   * Logo matches FE `.watermark-logo`: opacity 0.06, width min(72%, 420), max-height 52%.
   */
  private drawWatermark(
    doc: PDFKit.PDFDocument,
    label: string,
    status: BiltyStatus,
    logoBuf: Buffer | null,
  ) {
    if (logoBuf) {
      const boxW = PAGE_W - MARGIN * 2;
      const boxH = PAGE_H - MARGIN * 2;
      const fitW = Math.min(boxW * 0.72, 420);
      const fitH = boxH * 0.52;
      const x = MARGIN + (boxW - fitW) / 2;
      const y = MARGIN + (boxH - fitH) / 2;
      doc.save();
      doc.opacity(0.06);
      try {
        doc.image(logoBuf, x, y, {
          fit: [fitW, fitH],
          align: 'center',
          valign: 'center',
        });
      } catch {
        // Skip logo watermark if buffer is not a valid image.
      }
      doc.restore();
    }

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
        transportationProduct: true,
        vehicle: true,
        transporter: true,
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

  /** DD-MM-YY for download filenames (from issue date, no timezone shift). */
  private fmtDateForFilename(value?: string | Date | null): string {
    if (value == null || value === '') return 'NO-DATE';
    let y: number;
    let m: number;
    let day: number;
    if (typeof value === 'string') {
      const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (match) {
        y = Number(match[1]);
        m = Number(match[2]);
        day = Number(match[3]);
      } else {
        const d = this.toDate(value);
        if (!d) return 'NO-DATE';
        y = d.getFullYear();
        m = d.getMonth() + 1;
        day = d.getDate();
      }
    } else {
      const d = this.toDate(value);
      if (!d) return 'NO-DATE';
      y = d.getFullYear();
      m = d.getMonth() + 1;
      day = d.getDate();
    }
    const yy = String(y).slice(-2).padStart(2, '0');
    return [
      String(day).padStart(2, '0'),
      String(m).padStart(2, '0'),
      yy,
    ].join('-');
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
