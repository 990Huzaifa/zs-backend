import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import PDFDocument from 'pdfkit';
import { Repository } from 'typeorm';
import { DriverLicenseType } from '../../database/entities/driver.entity';
import {
  BusinessInfoSettingValue,
  SystemSetting,
  SystemSettingKey,
} from '../../database/entities/system-setting.entity';
import { DriversService } from '../drivers.service';

const NAVY = '#1A3C70';
const GREEN = '#A9C43F';
const MUTED = '#6b7280';
const LABEL = '#9ca3af';
const VALUE = '#111827';
const BORDER = '#d1d5db';
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 40; // ~14mm — tighter so EN+UR+signs fit page 2
/** Keep footer text above this Y — PDFKit auto-adds blank pages when writing near the bottom. */
const FOOTER_Y = PAGE_H - MARGIN - 18;

const FONT_URDU = 'Urdu';
const FONT_URDU_BOLD = 'Urdu-Bold';

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
      const stampBuf = this.readInvoiceAsset('stamp.png');

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
        this.registerUrduFonts(doc);
        const chunks: Buffer[] = [];
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        doc.addPage({ size: 'A4', margin: MARGIN });
        this.resetPageCursor(doc);
        this.drawFormPage(doc, driver, branding, logoBuf, avatarBuf);

        doc.addPage({ size: 'A4', margin: MARGIN });
        this.resetPageCursor(doc);
        this.drawUndertakingPage(doc, driver, branding, logoBuf, stampBuf);

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
    const licenseLabel = driver.licenseType
      ? (LICENSE_LABELS[driver.licenseType as DriverLicenseType] ??
        String(driver.licenseType))
      : '—';

    let y = this.drawBrandHeader(doc, branding, logoBuf, 'Driver Form');

    const avatarW = 132;
    const gap = 18;
    const mainW = contentW - avatarW - gap;
    const topY = y;

    y = this.drawSection(doc, MARGIN, y, mainW, 'Personal Information', [
      ['Full Name', this.dash(name)],
      ['Father Name', this.dash(driver.fatherName)],
      ['CNIC No', this.dash(driver.cnicNo)],
      ['Email', this.dash(driver.user?.email)],
      ['Phone', this.dash(driver.phone)],
      ['Alternate Phone', this.dash(driver.altPhone)],
      ['Emergency Contact', this.dash(driver.emergencyContactPhone)],
      ['Joining Date', this.fmtDate(driver.joiningDate)],
      ['User Code', this.dash(driver.user?.code)],
      ['Current Address', this.dash(driver.currentAddress)],
      ['Permanent Address', this.dash(driver.permenantAddress)],
    ]);

    y = this.drawSection(doc, MARGIN, y, mainW, 'Driver Information', [
      ['License No', this.dash(driver.licenseNo)],
      ['License Type', licenseLabel],
      ['License Validity', this.fmtDate(driver.licenseValidity)],
      [
        'Online Verification',
        driver.licenseOnlineVerification ? 'Verified' : 'Not Verified',
      ],
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
    );

    const avatarBottom = topY + 190;
    y = Math.max(y, avatarBottom) + 4;

    this.drawSection(doc, MARGIN, y, contentW, 'Guarantor', [
      ['Name', this.dash(driver.gurantorName)],
      ['Phone', this.dash(driver.gurantorPhone)],
      ['CNIC', this.dash(driver.gurantorCNIC)],
      ['Address', this.dash(driver.gurantorAddress)],
    ]);

    this.drawPageFooter(doc, '', 'Page 1 of 2 · Driver Form');
    this.resetPageCursor(doc);
  }

  /** Page 2 — Undertaking (EN + UR) + driver sign / company stamp (matches printDriver.ts). */
  private drawUndertakingPage(
    doc: PDFKit.PDFDocument,
    driver: DriverPdfData,
    branding: PrintBranding,
    logoBuf: Buffer | null,
    stampBuf: Buffer | null,
  ) {
    const name = driver.user?.name?.trim() || '________________';
    const cnic = driver.cnicNo?.trim() || '________________';
    const license = driver.licenseNo?.trim() || '________________';
    const father = driver.fatherName?.trim() || '________________';
    const phone = driver.phone?.trim() || '________________';
    const company = branding.name;
    const today = this.fmtDate(new Date());
    const contentW = PAGE_W - MARGIN * 2;
    const hasUrdu = this.hasUrduFont(doc);

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
      .fontSize(14)
      .text('Driver Undertaking / Affidavit', MARGIN, y, {
        width: contentW,
        align: 'center',
        lineBreak: false,
      });
    y += 18;
    doc
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(9)
      .text(
        'To be signed by the driver and witnessed by an authorized company representative',
        MARGIN,
        y,
        { width: contentW, align: 'center', lineGap: 0 },
      );
    y += 18;

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
    y += 4;

    const enClauses = [
      `That I am joining / working with ${company} as a driver and I shall abide by all company policies, safety rules, SOPs, and lawful instructions of the management.`,
      'That all information provided by me in the driver form (including CNIC, license, address, and guarantor details) is true and correct to the best of my knowledge. I understand that any false statement may result in termination and legal action.',
      'That I shall drive assigned vehicles carefully, maintain valid documents, and shall not use any vehicle for unauthorized personal or commercial purposes.',
      'That I shall be responsible for any damage, loss, or accident caused due to my negligence, misconduct, or violation of traffic laws, and I accept that the company may recover related costs as per policy. I have read and understood this undertaking and sign it willingly without any pressure or coercion.',
    ];

    for (let i = 0; i < enClauses.length; i++) {
      const label = `${i + 1}.  ${enClauses[i]}`;
      doc.font('Helvetica').fontSize(9);
      const blockH = doc.heightOfString(label, {
        width: contentW - 6,
        align: 'justify',
        lineGap: 0,
      });
      doc
        .fillColor('#1f2937')
        .text(label, MARGIN + 2, y, {
          width: contentW - 6,
          align: 'justify',
          lineGap: 0,
        });
      y += blockH + 4;
    }

    // ── Urdu (RTL) — same copy as printDriver.ts ─────────────
    if (hasUrdu) {
      y += 4;
      doc
        .moveTo(MARGIN, y)
        .lineTo(PAGE_W - MARGIN, y)
        .strokeColor('#e5e7eb')
        .lineWidth(1.5)
        .stroke();
      y += 8;

      y = this.drawUrduParagraph(
        doc,
        'ڈرائیور عہد نامہ / حلف نامہ',
        MARGIN,
        y,
        contentW,
        { bold: true, size: 11, align: 'center', color: NAVY },
      );
      y += 4;

      y = this.drawUrduParagraph(
        doc,
        `میں، ${name}، ولد ${father}، شناختی کارڈ نمبر ${cnic} اور ڈرائیونگ لائسنس نمبر ${license} رکھنے والا، رابطہ نمبر ${phone}، درج ذیل کے مطابق حلفیہ بیان / عہد کرتا ہوں:`,
        MARGIN,
        y,
        contentW,
        { size: 9 },
      );
      y += 3;

      const urClauses = [
        `کہ میں ${company} کے ساتھ ڈرائیور کی حیثیت سے شمولیت اختیار کر رہا ہوں / کام کر رہا ہوں اور کمپنی کی تمام پالیسیوں، حفاظتی اصولوں، SOPs اور انتظامیہ کی قانونی ہدایات کی پابندی کروں گا۔`,
        'کہ ڈرائیور فارم میں میری فراہم کردہ تمام معلومات (بشمول شناختی کارڈ، لائسنس، پتہ اور ضامن کی تفصیلات) میرے علم کے مطابق درست اور صحیح ہیں۔ میں سمجھتا ہوں کہ کوئی بھی غلط بیان برطرفی اور قانونی کارروائی کا باعث بن سکتا ہے۔',
        'کہ میں تفویض کردہ گاڑیوں کو احتیاط سے چلاؤں گا، درست دستاویزات برقرار رکھوں گا، اور کسی بھی گاڑی کو غیر مجاز ذاتی یا تجارتی مقاصد کے لیے استعمال نہیں کروں گا۔',
        'کہ میری غفلت، بدتمیزی یا ٹریفک قوانین کی خلاف ورزی کی وجہ سے ہونے والے کسی بھی نقصان، خسارے یا حادثے کا میں ذمہ دار ہوں گا، اور میں قبول کرتا ہوں کہ کمپنی پالیسی کے مطابق متعلقہ اخراجات وصول کر سکتی ہے۔ میں نے یہ عہد نامہ پڑھ اور سمجھ لیا ہے، اور بلا کسی دباؤ کے اپنی رضامندی سے دستخط کر رہا ہوں۔',
      ];

      for (let i = 0; i < urClauses.length; i++) {
        y = this.drawUrduParagraph(
          doc,
          `${i + 1}. ${urClauses[i]}`,
          MARGIN,
          y,
          contentW,
          { size: 9 },
        );
        y += 3;
      }
    }

    // ── Sign row: driver line | company stamp (no box borders) ──
    y += 10;
    const boxGap = 16;
    const boxW = (contentW - boxGap) / 2;
    const stampSize = 72;
    const boxH = stampSize + 22;
    if (y + boxH > FOOTER_Y - 8) {
      y = Math.max(MARGIN + 8, FOOTER_Y - boxH - 8);
    }

    // Left — empty sign space + "Driver: {name} Signature"
    const leftLineY = y + boxH - 14;
    doc
      .moveTo(MARGIN, leftLineY)
      .lineTo(MARGIN + boxW, leftLineY)
      .strokeColor('#9ca3af')
      .lineWidth(1)
      .stroke();
    doc
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(8)
      .text(`Driver: ${name} Signature`, MARGIN, leftLineY + 4, {
        width: boxW,
        lineBreak: false,
        ellipsis: true,
      });

    // Right — company stamp + "Company Stamp"
    const rightX = MARGIN + boxW + boxGap;
    if (stampBuf) {
      try {
        doc.image(stampBuf, rightX + (boxW - stampSize) / 2, y, {
          fit: [stampSize, stampSize],
          align: 'center',
          valign: 'center',
        });
      } catch {
        // ignore bad stamp asset
      }
    }
    const rightLineY = y + boxH - 14;
    doc
      .moveTo(rightX, rightLineY)
      .lineTo(rightX + boxW, rightLineY)
      .strokeColor('#9ca3af')
      .lineWidth(1)
      .stroke();
    doc
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(8)
      .text('Company Stamp', rightX, rightLineY + 4, {
        width: boxW,
        align: 'center',
        lineBreak: false,
      });

    this.resetPageCursor(doc);
    this.drawPageFooter(doc, '', 'Page 2 of 2 · Undertaking');
    this.resetPageCursor(doc);
  }

  /**
   * Register Amiri (Urdu/Arabic + Latin in one font, so names / company / digits
   * never fall back to "tofu" boxes). Returns false when the files are missing.
   */
  private registerUrduFonts(doc: PDFKit.PDFDocument): boolean {
    const candidates = [
      join(__dirname, '..', '..', 'assets', 'fonts'),
      join(process.cwd(), 'dist', 'assets', 'fonts'),
      join(process.cwd(), 'src', 'assets', 'fonts'),
    ];
    for (const dir of candidates) {
      const regular = join(dir, 'Amiri-Regular.ttf');
      const bold = join(dir, 'Amiri-Bold.ttf');
      if (!existsSync(regular)) continue;
      try {
        doc.registerFont(FONT_URDU, regular);
        doc.registerFont(
          FONT_URDU_BOLD,
          existsSync(bold) ? bold : regular,
        );
        return true;
      } catch (err) {
        this.logger.warn(
          `Could not register Urdu font from ${dir}: ${String(err)}`,
        );
      }
    }
    this.logger.warn(
      'Urdu font (Amiri) not found — undertaking PDF will be English-only',
    );
    return false;
  }

  private hasUrduFont(doc: PDFKit.PDFDocument): boolean {
    try {
      doc.font(FONT_URDU);
      return true;
    } catch {
      return false;
    }
  }

  // ── Minimal bidi (RTL paragraph with embedded LTR runs) ──────────────────
  // PDFKit shapes Arabic-script text itself (OpenType via fontkit) when the
  // `rtla` feature is on, but it has no bidi. So we split each line into
  // direction runs: Urdu runs → `rtla`, Latin/digit runs → plain, then place
  // the runs right-to-left ourselves.

  private bidiCharClass(ch: string): 'R' | 'L' | 'N' {
    const cp = ch.codePointAt(0) ?? 0;
    if (
      (cp >= 0x0590 && cp <= 0x08ff) ||
      (cp >= 0xfb1d && cp <= 0xfdff) ||
      (cp >= 0xfe70 && cp <= 0xfeff)
    ) {
      return 'R';
    }
    if (/[\p{L}\p{N}]/u.test(ch)) return 'L';
    return 'N';
  }

  /** Split text into runs of a single resolved direction. */
  private buildBidiRuns(text: string): Array<{ dir: 'R' | 'L'; text: string }> {
    const chars = [...text];
    const types = chars.map((c) => this.bidiCharClass(c));
    const dirs: Array<'R' | 'L'> = new Array(chars.length);

    for (let i = 0; i < chars.length; i++) {
      if (types[i] !== 'N') {
        dirs[i] = types[i] as 'R' | 'L';
        continue;
      }
      let j = i;
      while (j < chars.length && types[j] === 'N') j++;
      // Neutrals between two LTR chars stay LTR (e.g. "42101-1234", "A B"),
      // otherwise they take the paragraph direction (RTL).
      const prev = i > 0 ? dirs[i - 1] : 'R';
      const next = j < chars.length ? (types[j] as 'R' | 'L') : 'R';
      const dir: 'R' | 'L' = prev === 'L' && next === 'L' ? 'L' : 'R';
      for (let k = i; k < j; k++) dirs[k] = dir;
      i = j - 1;
    }

    const runs: Array<{ dir: 'R' | 'L'; text: string }> = [];
    for (let i = 0; i < chars.length; i++) {
      const last = runs[runs.length - 1];
      if (last && last.dir === dirs[i]) last.text += chars[i];
      else runs.push({ dir: dirs[i], text: chars[i] });
    }
    return runs;
  }

  private layoutBidiLine(
    doc: PDFKit.PDFDocument,
    text: string,
    font: string,
    size: number,
  ) {
    doc.font(font).fontSize(size);
    const parts = this.buildBidiRuns(text).map((run) => {
      const features = run.dir === 'R' ? (['rtla'] as const) : undefined;
      return {
        text: run.text,
        features,
        width: doc.widthOfString(run.text, {
          features: features ? [...features] : undefined,
        }),
      };
    });
    // RTL paragraph → visual order is the reverse of logical run order.
    parts.reverse();
    return { parts, width: parts.reduce((s, p) => s + p.width, 0) };
  }

  /**
   * Draw a wrapped RTL (Urdu) paragraph, mixed with Latin names / digits.
   * Returns the Y below the last line.
   */
  private drawUrduParagraph(
    doc: PDFKit.PDFDocument,
    text: string,
    x: number,
    y: number,
    w: number,
    opts: {
      bold?: boolean;
      size?: number;
      align?: 'left' | 'center' | 'right';
      color?: string;
    } = {},
  ): number {
    const size = opts.size ?? 10;
    const color = opts.color ?? '#1f2937';
    const align = opts.align ?? 'right';
    const font = opts.bold ? FONT_URDU_BOLD : FONT_URDU;
    const lineH = size * 1.55;

    // Greedy word wrap in logical order.
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (
        current &&
        this.layoutBidiLine(doc, candidate, font, size).width > w
      ) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);

    let cy = y;
    for (const line of lines) {
      const { parts, width } = this.layoutBidiLine(doc, line, font, size);
      let cx =
        align === 'center'
          ? x + (w - width) / 2
          : align === 'left'
            ? x
            : x + w - width;

      for (const part of parts) {
        doc.font(font).fontSize(size).fillColor(color);
        doc.text(part.text, cx, cy, {
          lineBreak: false,
          features: part.features ? [...part.features] : undefined,
        });
        cx += part.width;
      }
      cy += lineH;
    }

    this.resetPageCursor(doc);
    return cy;
  }

  /**
   * Header matches printDriver.ts: logo + tagline | centered title | spacer.
   */
  private drawBrandHeader(
    doc: PDFKit.PDFDocument,
    branding: PrintBranding,
    logoBuf: Buffer | null,
    docTitle: string,
    sub?: string,
  ): number {
    const contentW = PAGE_W - MARGIN * 2;
    const top = MARGIN;
    const logoSize = 56;
    const colW = contentW / 3;

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

    let brandBottom = top + logoSize;
    if (branding.tagLine?.trim()) {
      doc
        .fillColor(MUTED)
        .font('Helvetica')
        .fontSize(8.5)
        .text(branding.tagLine.trim(), MARGIN, top + logoSize + 6, {
          width: Math.min(240, colW),
          lineBreak: false,
          ellipsis: true,
        });
      brandBottom = top + logoSize + 18;
    }

    const titleX = MARGIN + colW;
    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(15)
      .text(docTitle.toUpperCase(), titleX, top + 10, {
        width: colW,
        align: 'center',
        lineBreak: false,
      });
    if (sub?.trim()) {
      doc
        .fillColor(MUTED)
        .font('Helvetica')
        .fontSize(9)
        .text(sub.trim(), titleX, top + 30, {
          width: colW,
          align: 'center',
          lineBreak: false,
        });
    }

    const lineY = Math.max(brandBottom, top + 56) + 10;
    doc
      .moveTo(MARGIN, lineY)
      .lineTo(PAGE_W - MARGIN, lineY)
      .lineWidth(2.5)
      .strokeColor(NAVY)
      .stroke();

    this.resetPageCursor(doc);
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
      .text(title.toUpperCase(), x + 10, y + 7, { width: w - 14, lineBreak: false });

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
        .text(label.toUpperCase(), fx, fy, { width: colW - 4, lineBreak: false });
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
  ) {
    const h = 178;
    doc.roundedRect(x, y, w, h, 8).fillAndStroke('#f8fafc', BORDER);

    const frameX = x + 10;
    const frameY = y + 10;
    const frameW = w - 20;
    const frameH = 132;

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

  private resetPageCursor(doc: PDFKit.PDFDocument) {
    doc.x = MARGIN;
    doc.y = MARGIN;
  }

  /** Absolute-position text — avoids PDFKit flow cursor triggering extra blank pages. */
  private textAt(
    doc: PDFKit.PDFDocument,
    text: string,
    x: number,
    y: number,
    opts: PDFKit.Mixins.TextOptions = {},
  ) {
    doc.text(text, x, y, { lineBreak: false, ...opts });
  }

  private drawPageFooter(doc: PDFKit.PDFDocument, left: string, right: string) {
    const y = FOOTER_Y;
    doc
      .moveTo(MARGIN, y - 8)
      .lineTo(PAGE_W - MARGIN, y - 8)
      .strokeColor('#e5e7eb')
      .lineWidth(1)
      .stroke();
    const contentW = PAGE_W - MARGIN * 2;
    this.textAt(doc, left, MARGIN, y, { width: contentW / 2 });
    this.textAt(doc, right, MARGIN + contentW / 2, y, {
      width: contentW / 2,
      align: 'right',
    });
    this.resetPageCursor(doc);
  }

  private drawRichParagraph(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    w: number,
    parts: Array<{ text: string; bold?: boolean }>,
  ): number {
    const fullText = parts.map((p) => p.text).join('');
    doc
      .fillColor('#1f2937')
      .font('Helvetica')
      .fontSize(9)
      .text(fullText, x, y, {
        width: w,
        align: 'justify',
        lineGap: 0,
      });
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

  private readInvoiceAsset(filename: string): Buffer | null {
    const candidates = [
      join(process.cwd(), 'src', 'common', 'invoice-print', filename),
      join(__dirname, '..', '..', 'common', 'invoice-print', filename),
    ];
    for (const filePath of candidates) {
      if (existsSync(filePath)) {
        try {
          return readFileSync(filePath);
        } catch (err) {
          this.logger.warn(
            `Could not read print asset ${filename}: ${String(err)}`,
          );
        }
      }
    }
    this.logger.warn(`Print asset missing: ${filename}`);
    return null;
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
