import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { Repository } from 'typeorm';
import {
  ExportFormat,
  ExportMode,
} from '../../../database/entities/export-job.entity';
import {
  Driver,
  DriverDocument,
  DriverLicenseType,
  DriverType,
  EmployeerType,
} from '../../../database/entities/driver.entity';
import {
  BusinessInfoSettingValue,
  SystemSetting,
  SystemSettingKey,
} from '../../../database/entities/system-setting.entity';
import { User } from '../../../database/entities/user.entity';
import {
  drawLogoFallback,
  fetchLogoBuffer,
} from '../../pdf/maintenance-pdf.util';
import { GeneratedExportFile } from '../export.types';

const NAVY = '#1A3C70';
const GREEN = '#A9C43F';
const MUTED = '#6b7280';
const VALUE = '#111827';
const BORDER = '#e5e7eb';
const HEADER_BG = '#f3f4f6';
const ZEBRA = '#f9fafb';
const PAGE_W = 841.89;
const PAGE_H = 595.28;
const MARGIN = 28;
const FOOTER_H = 52;

const DEFAULT_BUSINESS_INFO: BusinessInfoSettingValue = {
  logoUrl:
    'https://zsparktech-bucket.s3.eu-north-1.amazonaws.com/assets/logo.png',
  ntn: null,
  companyName: 'ZS Logistics',
  tagLine: 'Moving Business Forward',
  govtRegNo: null,
  primaryAddress: 'Head Office, Karachi, Pakistan',
  secondaryAddress: null,
  ptcl: null,
  phone: '+92 300 1234567',
  whatsapp: null,
  email: 'info@zslogistics.com',
};

type ExportBranding = {
  logoUrl: string;
  name: string;
  tagLine: string;
  addressLine: string;
  phone: string;
  ptcl: string;
  email: string;
  whatsapp: string;
};

const DRIVER_TYPE_LABELS: Record<DriverType, string> = {
  [DriverType.HELPER]: 'Helper',
  [DriverType.FIRST_DRIVER]: '1st Driver',
  [DriverType.SECOND_DRIVER]: '2nd Driver',
};

const EMPLOYEER_LABELS: Record<EmployeerType, string> = {
  [EmployeerType.OWN]: 'Own',
  [EmployeerType.OTHER]: 'Other',
};

const LIST_HEADERS = [
  'S No.',
  'Employee ID',
  'Name',
  'Email',
  'Phone',
  'Alt Phone',
  'Father Name',
  'CNIC',
  'Driver Type',
  'Employeer',
  'License No',
  'License Type',
  'License Verified',
  'License Validity',
  'Status',
  'Joining Date',
  'Emergency Contact',
  'Current Address',
  'Permanent Address',
  'Guarantor Name',
  'Guarantor Phone',
  'Guarantor CNIC',
  'Guarantor Address',
] as const;

export type ExportDriverRow = Driver & {
  user?: User | null;
  documents?: DriverDocument[];
  assignedDrivers?: Array<{
    id: string;
    status: string;
    driverType?: string;
    vehicle?: { regNo?: string | null; status?: string | null } | null;
  }>;
};

@Injectable()
export class DriverExportGenerator {
  private readonly logger = new Logger(DriverExportGenerator.name);

  constructor(
    @InjectRepository(SystemSetting)
    private readonly settingRepo: Repository<SystemSetting>,
  ) {}

  async generate(
    drivers: ExportDriverRow[],
    format: ExportFormat,
    mode: ExportMode,
  ): Promise<GeneratedExportFile> {
    const stamp = new Date().toISOString().slice(0, 10);
    if (format === ExportFormat.XLSX) {
      const buffer = await this.generateXlsx(drivers, mode);
      return {
        buffer,
        fileName: `drivers-export-${mode.toLowerCase()}-${stamp}.xlsx`,
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
    }

    const buffer = await this.generatePdf(drivers, mode);
    return {
      buffer,
      fileName: `drivers-export-${mode.toLowerCase()}-${stamp}.pdf`,
      contentType: 'application/pdf',
    };
  }

  private async generateXlsx(
    drivers: ExportDriverRow[],
    mode: ExportMode,
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'ZS Logistics';
    workbook.created = new Date();

    if (mode === ExportMode.LIST) {
      const sheet = workbook.addWorksheet('Drivers');
      sheet.addRow([...LIST_HEADERS]);
      sheet.getRow(1).font = { bold: true };
      drivers.forEach((d, i) => sheet.addRow(this.listRowValues(d, i)));
      this.autoWidth(sheet);
    } else if (mode === ExportMode.DETAIL_PAGES) {
      for (const driver of drivers) {
        const sheet = workbook.addWorksheet(
          this.safeSheetName(driver.user?.code || driver.user?.name || driver.id, workbook),
        );
        this.writeDetailSheet(sheet, driver);
        this.autoWidth(sheet);
      }
    } else {
      for (const driver of drivers) {
        const sheet = workbook.addWorksheet(
          this.safeSheetName(driver.user?.code || driver.user?.name || driver.id, workbook),
        );
        this.writeDocumentsSheet(sheet, driver);
        this.autoWidth(sheet);
      }
    }

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  private async generatePdf(
    drivers: ExportDriverRow[],
    mode: ExportMode,
  ): Promise<Buffer> {
    const branding = await this.resolveBranding();
    const logoBuf =
      mode === ExportMode.LIST
        ? await fetchLogoBuffer(branding.logoUrl, this.logger)
        : null;

    return new Promise<Buffer>((resolve, reject) => {
      const landscape = mode === ExportMode.LIST;
      const doc = new PDFDocument({
        size: 'A4',
        layout: landscape ? 'landscape' : 'portrait',
        margin: landscape ? MARGIN : 36,
        autoFirstPage: false,
        bufferPages: landscape,
        info: {
          Title: `Drivers Export — ${mode}`,
          Author: branding.name,
        },
      });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      try {
        if (mode === ExportMode.LIST) {
          this.drawListPdf(doc, drivers, branding, logoBuf);
        } else if (mode === ExportMode.DETAIL_PAGES) {
          drivers.forEach((d, i) => this.drawDetailPdfPage(doc, d, i));
        } else {
          drivers.forEach((d, i) => this.drawDocumentsPdfPage(doc, d, i));
        }
        doc.end();
      } catch (err) {
        this.logger.error(
          'Driver PDF generation failed',
          err instanceof Error ? err.stack : String(err),
        );
        reject(err);
      }
    });
  }

  private listRowValues(
    driver: ExportDriverRow,
    index: number,
  ): (string | number)[] {
    return [
      index + 1,
      driver.user?.code ?? '',
      driver.user?.name ?? '',
      driver.user?.email ?? '',
      driver.phone ?? driver.user?.phone ?? '',
      driver.altPhone ?? '',
      driver.fatherName ?? '',
      driver.cnicNo ?? '',
      DRIVER_TYPE_LABELS[driver.driverType] ?? driver.driverType,
      EMPLOYEER_LABELS[driver.employeerType ?? EmployeerType.OWN] ??
        driver.employeerType ??
        '',
      driver.licenseNo ?? '',
      driver.licenseType ?? '',
      driver.licenseOnlineVerification ? 'Yes' : 'No',
      this.fmtDate(driver.licenseValidity),
      driver.status,
      this.fmtDate(driver.joiningDate),
      driver.emergencyContactPhone ?? '',
      driver.currentAddress ?? '',
      driver.permenantAddress ?? '',
      driver.gurantorName ?? '',
      driver.gurantorPhone ?? '',
      driver.gurantorCNIC ?? '',
      driver.gurantorAddress ?? '',
    ];
  }

  private writeDetailSheet(sheet: ExcelJS.Worksheet, driver: ExportDriverRow) {
    const pairs: [string, string][] = [
      ['Employee ID', driver.user?.code ?? ''],
      ['Name', driver.user?.name ?? ''],
      ['Email', driver.user?.email ?? ''],
      ['Phone', driver.phone ?? driver.user?.phone ?? ''],
      ['Alt Phone', driver.altPhone ?? ''],
      ['Father Name', driver.fatherName ?? ''],
      ['CNIC', driver.cnicNo ?? ''],
      [
        'Driver Type',
        DRIVER_TYPE_LABELS[driver.driverType] ?? driver.driverType,
      ],
      [
        'Employeer',
        EMPLOYEER_LABELS[driver.employeerType ?? EmployeerType.OWN] ?? '',
      ],
      ['Status', driver.status],
      ['Joining Date', this.fmtDate(driver.joiningDate)],
      ['License No', driver.licenseNo ?? ''],
      ['License Type', driver.licenseType ?? ''],
      ['License Verified', driver.licenseOnlineVerification ? 'Yes' : 'No'],
      ['License Validity', this.fmtDate(driver.licenseValidity)],
      ['Emergency Contact', driver.emergencyContactPhone ?? ''],
      ['Current Address', driver.currentAddress ?? ''],
      ['Permanent Address', driver.permenantAddress ?? ''],
      ['Guarantor Name', driver.gurantorName ?? ''],
      ['Guarantor Phone', driver.gurantorPhone ?? ''],
      ['Guarantor CNIC', driver.gurantorCNIC ?? ''],
      ['Guarantor Address', driver.gurantorAddress ?? ''],
    ];

    sheet.addRow(['Field', 'Value']).font = { bold: true };
    for (const [k, v] of pairs) sheet.addRow([k, v]);

    const vehicles = driver.assignedDrivers ?? [];
    sheet.addRow([]);
    sheet.addRow(['Assigned Vehicles']).font = { bold: true };
    sheet.addRow(['Reg No', 'Role', 'Status']).font = { bold: true };
    if (vehicles.length === 0) {
      sheet.addRow(['—', '—', 'None']);
    } else {
      for (const ad of vehicles) {
        sheet.addRow([
          ad.vehicle?.regNo ?? '—',
          ad.driverType ?? '',
          ad.status ?? '',
        ]);
      }
    }
  }

  private writeDocumentsSheet(
    sheet: ExcelJS.Worksheet,
    driver: ExportDriverRow,
  ) {
    sheet.addRow(['Driver']).font = { bold: true };
    sheet.addRow(['Name', driver.user?.name ?? '']);
    sheet.addRow(['Employee ID', driver.user?.code ?? '']);
    sheet.addRow(['Phone', driver.phone ?? '']);
    sheet.addRow([
      'Type',
      DRIVER_TYPE_LABELS[driver.driverType] ?? driver.driverType,
    ]);
    sheet.addRow(['Status', driver.status]);
    sheet.addRow(['CNIC', driver.cnicNo ?? '']);
    sheet.addRow([
      'License',
      `${driver.licenseNo ?? '—'} / ${driver.licenseType ?? '—'}`,
    ]);
    sheet.addRow([]);
    sheet.addRow(['Documents']).font = { bold: true };
    sheet
      .addRow(['Name', 'Doc Type', 'Validity', 'Uploaded At', 'File Present'])
      .font = { bold: true };

    const docs = driver.documents ?? [];
    if (docs.length === 0) {
      sheet.addRow(['—', '—', '—', '—', 'N']);
      return;
    }
    for (const doc of docs) {
      sheet.addRow([
        doc.name ?? '',
        doc.docType,
        this.fmtDate(doc.validity),
        this.fmtDate(doc.createdAt),
        doc.file ? 'Y' : 'N',
      ]);
    }
  }

  private drawListPdf(
    doc: PDFKit.PDFDocument,
    drivers: ExportDriverRow[],
    branding: ExportBranding,
    logoBuf: Buffer | null,
  ) {
    const contentW = PAGE_W - MARGIN * 2;
    const headers = [
      'S No.',
      'Employee ID',
      'Name',
      'Father Name',
      'CNIC',
      'Phone',
      'License',
      'Joining Date',
    ];
    // Landscape content ~786pt — fits 8 cols with stacked license
    const colW = [40, 82, 128, 118, 112, 90, 126, 90];
    const colPad = 6;
    const headerRowH = 22;
    const rowH = 30;
    const generatedAt = new Date();
    const reportDateLabel = this.fmtReportDateTime(generatedAt);
    const tableBottom = PAGE_H - MARGIN - FOOTER_H;

    const startTable = (): number => {
      doc.addPage({ size: 'A4', layout: 'landscape', margin: MARGIN });
      let y = this.drawListBrandHeader(
        doc,
        branding,
        logoBuf,
        reportDateLabel,
      );
      y = this.drawListSummaryBar(doc, y, contentW, drivers.length);
      return this.drawListTableHeader(doc, y, headers, colW, colPad, headerRowH);
    };

    let y = startTable();

    drivers.forEach((d, idx) => {
      if (y + rowH > tableBottom) {
        y = startTable();
      }

      const zebra = idx % 2 === 1;
      if (zebra) {
        doc.rect(MARGIN, y, contentW, rowH).fill(ZEBRA);
      }

      const licenseNo = (d.licenseNo ?? '').trim() || '—';
      const licenseType = d.licenseType
        ? String(d.licenseType as DriverLicenseType)
        : '—';
      const cells: Array<{ text: string; sub?: string }> = [
        { text: String(idx + 1) },
        { text: d.user?.code ?? '—' },
        { text: d.user?.name ?? '—' },
        { text: d.fatherName ?? '—' },
        { text: d.cnicNo ?? '—' },
        { text: d.phone ?? d.user?.phone ?? '—' },
        { text: licenseNo, sub: licenseType },
        { text: this.fmtDisplayDate(d.joiningDate) },
      ];

      let x = MARGIN;
      cells.forEach((cell, i) => {
        const w = colW[i];
        if (cell.sub) {
          doc
            .fillColor(VALUE)
            .font('Helvetica-Bold')
            .fontSize(8)
            .text(this.clip(cell.text, 22), x + colPad, y + 5, {
              width: w - colPad * 2,
              lineBreak: false,
              ellipsis: true,
            });
          doc
            .fillColor(MUTED)
            .font('Helvetica')
            .fontSize(7)
            .text(this.clip(cell.sub, 18), x + colPad, y + 16, {
              width: w - colPad * 2,
              lineBreak: false,
              ellipsis: true,
            });
        } else {
          doc
            .fillColor(VALUE)
            .font('Helvetica')
            .fontSize(8)
            .text(this.clip(cell.text, 28), x + colPad, y + 10, {
              width: w - colPad * 2,
              lineBreak: false,
              ellipsis: true,
            });
        }
        x += w;
      });

      doc
        .moveTo(MARGIN, y + rowH)
        .lineTo(MARGIN + contentW, y + rowH)
        .strokeColor(BORDER)
        .lineWidth(0.5)
        .stroke();

      y += rowH;
    });

    // Footers on every buffered page
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      this.drawListFooter(
        doc,
        branding,
        reportDateLabel,
        i + 1,
        range.count,
      );
    }
  }

  private drawListBrandHeader(
    doc: PDFKit.PDFDocument,
    branding: ExportBranding,
    logoBuf: Buffer | null,
    reportDateLabel: string,
  ): number {
    const top = MARGIN;
    const logoSize = 44;
    const contentW = PAGE_W - MARGIN * 2;

    if (logoBuf) {
      try {
        doc.image(logoBuf, MARGIN, top, {
          fit: [logoSize, logoSize],
          align: 'center',
          valign: 'center',
        });
      } catch {
        drawLogoFallback(doc, branding.name, MARGIN, top, logoSize);
      }
    } else {
      drawLogoFallback(doc, branding.name, MARGIN, top, logoSize);
    }

    const brandX = MARGIN + logoSize + 10;
    const brandW = 168;
    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(13)
      .text(branding.name.toUpperCase(), brandX, top + 4, {
        width: brandW,
        lineBreak: false,
        ellipsis: true,
      });
    if (branding.tagLine) {
      doc
        .fillColor('#5b8def')
        .font('Helvetica')
        .fontSize(7.5)
        .text(branding.tagLine.toUpperCase(), brandX, top + 22, {
          width: brandW,
          lineBreak: false,
          ellipsis: true,
        });
    }

    // Business info (center)
    const infoX = brandX + brandW + 12;
    const infoW = 230;
    const infoLines = [
      branding.addressLine,
      branding.phone ? `Phone: ${branding.phone}` : '',
      branding.email ? `Email: ${branding.email}` : '',
    ].filter(Boolean);

    let infoY = top + 2;
    infoLines.forEach((line) => {
      // green accent dot
      doc.circle(infoX + 3, infoY + 4, 2.5).fill(GREEN);
      doc
        .fillColor(MUTED)
        .font('Helvetica')
        .fontSize(7.5)
        .text(line, infoX + 10, infoY, {
          width: infoW - 10,
          lineBreak: false,
          ellipsis: true,
        });
      infoY += 12;
    });

    // Report title + date (right)
    const rightW = 175;
    const rightX = MARGIN + contentW - rightW;
    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(16)
      .text('Drivers Export', rightX, top, {
        width: rightW,
        align: 'right',
        lineBreak: false,
      });
    doc
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(10)
      .text('List', rightX, top + 18, {
        width: rightW,
        align: 'right',
        lineBreak: false,
      });

    const dateBoxH = 28;
    const dateBoxY = top + 34;
    doc
      .roundedRect(rightX, dateBoxY, rightW, dateBoxH, 4)
      .fillAndStroke('#f8fafc', BORDER);
    doc.circle(rightX + 12, dateBoxY + dateBoxH / 2, 5).fill(GREEN);
    doc
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(6.5)
      .text('Report Date', rightX + 22, dateBoxY + 4, {
        width: rightW - 28,
        lineBreak: false,
      });
    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(8)
      .text(reportDateLabel, rightX + 22, dateBoxY + 14, {
        width: rightW - 28,
        lineBreak: false,
        ellipsis: true,
      });

    const lineY = Math.max(top + logoSize, dateBoxY + dateBoxH) + 10;
    doc
      .moveTo(MARGIN, lineY)
      .lineTo(MARGIN + contentW, lineY)
      .lineWidth(1.5)
      .strokeColor(NAVY)
      .stroke();
    doc
      .moveTo(MARGIN, lineY)
      .lineTo(MARGIN + 80, lineY)
      .lineWidth(3)
      .strokeColor(GREEN)
      .stroke();

    return lineY + 12;
  }

  private drawListSummaryBar(
    doc: PDFKit.PDFDocument,
    y: number,
    contentW: number,
    total: number,
  ): number {
    const h = 36;
    doc.roundedRect(MARGIN, y, contentW, h, 6).fill('#f8fafc');

    // green icon square with simple list mark
    const iconX = MARGIN + 8;
    const iconY = y + 6;
    doc.roundedRect(iconX, iconY, 24, 24, 4).fill(GREEN);
    doc.fillColor('#ffffff');
    for (let i = 0; i < 3; i++) {
      doc.rect(iconX + 6, iconY + 7 + i * 5, 12, 2).fill('#ffffff');
    }

    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(11)
      .text('Drivers Export — List', MARGIN + 40, y + 7, {
        width: 360,
        lineBreak: false,
      });
    doc
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(7.5)
      .text('List of all registered drivers in the system.', MARGIN + 40, y + 21, {
        width: 360,
        lineBreak: false,
      });

    // Total drivers badge
    const badgeW = 110;
    const badgeX = MARGIN + contentW - badgeW - 8;
    doc
      .roundedRect(badgeX, y + 5, badgeW, 26, 5)
      .fillAndStroke('#ffffff', BORDER);
    doc
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(6.5)
      .text('Total Drivers', badgeX + 10, y + 8, {
        width: badgeW - 40,
        lineBreak: false,
      });
    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(12)
      .text(String(total), badgeX + 10, y + 17, {
        width: badgeW - 40,
        lineBreak: false,
      });
    doc.circle(badgeX + badgeW - 16, y + 18, 7).fill(GREEN);

    return y + h + 10;
  }

  private drawListTableHeader(
    doc: PDFKit.PDFDocument,
    y: number,
    headers: string[],
    colW: number[],
    colPad: number,
    headerRowH: number,
  ): number {
    const contentW = PAGE_W - MARGIN * 2;
    doc.rect(MARGIN, y, contentW, headerRowH).fill(HEADER_BG);
    doc.rect(MARGIN, y, contentW, 2).fill(GREEN);

    let x = MARGIN;
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(8);
    headers.forEach((h, i) => {
      doc.text(h, x + colPad, y + 7, {
        width: colW[i] - colPad * 2,
        lineBreak: false,
      });
      x += colW[i];
    });

    return y + headerRowH;
  }

  private drawListFooter(
    doc: PDFKit.PDFDocument,
    branding: ExportBranding,
    reportDateLabel: string,
    page: number,
    totalPages: number,
  ) {
    const contentW = PAGE_W - MARGIN * 2;
    const footerTop = PAGE_H - MARGIN - FOOTER_H + 4;

    doc
      .moveTo(MARGIN, footerTop)
      .lineTo(MARGIN + contentW, footerTop)
      .strokeColor(BORDER)
      .lineWidth(0.75)
      .stroke();

    const metaY = footerTop + 6;
    const col = contentW / 3;
    doc
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(7)
      .text(`Prepared By: ${branding.name}`, MARGIN, metaY, {
        width: col - 8,
        lineBreak: false,
        ellipsis: true,
      });
    doc.text(`Generated On: ${reportDateLabel}`, MARGIN + col, metaY, {
      width: col - 8,
      align: 'center',
      lineBreak: false,
    });
    doc.text(`Page ${page} of ${totalPages}`, MARGIN + col * 2, metaY, {
      width: col,
      align: 'right',
      lineBreak: false,
    });

    // Business info — row 1: primary address, row 2: contact (pipe-separated)
    const bizY = metaY + 12;
    if (branding.addressLine) {
      doc
        .fillColor(MUTED)
        .font('Helvetica')
        .fontSize(6.5)
        .text(branding.addressLine, MARGIN, bizY, {
          width: contentW,
          align: 'center',
          lineBreak: false,
          ellipsis: true,
        });
    }

    const contactParts = [
      branding.ptcl ? `PTCL: ${branding.ptcl}` : '',
      branding.phone ? `Phone: ${branding.phone}` : '',
      branding.whatsapp ? `WhatsApp: ${branding.whatsapp}` : '',
      branding.email ? `Email: ${branding.email}` : '',
    ].filter(Boolean);
    if (contactParts.length > 0) {
      doc
        .fillColor(MUTED)
        .font('Helvetica')
        .fontSize(6.5)
        .text(contactParts.join(' | '), MARGIN, bizY + 10, {
          width: contentW,
          align: 'center',
          lineBreak: false,
          ellipsis: true,
        });
    }

    // Dual-tone bottom bar
    const barY = PAGE_H - 10;
    const greenW = 120;
    doc.rect(0, barY, greenW, 10).fill(GREEN);
    doc.rect(greenW, barY, PAGE_W - greenW, 10).fill(NAVY);
  }

  private async resolveBranding(): Promise<ExportBranding> {
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
      tagLine:
        (value.tagLine ?? '').trim() ||
        DEFAULT_BUSINESS_INFO.tagLine ||
        'Moving Business Forward',
      addressLine:
        (value.primaryAddress ?? '').trim() ||
        DEFAULT_BUSINESS_INFO.primaryAddress ||
        '',
      phone: (value.phone ?? '').trim() || DEFAULT_BUSINESS_INFO.phone || '',
      ptcl: (value.ptcl ?? '').trim() || '',
      email: (value.email ?? '').trim() || DEFAULT_BUSINESS_INFO.email || '',
      whatsapp: (value.whatsapp ?? '').trim() || '',
    };
  }

  private fmtReportDateTime(d: Date): string {
    try {
      return d.toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return d.toISOString().slice(0, 16).replace('T', ' ');
    }
  }

  private fmtDisplayDate(value?: Date | string | null): string {
    if (!value) return '—';
    try {
      const d =
        value instanceof Date
          ? value
          : new Date(
              String(value).includes('T')
                ? String(value)
                : `${String(value).slice(0, 10)}T00:00:00`,
            );
      if (Number.isNaN(d.getTime())) return this.fmtDate(value) || '—';
      return d.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return this.fmtDate(value) || '—';
    }
  }

  private drawDetailPdfPage(
    doc: PDFKit.PDFDocument,
    driver: ExportDriverRow,
    index: number,
  ) {
    doc.addPage({ size: 'A4', layout: 'portrait', margin: 40 });
    const name = driver.user?.name ?? 'Driver';
    doc
      .fillColor('#1A3C70')
      .fontSize(14)
      .font('Helvetica-Bold')
      .text(`Driver Detail — ${name}`, { continued: false });
    doc
      .fontSize(9)
      .fillColor('#6b7280')
      .font('Helvetica')
      .text(`#${index + 1} · ${driver.user?.code ?? driver.id}`);

    let y = 90;
    const pairs: [string, string][] = [
      ['Employee ID', driver.user?.code ?? '—'],
      ['Name', name],
      ['Email', driver.user?.email ?? '—'],
      ['Phone', driver.phone ?? '—'],
      ['Alt Phone', driver.altPhone ?? '—'],
      ['Father Name', driver.fatherName ?? '—'],
      ['CNIC', driver.cnicNo ?? '—'],
      [
        'Driver Type',
        DRIVER_TYPE_LABELS[driver.driverType] ?? driver.driverType,
      ],
      [
        'Employeer',
        EMPLOYEER_LABELS[driver.employeerType ?? EmployeerType.OWN] ?? '—',
      ],
      ['Status', driver.status],
      ['Joining Date', this.fmtDate(driver.joiningDate) || '—'],
      ['License No', driver.licenseNo ?? '—'],
      [
        'License Type',
        driver.licenseType
          ? String(driver.licenseType as DriverLicenseType)
          : '—',
      ],
      ['License Verified', driver.licenseOnlineVerification ? 'Yes' : 'No'],
      ['License Validity', this.fmtDate(driver.licenseValidity) || '—'],
      ['Emergency Contact', driver.emergencyContactPhone ?? '—'],
      ['Current Address', driver.currentAddress ?? '—'],
      ['Permanent Address', driver.permenantAddress ?? '—'],
      ['Guarantor Name', driver.gurantorName ?? '—'],
      ['Guarantor Phone', driver.gurantorPhone ?? '—'],
      ['Guarantor CNIC', driver.gurantorCNIC ?? '—'],
      ['Guarantor Address', driver.gurantorAddress ?? '—'],
    ];

    for (const [label, value] of pairs) {
      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor('#6b7280')
        .text(label, 40, y, { width: 140 });
      doc
        .font('Helvetica')
        .fillColor('#111827')
        .text(value, 190, y, { width: 360 });
      y += 18;
      if (y > 740) {
        doc.addPage({ size: 'A4', layout: 'portrait', margin: 40 });
        y = 50;
      }
    }

    const vehicles = driver.assignedDrivers ?? [];
    y += 8;
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor('#1A3C70')
      .text('Assigned Vehicles', 40, y);
    y += 18;
    if (vehicles.length === 0) {
      doc.font('Helvetica').fontSize(9).fillColor('#111827').text('None', 40, y);
    } else {
      for (const ad of vehicles) {
        doc
          .font('Helvetica')
          .fontSize(9)
          .fillColor('#111827')
          .text(
            `${ad.vehicle?.regNo ?? '—'} · ${ad.driverType ?? '—'} · ${ad.status}`,
            40,
            y,
          );
        y += 14;
      }
    }
  }

  private drawDocumentsPdfPage(
    doc: PDFKit.PDFDocument,
    driver: ExportDriverRow,
    index: number,
  ) {
    doc.addPage({ size: 'A4', layout: 'portrait', margin: 40 });
    const name = driver.user?.name ?? 'Driver';
    doc
      .fillColor('#1A3C70')
      .fontSize(14)
      .font('Helvetica-Bold')
      .text(`Documents — ${name}`);
    doc
      .fontSize(9)
      .fillColor('#6b7280')
      .font('Helvetica')
      .text(
        `#${index + 1} · ${driver.user?.code ?? driver.id} · ${driver.phone ?? '—'} · ${DRIVER_TYPE_LABELS[driver.driverType] ?? driver.driverType} · ${driver.status}`,
      );
    doc.text(
      `CNIC: ${driver.cnicNo ?? '—'} · License: ${driver.licenseNo ?? '—'} / ${driver.licenseType ?? '—'}`,
    );

    let y = 110;
    const headers = ['Name', 'Type', 'Validity', 'Uploaded', 'File'];
    const colW = [140, 120, 80, 90, 40];
    let x = 40;
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#111827');
    headers.forEach((h, i) => {
      doc.text(h, x, y, { width: colW[i] });
      x += colW[i];
    });
    y += 14;
    doc.moveTo(40, y).lineTo(555, y).strokeColor('#d1d5db').stroke();
    y += 8;

    const docs = driver.documents ?? [];
    doc.font('Helvetica').fontSize(8);
    if (docs.length === 0) {
      doc.fillColor('#6b7280').text('No documents', 40, y);
      return;
    }
    for (const d of docs) {
      if (y > 780) {
        doc.addPage({ size: 'A4', layout: 'portrait', margin: 40 });
        y = 50;
      }
      const vals = [
        d.name ?? '—',
        d.docType,
        this.fmtDate(d.validity) || '—',
        this.fmtDate(d.createdAt) || '—',
        d.file ? 'Y' : 'N',
      ];
      x = 40;
      vals.forEach((v, i) => {
        doc.fillColor('#111827').text(this.clip(v, 32), x, y, {
          width: colW[i],
          height: 14,
          ellipsis: true,
        });
        x += colW[i];
      });
      y += 16;
    }
  }

  private safeSheetName(
    baseLabel: string,
    workbook: ExcelJS.Workbook,
  ): string {
    const base = baseLabel.replace(/[\\/*?:\[\]]/g, '_').slice(0, 28);
    let name = base || 'Sheet';
    let i = 1;
    while (workbook.getWorksheet(name)) {
      name = `${base.slice(0, 25)}_${i++}`;
    }
    return name;
  }

  private autoWidth(sheet: ExcelJS.Worksheet) {
    sheet.columns.forEach((col) => {
      let max = 10;
      col.eachCell?.({ includeEmpty: true }, (cell) => {
        const len = String(cell.value ?? '').length;
        if (len > max) max = Math.min(len, 48);
      });
      col.width = max + 2;
    });
  }

  private fmtDate(value?: Date | string | null): string {
    if (!value) return '';
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value).slice(0, 10);
  }

  private clip(value: string, max: number): string {
    if (value.length <= max) return value;
    return `${value.slice(0, max - 1)}…`;
  }
}
