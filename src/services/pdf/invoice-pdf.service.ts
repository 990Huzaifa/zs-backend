import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as fs from 'fs';
import * as path from 'path';
import PDFDocument from 'pdfkit';
import * as QRCode from 'qrcode';
import { Repository } from 'typeorm';
import {
  ClientInvoice,
  ClientInvoiceItem,
} from '../../database/entities/client-invoice.entity';
import {
  BusinessInfoSettingValue,
  SystemSetting,
  SystemSettingKey,
} from '../../database/entities/system-setting.entity';
import {
  TripDowncountryLoad,
  TripUpcountryLoad,
} from '../../database/entities/trip.entity';

const NAVY = '#1A3C70';
const MUTED = '#4b5563';
const HEADER_BG = '#4b5563';
const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
/** Page content margins (~0.85" / ~22mm). Decorative PNGs stay edge-flush. */
const MARGIN_X = 64;
const MARGIN_TOP = 50;
const MARGIN_BOTTOM = 52;
const COMPANY_NTN = '262742-5';
const DEFAULT_IBAN = 'PK38BKIP0120600046850001';
const DEFAULT_WEBSITE = 'www.zslogis.com';

const DEFAULT_BUSINESS_INFO: BusinessInfoSettingValue = {
  logoUrl:
    'https://zsparktech-bucket.s3.eu-north-1.amazonaws.com/assets/logo.png',
  companyName: 'ZS Logistics',
  tagLine: null,
  address:
    'Building No. 90-C, Street 1st, Ayyubiya Commercial, DHA Phase 7 Extension.',
  ptcl: null,
  phone: '0346-2319966',
  email: 'aizeen.shah@zslogis.com',
};

type PrintBranding = {
  logoUrl: string;
  name: string;
  addressLine: string;
  phone: string;
  ptcl: string;
  email: string;
  tagLine: string | null;
};

type InvoiceLineRow = {
  deliveryOrderNo: string;
  regNo: string;
  loadingArea: string;
  unloadingArea: string;
  loadingDate: string | null;
  freightAmount: number;
  salesTaxAmount: number;
  inclAmount: number;
};

export type InvoicePdfResult = {
  buffer: Buffer;
  filename: string;
  invoiceNumber: string;
};

type InvoicePrintAssets = {
  stamp: Buffer | null;
  signature: Buffer | null;
  cornerTopLeft: Buffer | null;
  shapeBottom: Buffer | null;
};

@Injectable()
export class InvoicePdfService {
  private readonly logger = new Logger(InvoicePdfService.name);

  constructor(
    @InjectRepository(ClientInvoice)
    private readonly invoiceRepo: Repository<ClientInvoice>,
    @InjectRepository(SystemSetting)
    private readonly settingRepo: Repository<SystemSetting>,
    private readonly configService: ConfigService,
  ) {}

  async generateById(id: string): Promise<InvoicePdfResult> {
    const invoice = await this.loadInvoice({ id });
    if (!invoice) throw new NotFoundException('Client invoice not found');
    return this.renderPdf(invoice);
  }

  async generateByCodeOrId(codeOrId: string): Promise<InvoicePdfResult> {
    const key = codeOrId.trim();
    if (!key) throw new NotFoundException('Client invoice not found');

    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    const invoice = uuidRe.test(key)
      ? await this.loadInvoice({ id: key })
      : await this.loadInvoice({ invoiceNumber: key.toUpperCase() });

    if (!invoice) throw new NotFoundException('Client invoice not found');
    return this.renderPdf(invoice);
  }

  private async renderPdf(invoice: ClientInvoice): Promise<InvoicePdfResult> {
    try {
      const branding = await this.resolveBranding();
      const assets = this.loadPrintAssets();
      const qrPng = await this.buildPublicQrPng(invoice.invoiceNumber);
      const logoBuf = await this.fetchLogoBuffer(branding.logoUrl);
      const rows = this.buildLineRows(invoice);

      const buffer = await new Promise<Buffer>((resolve, reject) => {
        const doc = new PDFDocument({
          size: 'A4',
          margin: 0,
          info: {
            Title: `Sales Tax Invoice ${invoice.invoiceNumber}`,
            Author: branding.name,
          },
        });
        const chunks: Buffer[] = [];
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        this.drawPage(doc, invoice, branding, rows, assets, qrPng, logoBuf);
        doc.end();
      });

      return {
        buffer,
        filename: `invoice-${invoice.invoiceNumber}.pdf`,
        invoiceNumber: invoice.invoiceNumber,
      };
    } catch (err) {
      this.logger.error(
        `Failed to generate invoice PDF for ${invoice.invoiceNumber}`,
        err instanceof Error ? err.stack : String(err),
      );
      throw new InternalServerErrorException('Failed to generate invoice PDF');
    }
  }

  private drawPage(
    doc: PDFKit.PDFDocument,
    invoice: ClientInvoice,
    branding: PrintBranding,
    rows: InvoiceLineRow[],
    assets: InvoicePrintAssets,
    qrPng: Buffer,
    logoBuf: Buffer | null,
  ) {
    const contentW = PAGE_W - MARGIN_X * 2;

    // Decorative PNGs first (background layer — FE z-index: 0, edge-flush)
    // Decorative PNGs (background). Corner inset from left — not flush to page edge.
    if (assets.cornerTopLeft) {
      const cornerLeftPad = 18;
      doc.image(assets.cornerTopLeft, cornerLeftPad, PAGE_H * 0.05, {
        width: 150,
        height: undefined,
      });
    }
    if (assets.shapeBottom) {
      const shapeH = 100;
      doc.image(assets.shapeBottom, 0, PAGE_H - shapeH - MARGIN_BOTTOM + 8, {
        width: PAGE_W,
        height: shapeH,
      });
    }

    // Header: logo LEFT + QR RIGHT inside content margins
    const headerTop = MARGIN_TOP + 28;
    const logoSize = 72;
    const qrSize = 72;
    const logoX = MARGIN_X;
    const qrX = PAGE_W - MARGIN_X - qrSize;

    let y = headerTop + Math.max(logoSize, qrSize) + 18;

    // Title
    doc
      .font('Helvetica-Bold')
      .fontSize(16)
      .fillColor('#111111')
      .text('Sales Tax Invoice', MARGIN_X, y, {
        width: contentW,
        align: 'center',
        underline: true,
      });
    y += 28;

    const companyName = branding.name.includes('Logistics')
      ? branding.name
      : `${branding.name} Logistics Services`;
    const client = invoice.client;
    const clientName = client?.companyName ?? '—';
    const clientNtn = client?.ntn ?? '—';
    const clientAddress = client?.companyAddress ?? '—';
    const companyAddress =
      branding.addressLine || DEFAULT_BUSINESS_INFO.address || '—';
    const invoiceDate = this.fmtDate(invoice.invoiceDate);
    const purpose = 'Transportation Invoice';

    // Meta box
    const metaTopH = 22;
    const metaPartyH = 58;
    const metaPurposeH = 20;
    const metaH = metaTopH + metaPartyH + metaPurposeH;
    const metaX = MARGIN_X;
    const half = contentW / 2;

    doc.rect(metaX, y, contentW, metaH).strokeColor('#222222').lineWidth(1.5).stroke();
    doc
      .moveTo(metaX, y + metaTopH)
      .lineTo(metaX + contentW, y + metaTopH)
      .strokeColor('#222222')
      .lineWidth(1)
      .stroke();
    doc
      .moveTo(metaX + half, y)
      .lineTo(metaX + half, y + metaTopH + metaPartyH)
      .stroke();
    doc
      .moveTo(metaX, y + metaTopH + metaPartyH)
      .lineTo(metaX + contentW, y + metaTopH + metaPartyH)
      .stroke();

    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor('#111')
      .text(`Invoice No: ${invoice.invoiceNumber}`, metaX + 8, y + 6, {
        width: half - 16,
      })
      .text(`Date: ${invoiceDate}`, metaX + half + 8, y + 6, {
        width: half - 16,
        align: 'right',
      });

    const partyY = y + metaTopH + 6;
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#111')
      .text(`Customer Name: ${clientName}`, metaX + 8, partyY, {
        width: half - 16,
      })
      .text(`NTN: ${clientNtn}`, metaX + 8, partyY + 14, { width: half - 16 })
      .text(`Address: ${clientAddress}`, metaX + 8, partyY + 28, {
        width: half - 16,
      });

    doc
      .text(`Company Name: ${companyName}`, metaX + half + 8, partyY, {
        width: half - 16,
      })
      .text(`NTN: ${COMPANY_NTN}`, metaX + half + 8, partyY + 14, {
        width: half - 16,
      })
      .text(`Address: ${companyAddress}`, metaX + half + 8, partyY + 28, {
        width: half - 16,
      });

    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .text(`Purpose: ${purpose}`, metaX + 8, y + metaTopH + metaPartyH + 5, {
        width: contentW - 16,
      });

    y += metaH + 12;

    // Sales tax authority from first item rule
    const firstRule = invoice.items?.[0]?.saleTaxRule;
    const taxAuthority =
      firstRule?.authority?.match(/\b(SRB|PRA|FBR)\b/i)?.[1]?.toUpperCase() ||
      firstRule?.code?.match(/\b(SRB|PRA|FBR)\b/i)?.[0]?.toUpperCase() ||
      'SRB';

    const colWidths = [24, 52, 42, 72, 62, 48, 68, 55, 68];
    // adjust to contentW
    const colSum = colWidths.reduce((a, b) => a + b, 0);
    const scale = contentW / colSum;
    const cols = colWidths.map((w) => w * scale);

    const headers = [
      'Sr.No.',
      'Delivery\nChallan No.',
      'Reg. No.',
      'Loading Area',
      'Unloading Area',
      'Loading\nDate',
      'Value Excluding\nSales Tax 100%',
      `Sales Tax\n${taxAuthority}`,
      'Value Including\nSales Tax',
    ];

    const headerH = 32;
    this.drawTableHeader(doc, MARGIN_X, y, cols, headers, headerH);
    y += headerH;

    let totalExcl = 0;
    let totalTax = 0;
    let totalIncl = 0;
    const rowH = 22;

    if (!rows.length) {
      doc
        .rect(MARGIN_X, y, contentW, rowH)
        .strokeColor('#222')
        .lineWidth(0.8)
        .stroke();
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#111')
        .text('No trips', MARGIN_X, y + 6, {
          width: contentW,
          align: 'center',
        });
      y += rowH;
    } else {
      rows.forEach((row, i) => {
        totalExcl += row.freightAmount;
        totalTax += row.salesTaxAmount;
        totalIncl += row.inclAmount;

        if (y + rowH > PAGE_H - 220) {
          // simple: keep on one page for typical invoices; clip if too many
        }

        const cells = [
          String(i + 1),
          row.deliveryOrderNo,
          row.regNo,
          row.loadingArea,
          row.unloadingArea,
          this.fmtDateShort(row.loadingDate),
          this.moneyDec(row.freightAmount),
          this.moneyDec(row.salesTaxAmount),
          this.moneyDec(row.inclAmount),
        ];
        const aligns: Array<'left' | 'center' | 'right'> = [
          'center',
          'center',
          'center',
          'left',
          'left',
          'center',
          'right',
          'right',
          'right',
        ];
        this.drawTableRow(doc, MARGIN_X, y, cols, cells, aligns, rowH);
        y += rowH;
      });
    }

    // Footer totals
    const footH = 22;
    doc.rect(MARGIN_X, y, contentW, footH).fillAndStroke('#e5e7eb', '#222');
    const labelW = cols.slice(0, 6).reduce((a, b) => a + b, 0);
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor('#111')
      .text('Total Invoice Amount', MARGIN_X + 4, y + 6, {
        width: labelW - 8,
        align: 'right',
      });
    let fx = MARGIN_X + labelW;
    const footVals = [
      this.moneyDec(totalExcl),
      this.moneyDec(totalTax),
      this.moneyDec(totalIncl),
    ];
    footVals.forEach((v, i) => {
      const w = cols[6 + i];
      doc.text(v, fx + 2, y + 6, { width: w - 4, align: 'right' });
      fx += w;
    });
    y += footH + 10;

    // WHT note
    const whtRate = Number(invoice.items?.[0]?.withholdingTaxRate ?? 0);
    if (whtRate > 0) {
      const whtAmt = Math.round(totalExcl * (whtRate / 100));
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(MUTED)
        .text(
          `Withholding tax (${whtRate}%) may apply as per client agreement — ${this.money(whtAmt)} on freight excl. tax.`,
          MARGIN_X,
          y,
          { width: contentW },
        );
      y += 16;
    }

    // Terms
    const iban = DEFAULT_IBAN;
    const terms = `Payment should be made in favor of ${companyName.toUpperCase()} through Crossed cheque, Banker's Cheque or IBFT to Company's IBAN: ${iban}`;
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor('#111')
      .text('Terms and Conditions:', MARGIN_X, y, { width: contentW });
    y += 14;
    doc
      .font('Helvetica')
      .fontSize(9)
      .text(terms, MARGIN_X, y, { width: contentW });
    y = (doc.y || y) + 20;

    // Sign row flows right after terms (not pinned to page bottom)
    const signY = y;
    const blockW = contentW * 0.42;

    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor('#111')
      .text('Approved By', MARGIN_X, signY);

    if (assets.signature) {
      doc.image(assets.signature, MARGIN_X, signY + 16, {
        fit: [140, 48],
      });
    }
    doc
      .moveTo(MARGIN_X, signY + 72)
      .lineTo(MARGIN_X + blockW * 0.7, signY + 72)
      .strokeColor('#222')
      .lineWidth(1)
      .stroke();

    // Stamp right — image first, caption below (matches FE)
    const stampX = PAGE_W - MARGIN_X - blockW;
    const stampSize = 84;
    if (assets.stamp) {
      doc.image(assets.stamp, stampX + blockW - stampSize, signY, {
        fit: [stampSize, stampSize],
      });
    }
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor('#111')
      .text('Company Stamp', stampX, signY + stampSize + 4, {
        width: blockW,
        align: 'right',
      });

    // Page footer — inset from page edge
    const footY = PAGE_H - MARGIN_BOTTOM + 10;
    const phone = branding.phone || branding.ptcl || '0346-2319966';
    const email = branding.email || 'aizeen.shah@zslogis.com';
    const address = companyAddress;
    doc
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor('#111')
      .text(
        `${phone}   ·   ${email}   ·   ${DEFAULT_WEBSITE}   ·   ${address}`,
        MARGIN_X,
        footY,
        { width: contentW, align: 'left' },
      );

    // Logo + QR last → paint above corner shape (FE content z-index > corner)
    if (logoBuf) {
      doc.image(logoBuf, logoX, headerTop, {
        fit: [logoSize, logoSize],
      });
      if (branding.tagLine) {
        doc
          .font('Helvetica-Bold')
          .fontSize(7)
          .fillColor(NAVY)
          .text(branding.tagLine, logoX, headerTop + logoSize + 2, {
            width: logoSize,
            align: 'left',
          });
      }
    }
    doc.image(qrPng, qrX, headerTop, { width: qrSize, height: qrSize });
    doc
      .font('Helvetica-Bold')
      .fontSize(7)
      .fillColor(MUTED)
      .text(invoice.invoiceNumber, qrX - 8, headerTop + qrSize + 2, {
        width: qrSize + 16,
        align: 'center',
      });
  }

  private drawTableHeader(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    cols: number[],
    headers: string[],
    h: number,
  ) {
    let cx = x;
    const totalW = cols.reduce((a, b) => a + b, 0);
    doc.rect(x, y, totalW, h).fill(HEADER_BG);
    headers.forEach((label, i) => {
      const w = cols[i];
      doc.rect(cx, y, w, h).strokeColor('#222').lineWidth(0.8).stroke();
      doc
        .font('Helvetica-Bold')
        .fontSize(7)
        .fillColor('#ffffff')
        .text(label, cx + 2, y + 4, {
          width: w - 4,
          align: 'center',
          lineGap: 1,
        });
      cx += w;
    });
  }

  private drawTableRow(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    cols: number[],
    cells: string[],
    aligns: Array<'left' | 'center' | 'right'>,
    h: number,
  ) {
    let cx = x;
    cells.forEach((cell, i) => {
      const w = cols[i];
      doc.rect(cx, y, w, h).strokeColor('#222').lineWidth(0.8).stroke();
      doc
        .font('Helvetica')
        .fontSize(7.5)
        .fillColor('#111')
        .text(this.dash(cell), cx + 2, y + 6, {
          width: w - 4,
          align: aligns[i],
          ellipsis: true,
          height: h - 8,
        });
      cx += w;
    });
  }

  private buildLineRows(invoice: ClientInvoice): InvoiceLineRow[] {
    const clientId = invoice.clientId;
    return (invoice.items ?? []).map((item) => {
      const trip = item.trip;
      const loads = this.loadsForClient(trip, clientId);
      const primary = loads[0];
      const freight = Number(item.freightAmount) || 0;
      // Prefer stored sales tax amount; fallback to rate * freight
      let salesTax = Number(item.salesTaxAmount);
      if (!Number.isFinite(salesTax)) {
        const rate = Number(item.saleTaxRate) || 0;
        salesTax = Math.round(freight * (rate / 100) * 100) / 100;
      }
      const incl = freight + salesTax;

      return {
        deliveryOrderNo:
          primary?.deliveryChallanNumber?.trim() ||
          trip?.tripCode ||
          '—',
        regNo: trip?.vehicle?.regNo?.trim() || '—',
        loadingArea: this.resolveLoadingArea(primary) || '—',
        unloadingArea: this.resolveUnloadingArea(primary) || '—',
        loadingDate: this.toDateString(
          primary?.loadingDate ??
            this.firstBiltyLoadingDate(primary) ??
            trip?.tripDate,
        ),
        freightAmount: freight,
        salesTaxAmount: salesTax,
        inclAmount: incl,
      };
    });
  }

  private loadsForClient(
    trip: ClientInvoiceItem['trip'] | undefined,
    clientId: string,
  ): Array<TripUpcountryLoad | TripDowncountryLoad> {
    if (!trip) return [];
    const all = [
      ...(trip.upcountryLoads ?? []),
      ...(trip.downcountryLoads ?? []),
    ];
    const matched = all.filter((l) => l.clientId === clientId);
    return matched.length ? matched : all;
  }

  private resolveLoadingArea(
    load?: TripUpcountryLoad | TripDowncountryLoad | null,
  ): string {
    if (!load) return '';
    const fromBilty = load.bilty?.loadings?.[0]?.pickupLocation?.name?.trim();
    if (fromBilty) return fromBilty;
    return (load.address ?? '').trim();
  }

  private resolveUnloadingArea(
    load?: TripUpcountryLoad | TripDowncountryLoad | null,
  ): string {
    if (!load) return '';
    const fromBilty =
      load.bilty?.offLoadings?.[0]?.dropoffLocation?.name?.trim();
    if (fromBilty) return fromBilty;
    return (load.toDetails ?? '').trim();
  }

  private firstBiltyLoadingDate(
    load?: TripUpcountryLoad | TripDowncountryLoad | null,
  ): Date | string | null {
    const d = load?.bilty?.loadings?.[0]?.loadingDate;
    return d ?? null;
  }

  private async loadInvoice(
    where: { id: string } | { invoiceNumber: string },
  ): Promise<ClientInvoice | null> {
    const invoice = await this.invoiceRepo.findOne({
      where,
      relations: {
        client: true,
        items: {
          trip: {
            vehicle: true,
            upcountryLoads: {
              bilty: {
                loadings: { pickupLocation: true },
                offLoadings: { dropoffLocation: true },
              },
            },
            downcountryLoads: {
              bilty: {
                loadings: { pickupLocation: true },
                offLoadings: { dropoffLocation: true },
              },
            },
          },
          saleTaxRule: true,
          withholdingTaxRule: true,
        },
      },
      order: {
        items: { createdAt: 'ASC' },
      },
    });
    return invoice;
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
        'ZS Logistics',
      addressLine:
        (value.address ?? '').trim() || DEFAULT_BUSINESS_INFO.address || '',
      phone: (value.phone ?? '').trim() || DEFAULT_BUSINESS_INFO.phone || '',
      ptcl: (value.ptcl ?? '').trim() || '',
      email: (value.email ?? '').trim() || DEFAULT_BUSINESS_INFO.email || '',
      tagLine: (value.tagLine ?? '').trim() || null,
    };
  }

  private loadPrintAssets(): InvoicePrintAssets {
    return {
      stamp: this.readAsset('stamp.png'),
      signature: this.readAsset('signature.png'),
      cornerTopLeft: this.readAsset('corner-top-left.png'),
      shapeBottom: this.readAsset('shape-bottom.png'),
    };
  }

  private readAsset(filename: string): Buffer | null {
    const candidates = [
      path.join(process.cwd(), 'src', 'common', 'invoice-print', filename),
      path.join(__dirname, '..', '..', 'common', 'invoice-print', filename),
    ];
    for (const filePath of candidates) {
      if (fs.existsSync(filePath)) {
        try {
          return fs.readFileSync(filePath);
        } catch (err) {
          this.logger.warn(
            `Could not read invoice asset ${filename}: ${String(err)}`,
          );
        }
      }
    }
    this.logger.warn(`Invoice print asset missing: ${filename}`);
    return null;
  }

  private publicInvoiceUrl(invoiceNumber: string): string {
    const frontendBase = (
      this.configService.get<string>('FRONTEND_URL') ||
      this.configService.get<string>('APP_URL') ||
      'http://localhost:5173'
    ).replace(/\/$/, '');
    return `${frontendBase}/public/client-invoices/${encodeURIComponent(invoiceNumber)}`;
  }

  private async buildPublicQrPng(invoiceNumber: string): Promise<Buffer> {
    return QRCode.toBuffer(this.publicInvoiceUrl(invoiceNumber), {
      type: 'png',
      width: 160,
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
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      this.logger.warn(`Could not fetch invoice logo: ${String(err)}`);
      return null;
    }
  }

  private fmtDate(iso?: string | Date | null): string {
    const s = this.toDateString(iso);
    if (!s) return '—';
    try {
      const d = new Date(`${s}T00:00:00`);
      if (Number.isNaN(d.getTime())) return '—';
      const day = d.getDate();
      const mon = d.toLocaleDateString('en-GB', { month: 'short' });
      const year = d.getFullYear();
      return `${day}-${mon}-${year}`;
    } catch {
      return s;
    }
  }

  private fmtDateShort(iso?: string | Date | null): string {
    const s = this.toDateString(iso);
    if (!s) return '—';
    try {
      const d = new Date(`${s}T00:00:00`);
      if (Number.isNaN(d.getTime())) return '—';
      const day = d.getDate();
      const mon = d.toLocaleDateString('en-GB', { month: 'short' });
      const year = String(d.getFullYear()).slice(-2);
      return `${day}-${mon}-${year}`;
    } catch {
      return s;
    }
  }

  private toDateString(value?: string | Date | null): string | null {
    if (value === undefined || value === null) return null;
    return String(value).slice(0, 10);
  }

  private money(n: number): string {
    return Math.round(n).toLocaleString('en-PK');
  }

  private moneyDec(n: number): string {
    return n.toLocaleString('en-PK', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  }

  private dash(value?: string | null): string {
    const t = (value ?? '').trim();
    return t || '—';
  }
}
