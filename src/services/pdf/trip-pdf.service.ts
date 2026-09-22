import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import PDFDocument from 'pdfkit';
import { Repository } from 'typeorm';
import { DriverType } from '../../database/entities/driver.entity';
import {
  BusinessInfoSettingValue,
  SystemSetting,
  SystemSettingKey,
} from '../../database/entities/system-setting.entity';
import {
  Trip,
  TripDowncountryLoad,
  TripExpenseStatus,
  TripUpcountryLoad,
} from '../../database/entities/trip.entity';
import { TripsService } from '../trips.service';

const NAVY = '#1A3C70';
const GREEN = '#A9C43F';
const MUTED = '#6b7280';
const LABEL = '#9ca3af';
const VALUE = '#111827';
const BORDER = '#e5e7eb';
const PAGE_W = 595.28;
const PAGE_H = 841.89;
/** ~14mm — page margins are 0; absolute layout uses MARGIN. */
const MARGIN = 40;
const FOOTER_Y = PAGE_H - MARGIN - 28;
const CONTENT_BOTTOM = FOOTER_Y - 12;

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

const EXPENSE_STATUS_LABELS: Record<TripExpenseStatus, string> = {
  [TripExpenseStatus.PENDING]: 'Pending',
  [TripExpenseStatus.PAID]: 'Paid',
  [TripExpenseStatus.CANCELLED]: 'Cancelled',
};

const DRIVER_TYPE_LABELS: Record<DriverType, string> = {
  [DriverType.HELPER]: 'Helper',
  [DriverType.FIRST_DRIVER]: '1st Driver',
  [DriverType.SECOND_DRIVER]: '2nd Driver',
};

type PrintBranding = {
  logoUrl: string;
  name: string;
  tagLine: string;
  footerLine: string;
};

type TripLoad = TripUpcountryLoad | TripDowncountryLoad;

type ExpenseRow = {
  expenseDate?: Date | string | null;
  amount: string;
  status: TripExpenseStatus | string;
  description?: string | null;
  accountOrVendor?: string | null;
  extra?: string | null;
};

export type TripPdfResult = {
  buffer: Buffer;
  filename: string;
  code: string;
};

@Injectable()
export class TripPdfService {
  private readonly logger = new Logger(TripPdfService.name);

  constructor(
    private readonly tripsService: TripsService,
    @InjectRepository(SystemSetting)
    private readonly settingRepo: Repository<SystemSetting>,
  ) {}

  async generateById(id: string): Promise<TripPdfResult> {
    const trip = await this.tripsService.findOne(id);
    return this.renderPdf(trip);
  }

  private async renderPdf(trip: Trip): Promise<TripPdfResult> {
    const code = trip.tripCode?.trim() || trip.id;

    try {
      const branding = await this.resolveBranding();
      const logoBuf = await this.fetchImageBuffer(branding.logoUrl);

      const buffer = await new Promise<Buffer>((resolve, reject) => {
        const doc = new PDFDocument({
          size: 'A4',
          margin: 0,
          autoFirstPage: false,
          info: {
            Title: `Trip ${code}`,
            Author: branding.name,
          },
        });
        const chunks: Buffer[] = [];
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        this.drawTripPage(doc, trip, branding, logoBuf);
        this.drawExpensesPages(doc, trip, branding, logoBuf);

        doc.end();
      });

      const safeCode = code.replace(/[^\w.-]+/g, '_');
      return {
        buffer,
        filename: `trip-${safeCode}.pdf`,
        code,
      };
    } catch (err) {
      this.logger.error(
        `Failed to generate trip PDF for ${code}`,
        err instanceof Error ? err.stack : String(err),
      );
      throw new InternalServerErrorException('Failed to generate trip PDF');
    }
  }

  /** Page 1 — Trip report + loads (matches printTrip.ts). */
  private drawTripPage(
    doc: PDFKit.PDFDocument,
    trip: Trip,
    branding: PrintBranding,
    logoBuf: Buffer | null,
  ): void {
    doc.addPage({ size: 'A4', margin: 0 });
    this.resetPageCursor(doc);

    const printed = this.fmtDate(new Date());
    let y = this.drawBrandHeader(
      doc,
      branding,
      logoBuf,
      'Trip Report',
      `${trip.tripCode} · Printed ${printed}`,
    );

    y = this.drawSection(doc, y, 'Trip Details', [
      ['Trip Code', this.dash(trip.tripCode)],
      ['Issue Date', this.fmtDate(trip.tripDate)],
      ['Vehicle', this.vehicleLabel(trip)],
      ['Odo Reading', this.dash(trip.odoReading)],
    ]);

    y = this.drawDriversSection(doc, trip, y);

    const up = trip.upcountryLoads ?? [];
    const down = trip.downcountryLoads ?? [];
    y = this.drawLoadsSection(doc, 'Upcountry Load', up, y);
    y = this.drawLoadsSection(doc, 'Downcountry Load', down, y);

    this.drawPageFooter(
      doc,
      branding,
      trip.tripCode,
      'Page 1 of 2 · Trip & Loads',
    );
    this.resetPageCursor(doc);
  }

  /** Page 2+ — All expense types + grand total. */
  private drawExpensesPages(
    doc: PDFKit.PDFDocument,
    trip: Trip,
    branding: PrintBranding,
    logoBuf: Buffer | null,
  ): void {
    doc.addPage({ size: 'A4', margin: 0 });
    this.resetPageCursor(doc);

    let y = this.drawBrandHeader(
      doc,
      branding,
      logoBuf,
      'Trip Expenses',
      `${trip.tripCode} · ${this.fmtDate(trip.tripDate)}`,
    );

    const ensureSpace = (needed: number): number => {
      if (y + needed <= CONTENT_BOTTOM) return y;
      this.drawPageFooter(
        doc,
        branding,
        trip.tripCode,
        'Trip Expenses (continued)',
      );
      doc.addPage({ size: 'A4', margin: 0 });
      this.resetPageCursor(doc);
      y = this.drawBrandHeader(
        doc,
        branding,
        logoBuf,
        'Trip Expenses',
        `${trip.tripCode} · continued`,
      );
      return y;
    };

    const office = trip.officeExpenses ?? [];
    const pump = trip.pumpExpenses ?? [];
    const mtag = trip.mtagExpenses ?? [];
    const other = trip.otherExpenses ?? [];

    y = this.drawExpenseTable(
      doc,
      y,
      'Office Expenses',
      office.map((e) => ({
        expenseDate: e.expenseDate,
        amount: e.amount,
        status: e.status,
        description: e.description,
        accountOrVendor: e.assetAccount?.name,
      })),
      ['Date', 'Account', 'Description', 'Status', 'Amount'],
      'No office expenses.',
      ensureSpace,
    );

    y = this.drawExpenseTable(
      doc,
      y,
      'Pump Expenses',
      pump.map((e) => ({
        expenseDate: e.expenseDate,
        amount: e.amount,
        status: e.status,
        description: e.description,
        accountOrVendor: this.vendorName(e.vendor),
      })),
      ['Date', 'Vendor', 'Description', 'Status', 'Amount'],
      'No pump expenses.',
      ensureSpace,
    );

    y = this.drawExpenseTable(
      doc,
      y,
      'M-Tag Expenses',
      mtag.map((e) => ({
        expenseDate: e.expenseDate,
        amount: e.amount,
        status: e.status,
        description: e.description,
        accountOrVendor: e.assetAccount?.name,
      })),
      ['Date', 'Account', 'Description', 'Status', 'Amount'],
      'No M-Tag expenses.',
      ensureSpace,
    );

    y = this.drawExpenseTable(
      doc,
      y,
      'Other Expenses',
      other.map((e) => ({
        expenseDate: e.expenseDate,
        amount: e.amount,
        status: e.status,
        description: e.description,
        accountOrVendor: e.assetAccount?.name,
      })),
      ['Date', 'Account', 'Description', 'Status', 'Amount'],
      'No other expenses.',
      ensureSpace,
    );

    const grand =
      this.sumAmounts(office) +
      this.sumAmounts(pump) +
      this.sumAmounts(mtag) +
      this.sumAmounts(other);

    y = ensureSpace(48);
    y = this.drawGrandTotal(doc, y, grand);

    this.drawPageFooter(
      doc,
      branding,
      trip.tripCode,
      'Page 2 of 2 · Expenses',
    );
    this.resetPageCursor(doc);
  }

  private drawBrandHeader(
    doc: PDFKit.PDFDocument,
    branding: PrintBranding,
    logoBuf: Buffer | null,
    docTitle: string,
    sub: string,
  ): number {
    const top = MARGIN;
    const contentW = PAGE_W - MARGIN * 2;
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

    const textX = MARGIN + logoSize + 12;
    const textW = contentW - 190;
    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(15)
      .text(branding.name, textX, top + 4, {
        width: textW,
        lineBreak: false,
        ellipsis: true,
      });
    if (branding.tagLine) {
      doc
        .fillColor(MUTED)
        .font('Helvetica')
        .fontSize(8)
        .text(branding.tagLine, textX, top + 24, {
          width: textW,
          lineBreak: false,
          ellipsis: true,
        });
    }

    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(13)
      .text(docTitle.toUpperCase(), MARGIN + contentW - 170, top + 6, {
        width: 170,
        align: 'right',
        lineBreak: false,
      });
    doc
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(8)
      .text(sub, MARGIN + contentW - 170, top + 26, {
        width: 170,
        align: 'right',
        lineBreak: false,
        ellipsis: true,
      });

    const lineY = top + logoSize + 8;
    doc
      .moveTo(MARGIN, lineY)
      .lineTo(PAGE_W - MARGIN, lineY)
      .lineWidth(2.2)
      .strokeColor(NAVY)
      .stroke();

    this.resetPageCursor(doc);
    return lineY + 14;
  }

  private drawSection(
    doc: PDFKit.PDFDocument,
    y: number,
    title: string,
    fields: Array<[string, string]>,
  ): number {
    const contentW = PAGE_W - MARGIN * 2;
    y = this.drawSectionTitle(doc, y, title, contentW);

    const colW = (contentW - 16) / 2;
    fields.forEach(([label, value], i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const fx = MARGIN + col * (colW + 16);
      const fy = y + row * 32;
      this.drawField(doc, fx, fy, colW, label, value);
    });

    const rows = Math.ceil(fields.length / 2);
    this.resetPageCursor(doc);
    return y + rows * 32 + 10;
  }

  private drawSectionTitle(
    doc: PDFKit.PDFDocument,
    y: number,
    title: string,
    contentW: number,
  ): number {
    doc.rect(MARGIN, y, contentW, 22).fill('#f1f5f9');
    doc.rect(MARGIN, y, 3, 22).fill(GREEN);
    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(9)
      .text(title.toUpperCase(), MARGIN + 10, y + 7, {
        width: contentW - 14,
        lineBreak: false,
      });
    this.resetPageCursor(doc);
    return y + 30;
  }

  private drawField(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    w: number,
    label: string,
    value: string,
  ) {
    doc
      .fillColor(LABEL)
      .font('Helvetica-Bold')
      .fontSize(7.5)
      .text(label.toUpperCase(), x, y, {
        width: w,
        lineBreak: false,
        ellipsis: true,
      });
    doc
      .fillColor(VALUE)
      .font('Helvetica-Bold')
      .fontSize(10)
      .text(value, x, y + 11, {
        width: w,
        lineBreak: false,
        ellipsis: true,
      });
    doc
      .moveTo(x, y + 26)
      .lineTo(x + w - 4, y + 26)
      .lineWidth(0.6)
      .strokeColor('#eef2f7')
      .stroke();
  }

  private drawDriversSection(
    doc: PDFKit.PDFDocument,
    trip: Trip,
    y: number,
  ): number {
    const contentW = PAGE_W - MARGIN * 2;
    y = this.drawSectionTitle(doc, y, 'Drivers', contentW);

    const drivers = this.driverEntries(trip);
    if (drivers.length === 0) {
      doc
        .fillColor(LABEL)
        .font('Helvetica')
        .fontSize(10)
        .text('No drivers assigned.', MARGIN, y, {
          width: contentW,
          lineBreak: false,
        });
      this.resetPageCursor(doc);
      return y + 22;
    }

    for (const d of drivers) {
      const cardH = 36;
      doc
        .roundedRect(MARGIN, y, contentW, cardH, 6)
        .fillAndStroke('#f8fafc', BORDER);

      const nameLine = d.typeLabel ? `${d.name}  ${d.typeLabel}` : d.name;
      doc
        .fillColor(NAVY)
        .font('Helvetica-Bold')
        .fontSize(10)
        .text(nameLine, MARGIN + 10, y + 12, {
          width: contentW * 0.38,
          lineBreak: false,
          ellipsis: true,
        });

      this.drawMiniField(
        doc,
        MARGIN + contentW * 0.4,
        y + 6,
        contentW * 0.28,
        'Phone',
        this.dash(d.phone),
      );
      this.drawMiniField(
        doc,
        MARGIN + contentW * 0.7,
        y + 6,
        contentW * 0.28,
        'CNIC No',
        this.dash(d.cnicNo),
      );

      y += cardH + 6;
    }

    this.resetPageCursor(doc);
    return y + 8;
  }

  private drawMiniField(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    w: number,
    label: string,
    value: string,
  ) {
    doc
      .fillColor(LABEL)
      .font('Helvetica-Bold')
      .fontSize(7)
      .text(label.toUpperCase(), x, y, {
        width: w,
        lineBreak: false,
      });
    doc
      .fillColor(VALUE)
      .font('Helvetica-Bold')
      .fontSize(9)
      .text(value, x, y + 11, {
        width: w,
        lineBreak: false,
        ellipsis: true,
      });
  }

  private drawLoadsSection(
    doc: PDFKit.PDFDocument,
    title: string,
    loads: TripLoad[],
    y: number,
  ): number {
    const contentW = PAGE_W - MARGIN * 2;
    y = this.drawSectionTitle(doc, y, title, contentW);

    if (loads.length === 0) {
      y = this.drawLoadCard(doc, null, y, contentW);
      return y + 6;
    }

    for (const load of loads) {
      if (y + 110 > CONTENT_BOTTOM) {
        // Rare overflow on page 1 — keep drawing; PDFKit won't auto-page with margin 0
        // unless text overflows. Clamp by skipping extra if needed.
        break;
      }
      y = this.drawLoadCard(doc, load, y, contentW);
    }
    return y + 6;
  }

  private drawLoadCard(
    doc: PDFKit.PDFDocument,
    load: TripLoad | null,
    y: number,
    contentW: number,
  ): number {
    const fields: Array<[string, string]> = [
      ['Client', load?.client?.companyName ? this.dash(load.client.companyName) : '—'],
      ['Bilty', load?.bilty?.code ? this.dash(load.bilty.refNumber) : '—'],
      ['Loading Date', load ? this.fmtDate(load.loadingDate) : '—'],
      ['DC No.', load ? this.dash(load.deliveryChallanNumber) : '—'],
      ['Net Weight', load ? this.dash(load.netWeight) : '—'],
      [
        'No of Cartons.',
        load?.cartonCount != null ? String(load.cartonCount) : '—',
      ],
      ['To Details', load ? this.dash(load.toDetails) : '—'],
      ['Address', load ? this.dash(load.address) : '—'],
    ];

    const rows = Math.ceil(fields.length / 2);
    const productH = 28;
    const h = 12 + rows * 28 + productH;

    doc
      .roundedRect(MARGIN, y, contentW, h, 6)
      .strokeColor(BORDER)
      .lineWidth(1)
      .stroke();

    const colW = (contentW - 28) / 2;
    fields.forEach(([label, value], i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const fx = MARGIN + 10 + col * (colW + 8);
      const fy = y + 8 + row * 28;
      this.drawField(doc, fx, fy, colW, label, value);
    });

    const productY = y + 8 + rows * 28;
    this.drawField(
      doc,
      MARGIN + 10,
      productY,
      contentW - 20,
      'Product',
      load?.productDescription ? this.dash(load.productDescription) : '—',
    );

    this.resetPageCursor(doc);
    return y + h + 8;
  }

  private drawExpenseTable(
    doc: PDFKit.PDFDocument,
    y: number,
    title: string,
    rows: ExpenseRow[],
    headers: string[],
    emptyLabel: string,
    ensureSpace: (needed: number) => number,
  ): number {
    const contentW = PAGE_W - MARGIN * 2;
    y = ensureSpace(50);
    y = this.drawSectionTitle(doc, y, title, contentW);

    if (rows.length === 0) {
      doc
        .fillColor(LABEL)
        .font('Helvetica')
        .fontSize(10)
        .text(emptyLabel, MARGIN, y, { width: contentW, lineBreak: false });
      this.resetPageCursor(doc);
      return y + 20;
    }

    const colWs = this.expenseColWidths(contentW);
    y = this.drawTableHeader(doc, y, headers, colWs);

    rows.forEach((row, i) => {
      y = ensureSpace(22);
      const cells = [
        String(i + 1),
        this.fmtDate(row.expenseDate),
        this.dash(row.accountOrVendor),
        this.dash(row.description),
        this.expenseStatusLabel(row.status),
        this.money(row.amount),
      ];
      y = this.drawTableRow(doc, y, cells, colWs, i % 2 === 1);
    });

    const total = this.sumAmounts(rows);
    y = ensureSpace(22);
    y = this.drawTableFooter(
      doc,
      y,
      'Subtotal (excl. cancelled)',
      this.money(total),
      contentW,
    );

    this.resetPageCursor(doc);
    return y + 12;
  }

  private expenseColWidths(contentW: number): number[] {
    return [
      contentW * 0.06,
      contentW * 0.14,
      contentW * 0.22,
      contentW * 0.28,
      contentW * 0.12,
      contentW * 0.18,
    ];
  }

  private drawTableHeader(
    doc: PDFKit.PDFDocument,
    y: number,
    headers: string[],
    colWs: number[],
  ): number {
    const h = 20;
    doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, h).fill('#f8fafc');
    let x = MARGIN;
    headers.forEach((hLabel, i) => {
      const align = i === headers.length - 1 ? 'right' : 'left';
      doc
        .fillColor('#64748b')
        .font('Helvetica-Bold')
        .fontSize(7.5)
        .text(hLabel.toUpperCase(), x + 4, y + 6, {
          width: colWs[i] - 8,
          align,
          lineBreak: false,
          ellipsis: true,
        });
      x += colWs[i];
    });
    doc
      .moveTo(MARGIN, y + h)
      .lineTo(PAGE_W - MARGIN, y + h)
      .strokeColor(BORDER)
      .lineWidth(0.8)
      .stroke();
    this.resetPageCursor(doc);
    return y + h;
  }

  private drawTableRow(
    doc: PDFKit.PDFDocument,
    y: number,
    cells: string[],
    colWs: number[],
    striped: boolean,
  ): number {
    const h = 20;
    if (striped) {
      doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, h).fill('#fcfcfd');
    }
    let x = MARGIN;
    cells.forEach((cell, i) => {
      const align = i === cells.length - 1 ? 'right' : 'left';
      doc
        .fillColor(VALUE)
        .font('Helvetica')
        .fontSize(8)
        .text(cell, x + 4, y + 5, {
          width: colWs[i] - 8,
          align,
          lineBreak: false,
          ellipsis: true,
        });
      x += colWs[i];
    });
    doc
      .moveTo(MARGIN, y + h)
      .lineTo(PAGE_W - MARGIN, y + h)
      .strokeColor('#eef2f7')
      .lineWidth(0.5)
      .stroke();
    this.resetPageCursor(doc);
    return y + h;
  }

  private drawTableFooter(
    doc: PDFKit.PDFDocument,
    y: number,
    label: string,
    amount: string,
    contentW: number,
  ): number {
    const h = 22;
    doc.rect(MARGIN, y, contentW, h).fill('#f1f5f9');
    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .text(label, MARGIN + 8, y + 7, {
        width: contentW - 100,
        align: 'right',
        lineBreak: false,
      });
    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(9)
      .text(amount, MARGIN + contentW - 90, y + 6, {
        width: 82,
        align: 'right',
        lineBreak: false,
      });
    this.resetPageCursor(doc);
    return y + h;
  }

  private drawGrandTotal(
    doc: PDFKit.PDFDocument,
    y: number,
    grand: number,
  ): number {
    const contentW = PAGE_W - MARGIN * 2;
    const h = 28;
    doc
      .roundedRect(MARGIN, y, contentW, h, 6)
      .fillAndStroke('#f1f5f9', BORDER);
    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(10)
      .text('Grand Total (excl. cancelled)', MARGIN + 12, y + 9, {
        width: contentW - 120,
        align: 'right',
        lineBreak: false,
      });
    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(11)
      .text(this.money(grand), MARGIN + contentW - 100, y + 8, {
        width: 88,
        align: 'right',
        lineBreak: false,
      });
    this.resetPageCursor(doc);
    return y + h + 8;
  }

  private drawPageFooter(
    doc: PDFKit.PDFDocument,
    branding: PrintBranding,
    left: string,
    pageLabel: string,
  ) {
    const y = FOOTER_Y;
    doc
      .moveTo(MARGIN, y - 8)
      .lineTo(PAGE_W - MARGIN, y - 8)
      .strokeColor(BORDER)
      .lineWidth(1)
      .stroke();

    const contentW = PAGE_W - MARGIN * 2;
    doc
      .fillColor(LABEL)
      .font('Helvetica')
      .fontSize(8)
      .text(left, MARGIN, y, {
        width: contentW / 2,
        lineBreak: false,
        ellipsis: true,
      });
    doc
      .fillColor(LABEL)
      .font('Helvetica')
      .fontSize(8)
      .text(pageLabel, MARGIN + contentW / 2, y, {
        width: contentW / 2,
        align: 'right',
        lineBreak: false,
      });

    if (branding.footerLine) {
      doc
        .fillColor(LABEL)
        .font('Helvetica')
        .fontSize(7)
        .text(branding.footerLine, MARGIN, y + 12, {
          width: contentW,
          lineBreak: false,
          ellipsis: true,
        });
    }
    this.resetPageCursor(doc);
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

  private driverEntries(trip: Trip): Array<{
    name: string;
    phone?: string | null;
    cnicNo?: string | null;
    typeLabel?: string;
  }> {
    return (trip.drivers ?? [])
      .map((row) => {
        const driver = row.driver;
        if (!driver) return null;
        const name =
          driver.user?.name?.trim() ||
          driver.phone?.trim() ||
          driver.id;
        const type = driver.driverType as DriverType | undefined;
        return {
          name,
          phone: driver.phone || driver.user?.phone || null,
          cnicNo: driver.cnicNo || null,
          typeLabel: type
            ? (DRIVER_TYPE_LABELS[type] ?? String(type).replace(/_/g, ' '))
            : undefined,
        };
      })
      .filter((e): e is NonNullable<typeof e> => e != null);
  }

  private vehicleLabel(trip: Trip): string {
    const v = trip.vehicle;
    if (!v?.regNo) return '—';
    const parts = [v.regNo];
    if (v.vehicleType?.name) parts.push(v.vehicleType.name);
    if (v.vehicleSize?.name) parts.push(v.vehicleSize.name);
    if (v.vehicleCapacity?.name) parts.push(v.vehicleCapacity.name);
    return parts.filter(Boolean).join(' · ');
  }

  private vendorName(vendor?: {
    vendorName?: string | null;
    ownerName?: string | null;
  } | null): string {
    if (!vendor) return '—';
    return (
      vendor.vendorName?.trim() ||
      vendor.ownerName?.trim() ||
      '—'
    );
  }

  private expenseStatusLabel(status: TripExpenseStatus | string): string {
    return (
      EXPENSE_STATUS_LABELS[status as TripExpenseStatus] ?? String(status)
    );
  }

  private sumAmounts(
    rows: Array<{ amount: string; status?: TripExpenseStatus | string }>,
  ): number {
    return rows.reduce((acc, r) => {
      if (r.status === TripExpenseStatus.CANCELLED || r.status === 'CANCELLED') {
        return acc;
      }
      const n = Number(r.amount);
      return acc + (Number.isNaN(n) ? 0 : n);
    }, 0);
  }

  private money(v?: string | number | null): string {
    if (v == null || v === '') return '—';
    const n = typeof v === 'number' ? v : Number(v);
    if (Number.isNaN(n)) return String(v);
    return n.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
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

    const footerParts = [name, addressLine].filter(Boolean);
    if (phone) footerParts.push(`Phone: ${phone}`);
    if (ptcl) footerParts.push(`PTCL: ${ptcl}`);
    if (email) footerParts.push(`Email: ${email}`);

    return {
      logoUrl,
      name,
      tagLine,
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

  private toDate(value?: string | Date | null): Date | null {
    if (value == null || value === '') return null;
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }
    const raw = String(value);
    const d = new Date(
      raw.includes('T') ? raw : `${raw.slice(0, 10)}T00:00:00`,
    );
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
