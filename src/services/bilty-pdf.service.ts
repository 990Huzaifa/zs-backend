import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as QRCode from 'qrcode';
import puppeteer, { type Browser } from 'puppeteer';
import { Repository } from 'typeorm';
import {
  Bilty,
  BiltyStatus,
} from '../database/entities/bilty.entity';
import {
  BusinessInfoSettingValue,
  SystemSetting,
  SystemSettingKey,
} from '../database/entities/system-setting.entity';

const NAVY = '#1A3C70';

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

const I = {
  hash: `<svg viewBox="0 0 24 24" fill="none" stroke="${NAVY}" stroke-width="2"><path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/></svg>`,
  calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="${NAVY}" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`,
  file: `<svg viewBox="0 0 24 24" fill="none" stroke="${NAVY}" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>`,
  weight: `<svg viewBox="0 0 24 24" fill="none" stroke="${NAVY}" stroke-width="2"><path d="M12 3v3M8.5 21h7l1.5-9h-10L8.5 21zM9 12l1.5-3h3L15 12"/></svg>`,
  box: `<svg viewBox="0 0 24 24" fill="none" stroke="${NAVY}" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96 12 12.01l8.73-5.05M12 22.08V12"/></svg>`,
  user: `<svg viewBox="0 0 24 24" fill="none" stroke="${NAVY}" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/></svg>`,
  phone: `<svg viewBox="0 0 24 24" fill="none" stroke="${NAVY}" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.35 1.9.67 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.32 1.85.54 2.81.67A2 2 0 0 1 22 16.92z"/></svg>`,
  truck: `<svg viewBox="0 0 24 24" fill="none" stroke="${NAVY}" stroke-width="2"><path d="M1 3h15v13H1zM16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`,
  map: `<svg viewBox="0 0 24 24" fill="none" stroke="${NAVY}" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
  mail: `<svg viewBox="0 0 24 24" fill="none" stroke="${NAVY}" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 7L2 7"/></svg>`,
};

export type BiltyPdfResult = {
  buffer: Buffer;
  filename: string;
  code: string;
};

@Injectable()
export class BiltyPdfService implements OnModuleDestroy {
  private readonly logger = new Logger(BiltyPdfService.name);
  private browserPromise: Promise<Browser> | null = null;

  constructor(
    @InjectRepository(Bilty)
    private readonly biltyRepo: Repository<Bilty>,
    @InjectRepository(SystemSetting)
    private readonly settingRepo: Repository<SystemSetting>,
    private readonly configService: ConfigService,
  ) {}

  async onModuleDestroy() {
    if (!this.browserPromise) return;
    try {
      const browser = await this.browserPromise;
      await browser.close();
    } catch (err) {
      this.logger.warn(`Failed to close puppeteer browser: ${String(err)}`);
    } finally {
      this.browserPromise = null;
    }
  }

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
    const branding = await this.resolveBranding();
    const qrSvg = await this.buildPublicQrSvg(bilty.code || bilty.id);
    const html = this.buildPrintHtml(bilty, branding, qrSvg);

    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
      await page.setContent(html, {
        waitUntil: 'load',
        timeout: 60_000,
      });
      // Allow remote logo/assets a moment to finish loading.
      await page.waitForNetworkIdle({ idleTime: 500, timeout: 15_000 }).catch(() => undefined);
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '8mm', right: '8mm', bottom: '8mm', left: '8mm' },
        preferCSSPageSize: true,
      });
      return {
        buffer: Buffer.from(pdf),
        filename: `bilty-${bilty.code}.pdf`,
        code: bilty.code,
      };
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  private async getBrowser(): Promise<Browser> {
    if (!this.browserPromise) {
      this.browserPromise = puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--font-render-hinting=none',
        ],
      });
    }
    return this.browserPromise;
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
      (value.logoUrl ?? '').trim() ||
      DEFAULT_BUSINESS_INFO.logoUrl ||
      '';

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

  private async buildPublicQrSvg(codeOrId: string, size = 76): Promise<string> {
    const url = this.publicBiltyUrl(codeOrId);
    const svg = await QRCode.toString(url, {
      type: 'svg',
      width: size,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: NAVY, light: '#FFFFFF' },
    });
    return svg.replace(/<\?xml[^?]*\?>/i, '').trim();
  }

  private buildPrintHtml(
    bilty: Bilty,
    branding: PrintBranding,
    qrSvg: string,
  ): string {
    const pages = BILTY_COPY_MARKS.map((mark) =>
      this.buildPageBody(bilty, branding, mark, qrSvg),
    ).join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Bilty ${this.esc(bilty.code)} — 3 copies</title>
  <style>${this.printStyles()}</style>
</head>
<body>
${pages}
</body>
</html>`;
  }

  private buildPageBody(
    bilty: Bilty,
    branding: PrintBranding,
    copyMark: BiltyCopyMark,
    qrSvg: string,
  ): string {
    const loading = bilty.loadings?.[0];
    const offLoading = bilty.offLoadings?.[0];
    const code = bilty.code || bilty.id;
    const statusLabel =
      bilty.status === BiltyStatus.PENDING
        ? 'DRAFT'
        : (BILTY_STATUS_LABELS[bilty.status] ?? bilty.status);
    const wmColor = this.statusWatermarkColor(bilty.status);
    const phoneLine =
      [branding.ptcl, branding.phone].filter(Boolean).join(' · ') || '—';

    return `
  <div class="page" style="--wm-color: ${wmColor}">
    <div class="watermark"><span>${this.esc(statusLabel)}</span></div>
    <div class="content">
      <div class="header">
        <div class="logo">
          <img src="${this.esc(branding.logoUrl)}" alt="${this.esc(branding.name)}" />
        </div>
        <div class="header-center">
          <p class="doc-title">BILTY</p>
          <div class="copy-mark">${this.esc(copyMark)}</div>
        </div>
        <div class="qr-wrap">
          ${qrSvg}
          <p class="qr-code-label">${this.esc(code)}</p>
        </div>
      </div>

      <div class="contact-bar">
        <div class="contact-item">
          ${I.map}
          <div class="ci-body">
            <span class="ci-title">${this.esc(branding.name)}</span>
            <span class="ci-sub">${branding.addressLine ? this.esc(branding.addressLine) : '—'}</span>
          </div>
        </div>
        <div class="contact-item">
          ${I.phone}
          <div class="ci-body">
            <span class="ci-title">Phone:</span>
            <span class="ci-sub">${this.esc(phoneLine)}</span>
          </div>
        </div>
        <div class="contact-item">
          ${I.mail}
          <div class="ci-body">
            <span class="ci-title">Email:</span>
            <span class="ci-sub">${branding.email ? this.esc(branding.email) : '—'}</span>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="meta-grid">
          ${this.metaField(I.hash, 'Bilty Code', this.dash(bilty.code))}
          ${this.metaField(I.calendar, 'Issue Date', this.fmtDate(bilty.issueDate))}
          ${this.metaField(I.file, 'Description', this.dash(bilty.description))}
          ${this.metaField(I.hash, 'Client Reference', this.dash(bilty.refNumber))}
          ${this.metaField(I.weight, 'Total Weight', this.dash(bilty.totalWeight))}
          ${this.metaField(I.box, 'Packages', this.dash(bilty.noOfPackages))}
          ${this.metaField(I.user, 'Driver Name', this.dash(bilty.driver?.user?.name))}
          ${this.metaField(I.phone, 'Driver Phone', this.dash(bilty.driver?.phone))}
          ${this.metaField(I.truck, 'Vehicle No.', this.dash(bilty.vehicle?.regNo))}
        </div>
      </div>

      <div class="stops">
        <div class="stop-card">
          <div class="stop-head">Loading Details</div>
          <div class="stop-body">
            ${this.stopRow('Consignee / Sender', this.dash(loading?.client?.companyName))}
            ${this.stopRow('Arrival Date', this.fmtDate(loading?.arrivalDate))}
            ${this.stopRow('Loading Date', this.fmtDate(loading?.loadingDate))}
            ${this.stopRow('Time In', this.fmtTime(loading?.loadingTimeIn))}
            ${this.stopRow('Time Out', this.fmtTime(loading?.loadingTimeOut))}
            ${this.stopRow('No. of Loading Stops', loading?.noOfLoadingStops != null ? this.esc(String(loading.noOfLoadingStops)) : '—')}
            ${this.stopRow('Pickup Address', this.addressOf(loading?.pickupLocation?.name, loading?.pickupLocation?.address))}
          </div>
        </div>
        <div class="stop-card">
          <div class="stop-head">Offloading Details</div>
          <div class="stop-body">
            ${this.stopRow('Receiver', this.dash(offLoading?.client?.companyName))}
            ${this.stopRow('Arrival Date', this.fmtDate(offLoading?.offLoadingDate))}
            ${this.stopRow('Offloading Date', this.fmtDate(offLoading?.offLoadingDate))}
            ${this.stopRow('Time In', this.fmtTime(offLoading?.offLoadingTimeIn))}
            ${this.stopRow('Time Out', this.fmtTime(offLoading?.offLoadingTimeOut))}
            ${this.stopRow('No. of Off-loading Stops', offLoading?.noOfOffLoadingStops != null ? this.esc(String(offLoading.noOfOffLoadingStops)) : '—')}
            ${this.stopRow('Destination Address', this.addressOf(offLoading?.dropoffLocation?.name, offLoading?.dropoffLocation?.address))}
          </div>
        </div>
      </div>

      <div class="parties">
        ${this.partyCol('Transporter', this.dash(bilty.transaportorName), this.dash(bilty.transaportorPhone))}
        ${this.partyCol('POC Loading', this.dash(loading?.loadingContactName), this.dash(loading?.loadingContactPhone))}
        ${this.partyCol('POC Offloading', this.dash(offLoading?.offLoadingContactName), this.dash(offLoading?.offLoadingContactPhone))}
      </div>

      <div class="meta-footer">
        <div class="meta-footer-item">${I.user}<span>Created By: ${this.dash(bilty.createdBy?.name)}</span></div>
        <div class="meta-footer-item center">${I.file}<span>This is a system generated document. Thanks for choosing ${this.esc(branding.name)}.</span></div>
        <div class="meta-footer-item">${I.calendar}<span>Created At: ${this.fmtDateTime(bilty.createdAt)}</span></div>
      </div>

      <div class="page-footer">
        ${branding.footerLine ? this.esc(branding.footerLine) : this.esc(branding.name)}
      </div>
    </div>
  </div>`;
  }

  private printStyles(): string {
    return `
    @page { size: A4; margin: 8mm; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      font-family: Arial, Helvetica, sans-serif;
      color: #122b52;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .page {
      position: relative;
      width: 100%;
      max-width: 194mm;
      margin: 0 auto;
      overflow: hidden;
      page-break-after: always;
      break-after: page;
      padding: 1mm 0 3mm;
      min-height: 268mm;
    }
    .page:last-child {
      page-break-after: auto;
      break-after: auto;
    }
    .watermark {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
      z-index: 0;
    }
    .watermark span {
      font-size: 72px;
      font-weight: 900;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--wm-color, rgba(180, 83, 9, 0.10));
      transform: rotate(-28deg);
      white-space: nowrap;
      user-select: none;
    }
    .content { position: relative; z-index: 1; }
    .header {
      display: grid;
      grid-template-columns: 100px 1fr 90px;
      align-items: center;
      gap: 8px;
      padding-bottom: 10px;
      border-bottom: 1px solid #e2e8f0;
    }
    .logo {
      width: 90px;
      height: 90px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .logo img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: block;
    }
    .header-center { text-align: center; }
    .doc-title {
      margin: 0;
      font-size: 30px;
      font-weight: 900;
      color: ${NAVY};
      letter-spacing: 0.08em;
      line-height: 1;
    }
    .copy-mark {
      margin-top: 8px;
      display: inline-block;
      padding: 3px 14px;
      border: 1.5px solid ${NAVY};
      border-radius: 999px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: ${NAVY};
      background: #fff;
    }
    .qr-wrap { text-align: center; }
    .qr-wrap svg {
      width: 76px;
      height: 76px;
      display: block;
      margin: 0 auto;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      padding: 2px;
      background: #fff;
    }
    .qr-code-label {
      margin: 4px 0 0;
      font-size: 10px;
      font-weight: 800;
      font-family: ui-monospace, Consolas, monospace;
      color: ${NAVY};
    }
    .contact-bar {
      display: grid;
      grid-template-columns: 1.6fr 0.9fr 1.1fr;
      gap: 0;
      padding: 9px 0;
      margin-bottom: 12px;
      border-bottom: 1px solid #e2e8f0;
    }
    .contact-item {
      display: flex;
      align-items: flex-start;
      gap: 7px;
      min-width: 0;
      padding: 0 10px;
      border-right: 1px solid #e2e8f0;
    }
    .contact-item:first-child { padding-left: 0; }
    .contact-item:last-child { border-right: none; padding-right: 0; }
    .contact-item svg {
      width: 13px;
      height: 13px;
      flex-shrink: 0;
      margin-top: 1px;
    }
    .contact-item .ci-body { min-width: 0; }
    .contact-item .ci-title {
      display: block;
      font-size: 9px;
      font-weight: 800;
      color: ${NAVY};
      line-height: 1.25;
    }
    .contact-item .ci-sub {
      display: block;
      font-size: 8px;
      font-weight: 600;
      color: #64748b;
      line-height: 1.35;
      margin-top: 1px;
      word-break: break-word;
    }
    .card {
      border: 1px solid #d8e0ec;
      border-radius: 12px;
      padding: 12px 14px;
      margin-bottom: 11px;
      background: #fff;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 11px 12px;
    }
    .meta-field {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      min-width: 0;
    }
    .meta-icon {
      width: 26px;
      height: 26px;
      border-radius: 7px;
      background: #eef2f7;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .meta-icon svg { width: 13px; height: 13px; }
    .meta-text { min-width: 0; }
    .meta-label {
      font-size: 8px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #94a3b8;
    }
    .meta-value {
      margin-top: 2px;
      font-size: 11.5px;
      font-weight: 700;
      color: #0f172a;
      word-break: break-word;
      line-height: 1.3;
    }
    .stops {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 11px;
    }
    .stop-card {
      border: 1px solid #d8e0ec;
      border-radius: 12px;
      overflow: hidden;
      background: transparent;
    }
    .stop-head {
      padding: 9px 12px 7px;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: ${NAVY};
      border-bottom: 1px solid #eef2f7;
      background: transparent;
    }
    .stop-body { padding: 2px 12px 8px; }
    .stop-row {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      padding: 6.5px 0;
      border-bottom: 1px dotted #d8e0ec;
      font-size: 10px;
    }
    .stop-row:last-child { border-bottom: none; }
    .stop-label { color: #64748b; font-weight: 600; flex-shrink: 0; }
    .stop-value {
      color: #0f172a;
      font-weight: 700;
      text-align: right;
      max-width: 62%;
      word-break: break-word;
    }
    .parties {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 10px;
      margin-bottom: 12px;
      page-break-inside: avoid;
    }
    .party-col {
      border: 1px solid #d8e0ec;
      border-radius: 12px;
      padding: 10px 12px 11px;
      background: transparent;
    }
    .party-head {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 9px;
    }
    .party-icon {
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .party-icon svg { width: 14px; height: 14px; }
    .party-title {
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: ${NAVY};
    }
    .party-row { margin-bottom: 7px; }
    .party-row:last-child { margin-bottom: 0; }
    .party-label {
      display: block;
      font-size: 8px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #94a3b8;
      margin-bottom: 2px;
    }
    .party-value {
      display: block;
      font-size: 11px;
      font-weight: 700;
      color: #0f172a;
      word-break: break-word;
    }
    .meta-footer {
      display: grid;
      grid-template-columns: 1fr 1.6fr 1.15fr;
      gap: 0;
      padding: 9px 0;
      border-top: 1px solid #e2e8f0;
      border-bottom: 1px solid #e2e8f0;
      font-size: 8.5px;
      color: #64748b;
    }
    .meta-footer-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 0 10px;
      border-right: 1px solid #e2e8f0;
      min-width: 0;
    }
    .meta-footer-item:first-child { padding-left: 0; }
    .meta-footer-item:last-child { border-right: none; padding-right: 0; justify-content: flex-end; }
    .meta-footer-item.center { justify-content: center; text-align: center; }
    .meta-footer-item svg {
      width: 12px;
      height: 12px;
      flex-shrink: 0;
    }
    .page-footer {
      margin-top: 10px;
      text-align: center;
      font-size: 7.5px;
      color: #94a3b8;
      line-height: 1.45;
    }
  `;
  }

  private statusWatermarkColor(status: BiltyStatus): string {
    if (status === BiltyStatus.COMPLETED) return 'rgba(29, 78, 216, 0.10)';
    if (status === BiltyStatus.APPROVED) return 'rgba(5, 150, 105, 0.10)';
    if (status === BiltyStatus.CANCELLED) return 'rgba(220, 38, 38, 0.10)';
    return 'rgba(180, 83, 9, 0.10)';
  }

  private metaField(icon: string, label: string, value: string): string {
    return `<div class="meta-field">
    <div class="meta-icon">${icon}</div>
    <div class="meta-text">
      <div class="meta-label">${this.esc(label)}</div>
      <div class="meta-value">${value}</div>
    </div>
  </div>`;
  }

  private stopRow(label: string, value: string): string {
    return `<div class="stop-row">
    <span class="stop-label">${this.esc(label)}</span>
    <span class="stop-value">${value}</span>
  </div>`;
  }

  private partyCol(title: string, name: string, phone: string): string {
    return `<div class="party-col">
    <div class="party-head">
      <span class="party-icon">${I.user}</span>
      <span class="party-title">${this.esc(title)}</span>
    </div>
    <div class="party-row">
      <span class="party-label">Name</span>
      <span class="party-value">${name}</span>
    </div>
    <div class="party-row">
      <span class="party-label">Cell No.</span>
      <span class="party-value">${phone}</span>
    </div>
  </div>`;
  }

  private esc(value?: string | null): string {
    if (value == null || value === '') return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private dash(value?: string | null): string {
    const v = (value ?? '').trim();
    return v ? this.esc(v) : '—';
  }

  private addressOf(name?: string | null, address?: string | null): string {
    const joined = [name, address].filter(Boolean).join(', ');
    return joined ? this.esc(joined) : '—';
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
