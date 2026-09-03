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
  DriverLicenseType,
  DriverStatus,
} from '../database/entities/driver.entity';
import {
  BusinessInfoSettingValue,
  SystemSetting,
  SystemSettingKey,
} from '../database/entities/system-setting.entity';
import { DriversService } from './drivers.service';

const NAVY = '#1A3C70';
const GREEN = '#A9C43F';
const MUTED = '#6b7280';
const LABEL = '#9ca3af';
const VALUE = '#111827';
const BORDER = '#d1d5db';
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 45; // ~16mm

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

const LICENSE_LABELS: Record<DriverLicenseType, string> = {
  [DriverLicenseType.HTV]: 'HTV',
  [DriverLicenseType.LTV]: 'LTV',
};

type PrintBranding = {
  logoUrl: string;
  name: string;
  addressLine: string;
  tagLine: string;
  phone: string;
  ptcl: string;
  email: string;
  contactLine: string;
  footerLine: string;
};

type DriverPdfData = Awaited<ReturnType<DriversService['findOne']>>;

export type DriverPdfResult = {
  buffer: Buffer;
  filename: string;
  code: string;
};

@Injectable()
export class DriverPdfService {
  private readonly logger = new Logger(DriverPdfService.name);

  constructor(
    private readonly driversService: DriversService,
    @InjectRepository(SystemSetting)
    private readonly settingRepo: Repository<SystemSetting>,
  ) {}

  async generateById(id: string): Promise<DriverPdfResult> {
    let driver: DriverPdfData;
    try {
      driver = await this.driversService.findOne(id);
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw err;
    }
    return this.renderPdf(driver);
  }

  private async renderPdf(driver: DriverPdfData): Promise<DriverPdfResult> {
    const name = driver.user?.name?.trim() || 'Driver';
    const code = driver.user?.code?.trim() || driver.id;

    try {
      const branding = await this.resolveBranding();
      const logoBuf = await this.fetchImageBuffer(branding.logoUrl);
      const avatarUrl = (driver.avatarUrl || driver.avatar || '').trim();
      const avatarBuf = avatarUrl
        ? await this.fetchImageBuffer(avatarUrl)
        : null;

      const buffer = await new Promise<Buffer>((resolve, reject) => {
        const doc = new PDFDocument({
          size: 'A4',
          margin: MARGIN,
          autoFirstPage: false,
          info: {
            Title: `Driver Form — ${name}`,
            Author: branding.name,
          },
        });
        const chunks: Buffer[] = [];
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        doc.addPage({ size: 'A4', margin: MARGIN });
        this.drawFormPage(doc, driver, branding, logoBuf, avatarBuf);

        doc.addPage({ size: 'A4', margin: MARGIN });
        this.drawUndertakingPage(doc, driver, branding, logoBuf);

        doc.end();
      });

      const safeCode = code.replace(/[^\w.-]+/g, '_');
      return {
        buffer,
        filename: `driver-${safeCode}.pdf`,
        code,
      };
    } catch (err) {
      this.logger.error(
        `Failed to generate driver PDF for ${code}`,
        err instanceof Error ? err.stack : String(err),
      );
      throw new InternalServerErrorException('Failed to generate driver PDF');
    }
  }

  /** Page 1 — Driver Form (matches printDriver.ts). */
  private drawFormPage(
    doc: PDFKit.PDFDocument,
    driver: DriverPdfData,
    branding: PrintBranding,
    logoBuf: Buffer | null,
    avatarBuf: Buffer | null,
  ): void {
    const name = driver.user?.name?.trim() || 'Driver';
    const contentW = PAGE_W - MARGIN * 2;
    const printed = this.fmtDate(new Date());
    const licenseLabel =
      LICENSE_LABELS[driver.licenseType as DriverLicenseType] ??
      String(driver.licenseType ?? '—');

    let y = this.drawBrandHeader(
      doc,
      branding,
      logoBuf,
      'Driver Form',
      `Printed ${printed}`,
    );

    const avatarW = 112;
    const gap = 16;
    const mainW = contentW - avatarW - gap;
    const topY = y;

    y = this.drawSection(doc, MARGIN, y, mainW, 'Personal Information', [
      ['Full Name', this.dash(name)],
      ['Father Name', this.dash(driver.fatherName)],
      ['CNIC No', this.dash(driver.cnicNo)],
      ['Email', this.dash(driver.user?.email)],
      ['Phone', this.dash(driver.phone)],
      ['Alternate Phone', this.dash(driver.altPhone)],
      ['Joining Date', this.fmtDate(driver.joiningDate)],
      ['User Code', this.dash(driver.user?.code)],
    ]);

    y = this.drawSection(doc, MARGIN, y, mainW, 'Driver Information', [
      ['License No', this.dash(driver.licenseNo)],
      ['License Type', licenseLabel],
      ['Role', this.dash(driver.user?.role?.name)],
      ['Profile Type', this.dash(driver.user?.profileType)],
    ]);

    this.drawAvatarPanel(
      doc,
      MARGIN + mainW + gap,
      topY,
      avatarW,
      name,
      avatarBuf,
      driver.status,
    );

    const avatarBottom = topY + 190;
    y = Math.max(y, avatarBottom) + 4;

    y = this.drawSection(doc, MARGIN, y, contentW, 'Guarantor', [
      ['Name', this.dash(driver.gurantorName)],
      ['Phone', this.dash(driver.gurantorPhone)],
      ['CNIC', this.dash(driver.gurantorCNIC)],
      ['Address', this.dash(driver.gurantorAddress)],
    ]);

    this.drawSection(doc, MARGIN, y, contentW, 'Address', [
      ['Current Address', this.dash(driver.currentAddress)],
      ['Permanent Address', this.dash(driver.permenantAddress)],
    ]);

    this.drawPageFooter(doc, name, 'Page 1 of 2 · Driver Form');
  }

  /** Page 2 — Undertaking / Affidavit with signature boxes. */
  private drawUndertakingPage(
    doc: PDFKit.PDFDocument,
    driver: DriverPdfData,
    branding: PrintBranding,
    logoBuf: Buffer | null,
  ) {
    const name = driver.user?.name?.trim() || '________________';
    const cnic = driver.cnicNo?.trim() || '________________';
    const license = driver.licenseNo?.trim() || '________________';
    const father = driver.fatherName?.trim() || '________________';
    const phone = driver.phone?.trim() || '________________';
    const today = this.fmtDate(new Date());
    const contentW = PAGE_W - MARGIN * 2;

    let y = this.drawBrandHeader(
      doc,
      branding,
      logoBuf,
      'Undertaking',
      `Date: ${today}`,
    );

    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(16)
      .text('Driver Undertaking / Affidavit', MARGIN, y, {
        width: contentW,
        align: 'center',
      });
    y = doc.y + 6;
    doc
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(10)
      .text(
        'To be signed by the driver and witnessed by an authorized company representative',
        MARGIN,
        y,
        { width: contentW, align: 'center' },
      );
    y = doc.y + 16;

    y = this.drawRichParagraph(doc, MARGIN, y, contentW, [
      { text: 'I, ' },
      { text: name, bold: true },
      { text: ', S/O ' },
      { text: father, bold: true },
      { text: ', holding CNIC No. ' },
      { text: cnic, bold: true },
      { text: ' and Driving License No. ' },
      { text: license, bold: true },
      { text: ', contact No. ' },
      { text: phone, bold: true },
      { text: ', hereby solemnly affirm and undertake as under:' },
    ]);
    y += 10;

    const clauses = [
      `That I am joining / working with ${branding.name} as a driver and I shall abide by all company policies, safety rules, SOPs, and lawful instructions of the management.`,
      'That all information provided by me in the driver form (including CNIC, license, address, and guarantor details) is true and correct to the best of my knowledge. I understand that any false statement may result in termination and legal action.',
      'That I shall drive assigned vehicles carefully, maintain valid documents, and shall not use any vehicle for unauthorized personal or commercial purposes.',
      'That I shall be responsible for any damage, loss, or accident caused due to my negligence, misconduct, or violation of traffic laws, and I accept that the company may recover related costs as per policy.',
      'That I shall not carry illegal goods, passengers without authorization, or engage in any unlawful activity while on duty or while using company / assigned vehicles.',
      'That I shall immediately report any accident, breakdown, challan, or incident to the company operations team.',
      'That I have read and understood this undertaking and I sign it willingly without any pressure or coercion.',
    ];

    for (let i = 0; i < clauses.length; i++) {
      doc
        .fillColor('#1f2937')
        .font('Helvetica')
        .fontSize(10.5)
        .text(`${i + 1}.  ${clauses[i]}`, MARGIN + 4, y, {
          width: contentW - 8,
          align: 'justify',
          lineGap: 2,
        });
      y = doc.y + 8;
    }

    y += 4;
    doc
      .roundedRect(MARGIN, y, contentW, 42, 6)
      .fillAndStroke('#f8fafc', '#cbd5e1');
    doc
      .fillColor('#1f2937')
      .font('Helvetica')
      .fontSize(10)
      .text(
        `I acknowledge that a signed copy of this undertaking will be retained in my employment / contractor file with ${branding.name}.`,
        MARGIN + 10,
        y + 12,
        { width: contentW - 20 },
      );
    y += 56;

    const boxGap = 20;
    const boxW = (contentW - boxGap) / 2;
    const boxH = 120;
    this.drawSignBox(doc, MARGIN, y, boxW, boxH, 'Driver Signature', [
      `Name: ${name}`,
      `CNIC: ${cnic}`,
      'Date: _______________',
    ]);
    this.drawSignBox(
      doc,
      MARGIN + boxW + boxGap,
      y,
      boxW,
      boxH,
      'Company / Witness',
      [
        'Authorized Signature',
        'Name / Designation: _______________',
        'Date: _______________',
      ],
    );

    this.drawPageFooter(doc, `Driver: ${name}`, 'Page 2 of 2 · Undertaking');
  }

  private drawBrandHeader(
    doc: PDFKit.PDFDocument,
    branding: PrintBranding,
    logoBuf: Buffer | null,
    docTitle: string,
    sub: string,
  ): number {
    const contentW = PAGE_W - MARGIN * 2;
    const top = MARGIN;

    if (logoBuf) {
      try {
        doc.image(logoBuf, MARGIN, top, {
          fit: [48, 48],
          align: 'center',
          valign: 'center',
        });
      } catch {
        this.drawLogoFallback(doc, branding.name, MARGIN, top, 48);
      }
    } else {
      this.drawLogoFallback(doc, branding.name, MARGIN, top, 48);
    }

    const textX = MARGIN + 58;
    const textW = contentW - 180;
    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(15)
      .text(branding.name, textX, top + 2, { width: textW });
    let metaY = doc.y + 2;
    const metaLines = [
      branding.addressLine,
      branding.contactLine,
      branding.tagLine,
    ].filter(Boolean);
    doc.fillColor(MUTED).font('Helvetica').fontSize(8);
    for (const line of metaLines) {
      doc.text(line, textX, metaY, { width: textW, lineBreak: false });
      metaY += 11;
    }

    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(13)
      .text(docTitle.toUpperCase(), MARGIN + contentW - 150, top + 4, {
        width: 150,
        align: 'right',
      });
    doc
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(9)
      .text(sub, MARGIN + contentW - 150, top + 22, {
        width: 150,
        align: 'right',
      });

    const lineY = Math.max(top + 56, metaY + 6);
    doc
      .moveTo(MARGIN, lineY)
      .lineTo(PAGE_W - MARGIN, lineY)
      .lineWidth(2.2)
      .strokeColor(NAVY)
      .stroke();

    return lineY + 14;
  }

  private drawSection(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    w: number,
    title: string,
    fields: Array<[string, string]>,
  ): number {
    doc.rect(x, y, w, 22).fill('#f1f5f9');
    doc.rect(x, y, 3, 22).fill(GREEN);
    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(9)
      .text(title.toUpperCase(), x + 10, y + 7, { width: w - 14 });

    const rowY = y + 28;
    const colW = (w - 14) / 2;
    fields.forEach(([label, value], i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const fx = x + 4 + col * (colW + 10);
      const fy = rowY + row * 34;

      doc
        .fillColor(LABEL)
        .font('Helvetica-Bold')
        .fontSize(7.5)
        .text(label.toUpperCase(), fx, fy, { width: colW - 4 });
      doc
        .fillColor(VALUE)
        .font('Helvetica-Bold')
        .fontSize(10)
        .text(value, fx, fy + 11, {
          width: colW - 4,
          lineBreak: false,
          ellipsis: true,
        });
      doc
        .moveTo(fx, fy + 28)
        .lineTo(fx + colW - 8, fy + 28)
        .lineWidth(0.6)
        .strokeColor('#eef2f7')
        .stroke();
    });

    const rows = Math.ceil(fields.length / 2);
    return rowY + rows * 34 + 8;
  }

  private drawAvatarPanel(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    w: number,
    name: string,
    avatarBuf: Buffer | null,
    status: DriverStatus | string,
  ) {
    const h = 178;
    doc.roundedRect(x, y, w, h, 8).fillAndStroke('#f8fafc', BORDER);

    const frameX = x + 8;
    const frameY = y + 10;
    const frameW = w - 16;
    const frameH = 118;

    doc
      .roundedRect(frameX, frameY, frameW, frameH, 6)
      .fillAndStroke('#ffffff', '#cbd5e1');

    if (avatarBuf) {
      try {
        doc.save();
        doc.roundedRect(frameX, frameY, frameW, frameH, 6).clip();
        doc.image(avatarBuf, frameX, frameY, {
          cover: [frameW, frameH],
          align: 'center',
          valign: 'center',
        });
        doc.restore();
      } catch {
        this.drawAvatarInitials(doc, frameX, frameY, frameW, frameH, name);
      }
    } else {
      this.drawAvatarInitials(doc, frameX, frameY, frameW, frameH, name);
    }

    doc
      .fillColor('#94a3b8')
      .font('Helvetica-Bold')
      .fontSize(7.5)
      .text('DRIVER PHOTO', x + 4, frameY + frameH + 8, {
        width: w - 8,
        align: 'center',
      });
    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(9)
      .text(name, x + 4, frameY + frameH + 20, {
        width: w - 8,
        align: 'center',
        lineBreak: false,
        ellipsis: true,
      });

    if (status === DriverStatus.ACTIVE || status === 'ACTIVE') {
      doc
        .roundedRect(x + 18, y + h - 18, w - 36, 12, 6)
        .fillAndStroke('#ecfdf5', '#a7f3d0');
      doc
        .fillColor('#059669')
        .font('Helvetica-Bold')
        .fontSize(7)
        .text('ACTIVE', x + 18, y + h - 15, {
          width: w - 36,
          align: 'center',
        });
    }
  }

  private drawAvatarInitials(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    w: number,
    h: number,
    name: string,
  ) {
    doc.save();
    doc.roundedRect(x, y, w, h, 6).clip();
    doc.rect(x, y, w, h).fill(NAVY);
    doc
      .fillColor('#ffffff')
      .font('Helvetica-Bold')
      .fontSize(26)
      .text(this.initials(name), x, y + h / 2 - 12, {
        width: w,
        align: 'center',
      });
    doc.restore();
  }

  private drawSignBox(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    w: number,
    h: number,
    title: string,
    lines: string[],
  ) {
    doc.roundedRect(x, y, w, h, 6).strokeColor(BORDER).lineWidth(1).stroke();
    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(9)
      .text(title.toUpperCase(), x + 12, y + 12, { width: w - 24 });

    const lineY = y + h - 52;
    doc
      .moveTo(x + 12, lineY)
      .lineTo(x + w - 12, lineY)
      .strokeColor('#9ca3af')
      .stroke();

    let ty = lineY + 6;
    for (const line of lines) {
      doc
        .fillColor(MUTED)
        .font('Helvetica')
        .fontSize(8.5)
        .text(line, x + 12, ty, { width: w - 24 });
      ty += 12;
    }
  }

  private drawPageFooter(doc: PDFKit.PDFDocument, left: string, right: string) {
    const y = PAGE_H - MARGIN - 8;
    doc
      .moveTo(MARGIN, y - 8)
      .lineTo(PAGE_W - MARGIN, y - 8)
      .strokeColor('#e5e7eb')
      .lineWidth(1)
      .stroke();
    const contentW = PAGE_W - MARGIN * 2;
    doc
      .fillColor(LABEL)
      .font('Helvetica')
      .fontSize(8)
      .text(left, MARGIN, y, { width: contentW / 2, lineBreak: false });
    doc.text(right, MARGIN + contentW / 2, y, {
      width: contentW / 2,
      align: 'right',
      lineBreak: false,
    });
  }

  private drawRichParagraph(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    w: number,
    parts: Array<{ text: string; bold?: boolean }>,
  ): number {
    doc.x = x;
    doc.y = y;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      doc
        .fillColor(part.bold ? NAVY : '#1f2937')
        .font(part.bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(11)
        .text(part.text, {
          continued: i < parts.length - 1,
          width: w,
          align: 'justify',
          lineGap: 2,
        });
    }
    return doc.y + 2;
  }

  private drawLogoFallback(
    doc: PDFKit.PDFDocument,
    name: string,
    x: number,
    y: number,
    size: number,
  ) {
    doc.roundedRect(x, y, size, size, 6).fillAndStroke('#eef2f7', BORDER);
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
    const tagLine = (value.tagLine ?? '').trim() || '';
    const contactLine = [ptcl, phone, email].filter(Boolean).join(' · ');

    const footerParts = [name, addressLine].filter(Boolean);
    if (phone) footerParts.push(`Phone: ${phone}`);
    if (ptcl) footerParts.push(`PTCL: ${ptcl}`);
    if (email) footerParts.push(`Email: ${email}`);

    return {
      logoUrl,
      name,
      addressLine,
      tagLine,
      phone,
      ptcl,
      email,
      contactLine,
      footerLine: footerParts.join(' | '),
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

  private dash(value?: string | null): string {
    const v = (value ?? '').trim();
    return v || '—';
  }

  private initials(name?: string | null): string {
    if (!name?.trim()) return 'DR';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || 'DR';
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
}
