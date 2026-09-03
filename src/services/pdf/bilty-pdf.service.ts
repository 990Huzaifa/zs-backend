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
const MARGIN = 28;

const BILTY_COPY_MARKS = [
  'Office Copy',
  'Transporter Copy',
  'Receiving Copy',
] as const;

type BiltyCopyMark = (typeof BILTY_COPY_MARKS)[number];

const BILTY_STATUS_LABELS: Record<BiltyStatus, string> = {
  [BiltyStatus.PENDING]: 'Pending',
  [BiltyStatus.APPROVED]: 'Approved',
  [BiltyStatus.CANCELLED]: 'Cancelled',
  [BiltyStatus.COMPLETED]: 'Completed',
};

const DEFAULT_BUSINESS_INFO: BusinessInfoSettingValue = {
  logoUrl:
    'https://zsparktech-bucket.s3.eu-north-1.amazonaws.com/assets/logo.png',
  companyName: 'ZS Logistics',
  tagLine: null,
  address: 'Head Office: Office 101, DHA Phase 7 Ext, Karachi, Pakistan',
  ptcl: null,
  phone: '+92 21 3499 0000',
  email: 'info@zslogistics.com',
};

type PrintBranding = {
  logoUrl: string;
  name: string;
  addressLine: string;
  phone: string;
  ptcl: string;
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
            Title: `Bilty ${bilty.code}`,
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

    // Header: logo | BILTY + copy mark | QR
    const headerTop = MARGIN;
    if (logoBuf) {
      try {
        doc.image(logoBuf, MARGIN, headerTop, {
          fit: [72, 72],
          align: 'center',
          valign: 'center',
        });
      } catch {
        this.drawLogoFallback(doc, branding.name, MARGIN, headerTop);
      }
    } else {
      this.drawLogoFallback(doc, branding.name, MARGIN, headerTop);
    }

    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(26)
      .text('BILTY', MARGIN + 80, headerTop + 14, {
        width: contentW - 170,
        align: 'center',
      });

    const badgeW = 110;
    const badgeX = MARGIN + (contentW - badgeW) / 2;
    const badgeY = headerTop + 46;
    doc
      .lineWidth(1.2)
      .strokeColor(NAVY)
      .roundedRect(badgeX, badgeY, badgeW, 16, 8)
      .stroke();
    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(8)
      .text(copyMark.toUpperCase(), badgeX, badgeY + 4, {
        width: badgeW,
        align: 'center',
      });

    const qrX = PAGE_W - MARGIN - 72;
    doc.image(qrPng, qrX, headerTop, { width: 64, height: 64 });
    doc
      .rect(qrX - 1, headerTop - 1, 66, 66)
      .lineWidth(0.8)
      .strokeColor('#cbd5e1')
      .stroke();
    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(8)
      .text(bilty.code, qrX - 4, headerTop + 66, {
        width: 72,
        align: 'center',
      });

    let y = headerTop + 86;
    doc
      .moveTo(MARGIN, y)
      .lineTo(PAGE_W - MARGIN, y)
      .strokeColor('#e2e8f0')
      .lineWidth(1)
      .stroke();

    // Contact bar
    y += 10;
    const phoneLine =
      [branding.ptcl, branding.phone].filter(Boolean).join(' · ') || '—';
    const colW = contentW / 3;
    this.drawContactItem(
      doc,
      MARGIN,
      y,
      colW - 8,
      branding.name,
      branding.addressLine || '—',
    );
    this.drawContactItem(doc, MARGIN + colW, y, colW - 8, 'Phone:', phoneLine);
    this.drawContactItem(
      doc,
      MARGIN + colW * 2,
      y,
      colW,
      'Email:',
      branding.email || '—',
    );

    y += 36;
    doc
      .moveTo(MARGIN, y)
      .lineTo(PAGE_W - MARGIN, y)
      .strokeColor('#e2e8f0')
      .stroke();

    // Meta card
    y += 12;
    const metaH = 118;
    this.roundedRect(doc, MARGIN, y, contentW, metaH, 10);
    const metaItems: Array<[string, string]> = [
      ['BILTY CODE', this.dashPlain(bilty.code)],
      ['ISSUE DATE', this.fmtDate(bilty.issueDate)],
      ['DESCRIPTION', this.dashPlain(bilty.description)],
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
    const metaPad = 12;
    const metaColW = (contentW - metaPad * 2) / 3;
    const metaRowH = 32;
    metaItems.forEach(([label, value], i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const mx = MARGIN + metaPad + col * metaColW;
      const my = y + metaPad + row * metaRowH;
      doc
        .fillColor(LABEL)
        .font('Helvetica-Bold')
        .fontSize(7)
        .text(label, mx, my, { width: metaColW - 8 });
      doc
        .fillColor(VALUE)
        .font('Helvetica-Bold')
        .fontSize(10)
        .text(value, mx, my + 11, {
          width: metaColW - 8,
          lineBreak: false,
          ellipsis: true,
        });
    });

    // Loading / Offloading cards
    y += metaH + 12;
    const stopH = 168;
    const stopGap = 10;
    const stopW = (contentW - stopGap) / 2;
    this.drawStopCard(
      doc,
      MARGIN,
      y,
      stopW,
      stopH,
      'LOADING DETAILS',
      this.loadingRows(loading),
    );
    this.drawStopCard(
      doc,
      MARGIN + stopW + stopGap,
      y,
      stopW,
      stopH,
      'OFFLOADING DETAILS',
      this.offLoadingRows(offLoading),
    );

    // Parties
    y += stopH + 12;
    const partyH = 78;
    const partyGap = 8;
    const partyW = (contentW - partyGap * 2) / 3;
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
    y += partyH + 14;
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
    y += 18;
    doc
      .moveTo(MARGIN, y)
      .lineTo(PAGE_W - MARGIN, y)
      .strokeColor('#e2e8f0')
      .stroke();

    doc
      .fillColor(LABEL)
      .font('Helvetica')
      .fontSize(7)
      .text(branding.footerLine || branding.name, MARGIN, PAGE_H - MARGIN - 10, {
        width: contentW,
        align: 'center',
      });
  }

  private loadingRows(loading?: BiltyLoading): Array<[string, string]> {
    return [
      ['Consignee / Sender', this.dashPlain(loading?.client?.companyName)],
      ['Arrival Date', this.fmtDate(loading?.arrivalDate)],
      ['Loading Date', this.fmtDate(loading?.loadingDate)],
      ['Time In', this.fmtTime(loading?.loadingTimeIn)],
      ['Time Out', this.fmtTime(loading?.loadingTimeOut)],
      [
        'No. of Loading Stops',
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
  }

  private offLoadingRows(
    offLoading?: BiltyOffLoading,
  ): Array<[string, string]> {
    return [
      ['Receiver', this.dashPlain(offLoading?.client?.companyName)],
      ['Arrival Date', this.fmtDate(offLoading?.offLoadingDate)],
      ['Offloading Date', this.fmtDate(offLoading?.offLoadingDate)],
      ['Time In', this.fmtTime(offLoading?.offLoadingTimeIn)],
      ['Time Out', this.fmtTime(offLoading?.offLoadingTimeOut)],
      [
        'No. of Off-loading Stops',
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
  }

  private drawStopCard(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    w: number,
    h: number,
    title: string,
    rows: Array<[string, string]>,
  ) {
    this.roundedRect(doc, x, y, w, h, 10);
    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(9)
      .text(title, x + 10, y + 10, { width: w - 20 });
    doc
      .moveTo(x + 10, y + 26)
      .lineTo(x + w - 10, y + 26)
      .strokeColor('#eef2f7')
      .stroke();

    let rowY = y + 32;
    for (const [label, value] of rows) {
      doc
        .fillColor(MUTED)
        .font('Helvetica')
        .fontSize(8)
        .text(label, x + 10, rowY, { width: w * 0.42, lineBreak: false });
      doc
        .fillColor(VALUE)
        .font('Helvetica-Bold')
        .fontSize(8)
        .text(value, x + 10 + w * 0.42, rowY, {
          width: w * 0.48,
          align: 'right',
          lineBreak: false,
          ellipsis: true,
        });
      rowY += 18;
      if (rowY < y + h - 8) {
        doc
          .moveTo(x + 10, rowY - 4)
          .lineTo(x + w - 10, rowY - 4)
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
      .text(title, x + 10, y + 10, { width: w - 20 });
    doc
      .fillColor(LABEL)
      .font('Helvetica-Bold')
      .fontSize(7)
      .text('NAME', x + 10, y + 28);
    doc
      .fillColor(VALUE)
      .font('Helvetica-Bold')
      .fontSize(9)
      .text(name, x + 10, y + 38, {
        width: w - 20,
        lineBreak: false,
        ellipsis: true,
      });
    doc
      .fillColor(LABEL)
      .font('Helvetica-Bold')
      .fontSize(7)
      .text('CELL NO.', x + 10, y + 52);
    doc
      .fillColor(VALUE)
      .font('Helvetica-Bold')
      .fontSize(9)
      .text(phone, x + 10, y + 62, {
        width: w - 20,
        lineBreak: false,
        ellipsis: true,
      });
  }

  private drawContactItem(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    w: number,
    title: string,
    sub: string,
  ) {
    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(8)
      .text(title, x, y, { width: w, lineBreak: false, ellipsis: true });
    doc
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(7)
      .text(sub, x, y + 12, { width: w, height: 18, ellipsis: true });
  }

  private drawWatermark(
    doc: PDFKit.PDFDocument,
    label: string,
    status: BiltyStatus,
  ) {
    const color = this.statusWatermarkColor(status);
    doc.save();
    doc
      .fillColor(color)
      .font('Helvetica-Bold')
      .fontSize(64)
      .opacity(1)
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
  ) {
    doc
      .roundedRect(x, y, 72, 72, 8)
      .fillAndStroke('#eef2f7', BORDER);
    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(9)
      .text(name, x + 4, y + 30, { width: 64, align: 'center' });
  }

  private roundedRect(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ) {
    doc
      .lineWidth(1)
      .strokeColor(BORDER)
      .roundedRect(x, y, w, h, r)
      .stroke();
  }

  private statusWatermarkColor(status: BiltyStatus): string {
    if (status === BiltyStatus.COMPLETED) return '#dbeafe';
    if (status === BiltyStatus.APPROVED) return '#d1fae5';
    if (status === BiltyStatus.CANCELLED) return '#fee2e2';
    return '#ffedd5';
  }

  private async loadBilty(
    where: { id: string } | { code: string },
  ): Promise<Bilty | null> {
    const bilty = await this.biltyRepo.findOne({
      where,
      relations: {
        driver: { user: true },
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
    const addressLine =
      (value.address ?? '').trim() || DEFAULT_BUSINESS_INFO.address || '';
    const phone =
      (value.phone ?? '').trim() || DEFAULT_BUSINESS_INFO.phone || '';
    const ptcl = (value.ptcl ?? '').trim() || '';
    const email =
      (value.email ?? '').trim() || DEFAULT_BUSINESS_INFO.email || '';
    const logoUrl =
      (value.logoUrl ?? '').trim() || DEFAULT_BUSINESS_INFO.logoUrl || '';

    const footerParts = [name, addressLine].filter(Boolean);
    if (phone) footerParts.push(`Phone: ${phone}`);
    if (ptcl) footerParts.push(`PTCL: ${ptcl}`);
    if (email) footerParts.push(`Email: ${email}`);

    return {
      logoUrl,
      name,
      addressLine,
      phone,
      ptcl,
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

  private fmtTime(value?: string | Date | null): string {
    if (value == null || value === '') return '—';
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
