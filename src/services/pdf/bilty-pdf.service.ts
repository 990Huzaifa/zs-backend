import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import PDFDocument from 'pdfkit';
import * as QRCode from 'qrcode';
import { Repository } from 'typeorm';
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

const BILTY_COPY_MARKS = [
  'Office Copy',
  'Transporter Copy',
  'Receiving Copy',
] as const;

type BiltyCopyMark = (typeof BILTY_COPY_MARKS)[number];

type StopContact = { name: string; phone: string; address: string };

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
  address: 'Head Office: Office 101, DHA Phase 7 Ext, Karachi, Pakistan',
  ptcl: null,
  phone: '+92 21 3499 0000',
  whatsapp: null,
  email: 'info@zslogistics.com',
};

type PrintBranding = {
  logoUrl: string;
  ntn: string;
  name: string;
  tagLine: string;
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
    private readonly configService: ConfigService,
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
      const qrPng = await this.buildPublicQrPng(bilty.code || bilty.id);
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
          doc.addPage({ size: 'A4', margin: MARGIN });
          this.drawPage(doc, bilty, branding, mark, qrPng, logoBuf);
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

    this.drawWatermark(doc, statusLabel, bilty.status);

    const headerTop = MARGIN;
    const logoSize = 72;
    const sideCol = 80;

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
    const centerX = MARGIN + sideCol + 6;
    const centerW = contentW - sideCol * 2 - 12;
    let cy = headerTop + 2;

    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(13)
      .text(branding.name, centerX, cy, { width: centerW, align: 'center' });
    cy = doc.y + 1;

    if (branding.tagLine) {
      doc
        .fillColor(MUTED)
        .font('Helvetica-Oblique')
        .fontSize(8)
        .text(branding.tagLine, centerX, cy, {
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
    cy = doc.y + 3;

    // Copy-mark pill
    const badgeText = copyMark.toUpperCase();
    const badgeW = Math.min(120, doc.widthOfString(badgeText) + 16);
    const badgeX = centerX + (centerW - badgeW) / 2;
    const badgeY = cy;
    doc
      .lineWidth(1)
      .strokeColor(NAVY)
      .fillColor('#FFFFFF')
      .roundedRect(badgeX, badgeY, badgeW, 12, 6)
      .fillAndStroke();
    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(6.5)
      .text(badgeText, badgeX, badgeY + 2.5, {
        width: badgeW,
        align: 'center',
      });

    // QR (right)
    const qrSize = 64;
    const qrX = PAGE_W - MARGIN - qrSize;
    doc.image(qrPng, qrX, headerTop, { width: qrSize, height: qrSize });
    doc
      .rect(qrX - 1, headerTop - 1, qrSize + 2, qrSize + 2)
      .lineWidth(0.8)
      .strokeColor('#cbd5e1')
      .stroke();
    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(8)
      .text(bilty.code, qrX - 4, headerTop + qrSize + 2, {
        width: qrSize + 8,
        align: 'center',
      });

    let y = Math.max(headerTop + logoSize + 8, badgeY + 18, headerTop + qrSize + 16);
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
      this.measureStopCardHeight(loadingRows),
      this.measureStopCardHeight(offLoadingRows),
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

    // Parties — Transporter / POC Loading / POC Offloading + stamp & signature
    y += stopH + 10;
    const partyGap = 8;
    const partyW = (contentW - partyGap * 2) / 3;
    const partyH = 118;
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

    // Meta footer
    y += partyH + 12;
    doc
      .moveTo(MARGIN, y)
      .lineTo(PAGE_W - MARGIN, y)
      .strokeColor('#e2e8f0')
      .stroke();
    y += 8;
    const footerCol = contentW / 3;
    doc
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(7.5)
      .text(`Created By: ${this.dashPlain(bilty.createdBy?.name)}`, MARGIN, y, {
        width: footerCol - 6,
      });
    doc.text(
      `This is a system generated document. Thanks for choosing ${branding.name}.`,
      MARGIN + footerCol,
      y,
      { width: footerCol - 6, align: 'center' },
    );
    doc.text(
      `Created At: ${this.fmtDateTime(bilty.createdAt)}`,
      MARGIN + footerCol * 2,
      y,
      { width: footerCol, align: 'right' },
    );
    y += 16;
    doc
      .moveTo(MARGIN, y)
      .lineTo(PAGE_W - MARGIN, y)
      .strokeColor('#e2e8f0')
      .stroke();

    doc
      .fillColor(LABEL)
      .font('Helvetica')
      .fontSize(7)
      .text(branding.footerLine || branding.name, MARGIN, PAGE_H - MARGIN - 8, {
        width: contentW,
        align: 'center',
      });
  }

  /** Matches FE `companyContactLine`: NTN | Phone | Email | WhatsApp */
  private companyContactLine(branding: PrintBranding): string {
    const ntn = branding.ntn.trim();
    const landline = branding.ptcl.trim();
    const mobile = branding.phone.trim();
    const whatsapp = branding.whatsapp.trim();
    const email = branding.email.trim();
    const phone = landline || mobile;
    const parts: string[] = [];
    if (ntn) parts.push(`NTN: ${ntn}`);
    if (phone) parts.push(`Phone: ${phone}`);
    if (email) parts.push(`Email: ${email}`);
    if (whatsapp) parts.push(`WhatsApp: ${whatsapp}`);
    else if (mobile && mobile !== phone) parts.push(`WhatsApp: ${mobile}`);
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
   * "Stop contacts" section with per-stop Name/Phone/Address (FE print).
   */
  private loadingRows(
    loading?: BiltyLoading,
  ): Array<[string, string] | { section: string }> {
    const rows: Array<[string, string] | { section: string }> = [
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

  private offLoadingRows(
    offLoading?: BiltyOffLoading,
  ): Array<[string, string] | { section: string }> {
    const rows: Array<[string, string] | { section: string }> = [
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

  private stopContactRows(
    stops?: StopContact[] | null,
  ): Array<[string, string] | { section: string }> {
    const list = this.normalizeStopContacts(stops);
    if (!list.length) return [];
    const out: Array<[string, string] | { section: string }> = [
      { section: 'STOP CONTACTS' },
    ];
    list.forEach((s, i) => {
      out.push({ section: `Stop ${i + 1}` });
      out.push(['Name', this.dashPlain(s.name)]);
      out.push(['Phone', this.dashPlain(s.phone)]);
      out.push(['Address', this.dashPlain(s.address)]);
    });
    return out;
  }

  private measureStopCardHeight(
    rows: Array<[string, string] | { section: string }>,
  ): number {
    let h = 32; // title + divider
    for (const row of rows) {
      if ('section' in row) h += 14;
      else h += 16;
    }
    return Math.max(h + 10, 120);
  }

  private drawStopCard(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    w: number,
    h: number,
    title: string,
    rows: Array<[string, string] | { section: string }>,
  ) {
    this.roundedRect(doc, x, y, w, h, 10);
    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(9)
      .text(title, x + 10, y + 9, { width: w - 20 });
    doc
      .moveTo(x + 10, y + 24)
      .lineTo(x + w - 10, y + 24)
      .strokeColor('#eef2f7')
      .stroke();

    let rowY = y + 30;
    for (const row of rows) {
      if ('section' in row) {
        const isHead = row.section === 'STOP CONTACTS';
        doc
          .fillColor(isHead ? NAVY : '#475569')
          .font('Helvetica-Bold')
          .fontSize(isHead ? 7.5 : 7)
          .text(row.section, x + 10, rowY, { width: w - 20 });
        rowY += 14;
        continue;
      }

      const [label, value] = row;
      doc
        .fillColor(MUTED)
        .font('Helvetica')
        .fontSize(7.5)
        .text(label, x + 10, rowY, { width: w * 0.42, lineBreak: false });
      doc
        .fillColor(VALUE)
        .font('Helvetica-Bold')
        .fontSize(7.5)
        .text(value, x + 10 + w * 0.42, rowY, {
          width: w * 0.48,
          align: 'right',
          lineBreak: false,
          ellipsis: true,
        });
      rowY += 16;
      if (rowY < y + h - 6) {
        doc
          .moveTo(x + 10, rowY - 3)
          .lineTo(x + w - 10, rowY - 3)
          .dash(1.5, { space: 2 })
          .strokeColor(BORDER)
          .stroke()
          .undash();
      }
    }
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

    // Stamp + Signature (FE print parties)
    const signTop = y + 72;
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
      .roundedRect(x + 10, signTop + 14, w - 20, 22, 4)
      .lineWidth(0.8)
      .dash(2, { space: 2 })
      .strokeColor('#cbd5e1')
      .stroke()
      .undash();

    doc
      .fillColor(LABEL)
      .font('Helvetica-Bold')
      .fontSize(6.5)
      .text('SIGNATURE', x + 10, signTop + 40);
    doc
      .moveTo(x + 10, signTop + 54)
      .lineTo(x + w - 10, signTop + 54)
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
        createdBy: true,
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
    const tagLine = (value.tagLine ?? '').trim() || '';
    const addressLine =
      (value.address ?? '').trim() || DEFAULT_BUSINESS_INFO.address || '';
    const phone =
      (value.phone ?? '').trim() || DEFAULT_BUSINESS_INFO.phone || '';
    const ptcl = (value.ptcl ?? '').trim() || '';
    const whatsapp = (value.whatsapp ?? '').trim() || '';
    const email =
      (value.email ?? '').trim() || DEFAULT_BUSINESS_INFO.email || '';
    const logoUrl =
      (value.logoUrl ?? '').trim() || DEFAULT_BUSINESS_INFO.logoUrl || '';

    const footerParts = [name, addressLine].filter(Boolean);
    if (ntn) footerParts.push(`NTN: ${ntn}`);
    if (phone) footerParts.push(`Phone: ${phone}`);
    if (ptcl) footerParts.push(`PTCL: ${ptcl}`);
    if (whatsapp) footerParts.push(`WhatsApp: ${whatsapp}`);
    if (email) footerParts.push(`Email: ${email}`);

    return {
      logoUrl,
      ntn,
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

  private publicBiltyUrl(codeOrId: string): string {
    const frontendBase = (
      this.configService.get<string>('FRONTEND_URL') ||
      this.configService.get<string>('APP_URL') ||
      'http://localhost:5173'
    ).replace(/\/$/, '');
    return `${frontendBase}/public/biltys/${encodeURIComponent(codeOrId)}`;
  }

  private async buildPublicQrPng(codeOrId: string): Promise<Buffer> {
    const url = this.publicBiltyUrl(codeOrId);
    return QRCode.toBuffer(url, {
      type: 'png',
      width: 128,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: NAVY, light: '#FFFFFF' },
    });
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
