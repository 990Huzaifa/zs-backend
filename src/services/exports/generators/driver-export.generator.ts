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
const PORTRAIT_W = 595.28;
const PORTRAIT_H = 841.89;
const MARGIN = 28;
const FOOTER_H = 52;

const DOC_TYPE_BADGE_COLORS = [
  { bg: '#dbeafe', fg: '#1e40af' },
  { bg: '#fef3c7', fg: '#92400e' },
  { bg: '#fce7f3', fg: '#9d174d' },
  { bg: '#dcfce7', fg: '#166534' },
  { bg: '#e0e7ff', fg: '#3730a3' },
  { bg: '#ffedd5', fg: '#9a3412' },
] as const;

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
    const logoBuf = await fetchLogoBuffer(branding.logoUrl, this.logger);

    return new Promise<Buffer>((resolve, reject) => {
      const landscape = mode === ExportMode.LIST;
      const doc = new PDFDocument({
        size: 'A4',
        layout: landscape ? 'landscape' : 'portrait',
        margin: MARGIN,
        autoFirstPage: false,
        bufferPages: true,
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
          this.drawDetailPdf(doc, drivers, branding, logoBuf);
        } else {
          this.drawDocumentsPdf(doc, drivers, branding, logoBuf);
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
    const rightW = 175;
    const rightX = MARGIN + contentW - rightW;
    const brandW = Math.max(180, rightX - brandX - 16);
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

    // Report title + date (right)
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
    pageW: number = PAGE_W,
  ): number {
    const contentW = pageW - MARGIN * 2;
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
    this.drawReportFooter(
      doc,
      branding,
      reportDateLabel,
      page,
      totalPages,
      PAGE_W,
      PAGE_H,
    );
  }

  private drawReportFooter(
    doc: PDFKit.PDFDocument,
    branding: ExportBranding,
    reportDateLabel: string,
    page: number,
    totalPages: number,
    pageW: number,
    pageH: number,
  ) {
    const contentW = pageW - MARGIN * 2;
    const footerTop = pageH - MARGIN - FOOTER_H + 4;

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

    const barY = pageH - 10;
    const greenW = 120;
    doc.rect(0, barY, greenW, 10).fill(GREEN);
    doc.rect(greenW, barY, pageW - greenW, 10).fill(NAVY);
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

  private drawDetailPdf(
    doc: PDFKit.PDFDocument,
    drivers: ExportDriverRow[],
    branding: ExportBranding,
    logoBuf: Buffer | null,
  ) {
    const contentW = PORTRAIT_W - MARGIN * 2;
    const reportDateLabel = this.fmtReportDateTime(new Date());

    drivers.forEach((driver, index) => {
      const code = driver.user?.code ?? driver.id;
      const name = driver.user?.name ?? 'Driver';
      const title = `Driver Detail — ${name}`;
      const subtitle = `#${index + 1} · ${code}`;
      const status = String(driver.status ?? '—');
      const typeLabel =
        DRIVER_TYPE_LABELS[driver.driverType] ?? driver.driverType ?? '—';
      const employer =
        EMPLOYEER_LABELS[driver.employeerType ?? EmployeerType.OWN] ?? '—';

      doc.addPage({ size: 'A4', layout: 'portrait', margin: MARGIN });
      let y = this.drawDocsBrandHeader(
        doc,
        branding,
        logoBuf,
        reportDateLabel,
        title,
        subtitle,
      );
      y = this.drawDetailSummaryBar(
        doc,
        y,
        contentW,
        title,
        subtitle,
        status,
        typeLabel,
        employer,
      );
      y = this.drawDriverInfoGrid(doc, y, contentW, driver, name);
      this.drawAssignedVehiclesSection(doc, y, contentW, driver);
    });

    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      this.drawReportFooter(
        doc,
        branding,
        reportDateLabel,
        i + 1,
        range.count,
        PORTRAIT_W,
        PORTRAIT_H,
      );
    }
  }

  private drawDetailSummaryBar(
    doc: PDFKit.PDFDocument,
    y: number,
    contentW: number,
    title: string,
    subtitle: string,
    status: string,
    typeLabel: string,
    employer: string,
  ): number {
    const h = 48;
    doc.roundedRect(MARGIN, y, contentW, h, 8).fill('#f8fafc');

    const iconX = MARGIN + 10;
    const iconY = y + 10;
    doc.roundedRect(iconX, iconY, 28, 28, 6).fill(GREEN);
    doc.circle(iconX + 14, iconY + 11, 5).fill('#ffffff');
    doc.roundedRect(iconX + 7, iconY + 17, 14, 7, 3).fill('#ffffff');

    const pillsW = 268;
    const textW = contentW - pillsW - 52;
    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(12)
      .text(title, MARGIN + 46, y + 12, {
        width: textW,
        lineBreak: false,
        ellipsis: true,
      });
    doc
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(7.5)
      .text(subtitle, MARGIN + 46, y + 28, {
        width: textW,
        lineBreak: false,
        ellipsis: true,
      });

    const pillH = 28;
    const pillY = y + 10;
    const gap = 6;
    const statusW = 78;
    const typeW = 100;
    const empW = 84;
    let px = MARGIN + contentW - (statusW + typeW + empW + gap * 2) - 10;

    doc
      .roundedRect(px, pillY, statusW, pillH, 5)
      .fillAndStroke('#f0fdf4', '#bbf7d0');
    doc
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(5.5)
      .text('Status', px + 8, pillY + 4, {
        width: statusW - 12,
        lineBreak: false,
      });
    doc.circle(px + 12, pillY + 18, 2.5).fill(GREEN);
    doc
      .fillColor('#166534')
      .font('Helvetica-Bold')
      .fontSize(7.5)
      .text(this.clip(status, 10), px + 18, pillY + 14, {
        width: statusW - 26,
        lineBreak: false,
        ellipsis: true,
      });
    px += statusW + gap;

    doc
      .roundedRect(px, pillY, typeW, pillH, 5)
      .fillAndStroke('#eff6ff', '#bfdbfe');
    doc
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(5.5)
      .text('Type', px + 8, pillY + 4, {
        width: typeW - 12,
        lineBreak: false,
      });
    doc
      .fillColor('#1e40af')
      .font('Helvetica-Bold')
      .fontSize(7)
      .text(this.clip(typeLabel, 14), px + 8, pillY + 14, {
        width: typeW - 14,
        lineBreak: false,
        ellipsis: true,
      });
    px += typeW + gap;

    doc
      .roundedRect(px, pillY, empW, pillH, 5)
      .fillAndStroke('#f7fee7', '#d9f99d');
    doc
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(5.5)
      .text('Employeer', px + 8, pillY + 4, {
        width: empW - 12,
        lineBreak: false,
      });
    doc
      .fillColor('#3f6212')
      .font('Helvetica-Bold')
      .fontSize(7)
      .text(this.clip(employer, 12), px + 8, pillY + 14, {
        width: empW - 14,
        lineBreak: false,
        ellipsis: true,
      });

    return y + h + 12;
  }

  private drawDriverInfoGrid(
    doc: PDFKit.PDFDocument,
    y: number,
    contentW: number,
    driver: ExportDriverRow,
    name: string,
  ): number {
    const sectionH = 22;
    doc.roundedRect(MARGIN, y, contentW, sectionH, 4).fill('#eef2ff');
    doc.roundedRect(MARGIN + 8, y + 5, 12, 12, 2).fill(NAVY);
    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(9)
      .text('Driver Information', MARGIN + 26, y + 6, {
        width: contentW - 36,
        lineBreak: false,
      });

    y += sectionH + 8;

    const left: Array<[string, string]> = [
      ['Employee ID', driver.user?.code ?? '—'],
      ['Father Name', driver.fatherName ?? '—'],
      ['Phone', driver.phone ?? driver.user?.phone ?? '—'],
      ['CNIC', driver.cnicNo ?? '—'],
      ['License No', driver.licenseNo ?? '—'],
      ['License Validity', this.fmtDisplayDate(driver.licenseValidity)],
      ['Emergency Contact', driver.emergencyContactPhone ?? '—'],
      ['Current Address', driver.currentAddress ?? '—'],
      ['Guarantor Name', driver.gurantorName ?? '—'],
      ['Guarantor CNIC', driver.gurantorCNIC ?? '—'],
    ];
    const right: Array<[string, string]> = [
      ['Name', name],
      ['Email', driver.user?.email ?? '—'],
      ['Alt Phone', driver.altPhone ?? '—'],
      [
        'Driver Type',
        DRIVER_TYPE_LABELS[driver.driverType] ?? driver.driverType ?? '—',
      ],
      [
        'License Type',
        driver.licenseType
          ? String(driver.licenseType as DriverLicenseType)
          : '—',
      ],
      ['License Verified', driver.licenseOnlineVerification ? 'Yes' : 'No'],
      ['Joining Date', this.fmtDisplayDate(driver.joiningDate)],
      ['Permanent Address', driver.permenantAddress ?? '—'],
      ['Guarantor Phone', driver.gurantorPhone ?? '—'],
      ['Guarantor Address', driver.gurantorAddress ?? '—'],
      ['Status', String(driver.status ?? '—')],
    ];

    const gap = 12;
    const colW = (contentW - gap) / 2;
    const rowH = 28;
    const rows = Math.max(left.length, right.length);

    for (let i = 0; i < rows; i++) {
      const rowY = y + i * rowH;
      if (i % 2 === 0) {
        doc.rect(MARGIN, rowY, contentW, rowH).fill(ZEBRA);
      }
      if (left[i]) {
        this.drawDetailField(doc, MARGIN, rowY, colW, left[i][0], left[i][1]);
      }
      if (right[i]) {
        this.drawDetailField(
          doc,
          MARGIN + colW + gap,
          rowY,
          colW,
          right[i][0],
          right[i][1],
          right[i][0] === 'Status',
        );
      }
    }

    return y + rows * rowH + 10;
  }

  private drawAssignedVehiclesSection(
    doc: PDFKit.PDFDocument,
    y: number,
    contentW: number,
    driver: ExportDriverRow,
  ): number {
    const vehicles = driver.assignedDrivers ?? [];
    const sectionH = 22;
    doc.roundedRect(MARGIN, y, contentW, sectionH, 4).fill('#eef2ff');
    doc.roundedRect(MARGIN + 8, y + 5, 12, 12, 2).fill(NAVY);
    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(9)
      .text('Assigned Vehicles', MARGIN + 26, y + 6, {
        width: contentW - 36,
        lineBreak: false,
      });
    y += sectionH + 8;

    if (vehicles.length === 0) {
      doc
        .fillColor(MUTED)
        .font('Helvetica')
        .fontSize(8)
        .text('None', MARGIN + 8, y, { width: contentW - 16 });
      return y + 16;
    }

    const rowH = 22;
    vehicles.forEach((ad, i) => {
      if (i % 2 === 0) {
        doc.rect(MARGIN, y, contentW, rowH).fill(ZEBRA);
      }
      const line = `${ad.vehicle?.regNo ?? '—'} · ${ad.driverType ?? '—'} · ${ad.status ?? '—'}`;
      doc
        .fillColor(VALUE)
        .font('Helvetica')
        .fontSize(8)
        .text(line, MARGIN + 8, y + 6, {
          width: contentW - 16,
          lineBreak: false,
          ellipsis: true,
        });
      y += rowH;
    });
    return y;
  }

  private drawDetailField(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    w: number,
    label: string,
    value: string,
    statusDot = false,
  ) {
    const pad = 8;
    doc.roundedRect(x + pad, y + 8, 9, 9, 2).fill(GREEN);
    doc
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(6)
      .text(label, x + pad + 14, y + 4, {
        width: w - pad * 2 - 14,
        lineBreak: false,
        ellipsis: true,
      });

    const valueX = x + pad + 14;
    if (statusDot) {
      doc.circle(valueX + 3, y + 18, 2.5).fill(GREEN);
      doc
        .fillColor('#166534')
        .font('Helvetica-Bold')
        .fontSize(8)
        .text(value, valueX + 10, y + 13, {
          width: w - pad * 2 - 24,
          lineBreak: false,
          ellipsis: true,
        });
    } else {
      doc
        .fillColor(VALUE)
        .font('Helvetica-Bold')
        .fontSize(8)
        .text(value || '—', valueX, y + 13, {
          width: w - pad * 2 - 14,
          lineBreak: false,
          ellipsis: true,
        });
    }
  }

  private drawDocumentsPdf(
    doc: PDFKit.PDFDocument,
    drivers: ExportDriverRow[],
    branding: ExportBranding,
    logoBuf: Buffer | null,
  ) {
    const contentW = PORTRAIT_W - MARGIN * 2;
    const headers = ['Name', 'Type', 'Validity', 'Uploaded', 'File'];
    const colW = [150, 130, 85, 90, 84];
    const colPad = 6;
    const headerRowH = 22;
    const rowH = 26;
    const reportDateLabel = this.fmtReportDateTime(new Date());
    const tableBottom = PORTRAIT_H - MARGIN - FOOTER_H;

    drivers.forEach((driver, index) => {
      const code = driver.user?.code ?? driver.id;
      const name = driver.user?.name ?? 'Driver';
      const title = `Documents — ${code}`;
      const subtitle = `#${index + 1} · ${name} · ${driver.phone ?? driver.user?.phone ?? '—'} · ${DRIVER_TYPE_LABELS[driver.driverType] ?? driver.driverType}`;
      const docs = driver.documents ?? [];
      const status = String(driver.status ?? '—');

      const startPage = (): number => {
        doc.addPage({ size: 'A4', layout: 'portrait', margin: MARGIN });
        let y = this.drawDocsBrandHeader(
          doc,
          branding,
          logoBuf,
          reportDateLabel,
        );
        y = this.drawDocsSummaryBar(
          doc,
          y,
          contentW,
          title,
          subtitle,
          docs.length,
          status,
        );
        return this.drawListTableHeader(
          doc,
          y,
          headers,
          colW,
          colPad,
          headerRowH,
          PORTRAIT_W,
        );
      };

      let y = startPage();

      if (docs.length === 0) {
        doc
          .fillColor(MUTED)
          .font('Helvetica')
          .fontSize(9)
          .text('No documents', MARGIN + colPad, y + 10);
        return;
      }

      docs.forEach((d, docIdx) => {
        if (y + rowH > tableBottom) {
          y = startPage();
        }

        if (docIdx % 2 === 1) {
          doc.rect(MARGIN, y, contentW, rowH).fill(ZEBRA);
        }

        const typeLabel = String(d.docType ?? '—');
        const badge = this.docTypeBadgeColor(typeLabel);
        const filePresent = Boolean(d.file);

        // Name
        doc
          .fillColor(VALUE)
          .font('Helvetica')
          .fontSize(8)
          .text(this.clip(d.name ?? '—', 36), MARGIN + colPad, y + 8, {
            width: colW[0] - colPad * 2,
            lineBreak: false,
            ellipsis: true,
          });

        // Type badge
        const typeX = MARGIN + colW[0] + colPad;
        const typeMaxW = colW[1] - colPad * 2;
        const typeText = this.clip(typeLabel, 22);
        doc.font('Helvetica-Bold').fontSize(6.5);
        const typeTextW = Math.min(
          doc.widthOfString(typeText) + 10,
          typeMaxW,
        );
        doc
          .roundedRect(typeX, y + 6, typeTextW, 14, 7)
          .fill(badge.bg);
        doc
          .fillColor(badge.fg)
          .text(typeText, typeX + 5, y + 9, {
            width: typeTextW - 10,
            lineBreak: false,
            ellipsis: true,
          });

        // Validity
        doc
          .fillColor(VALUE)
          .font('Helvetica')
          .fontSize(8)
          .text(
            this.fmtDisplayDate(d.validity),
            MARGIN + colW[0] + colW[1] + colPad,
            y + 8,
            { width: colW[2] - colPad * 2, lineBreak: false, ellipsis: true },
          );

        // Uploaded
        doc.text(
          this.fmtDisplayDate(d.createdAt),
          MARGIN + colW[0] + colW[1] + colW[2] + colPad,
          y + 8,
          { width: colW[3] - colPad * 2, lineBreak: false, ellipsis: true },
        );

        // File status
        const fileX = MARGIN + colW[0] + colW[1] + colW[2] + colW[3] + colPad;
        doc.circle(fileX + 4, y + 13, 3).fill(filePresent ? GREEN : '#ef4444');
        doc
          .fillColor(filePresent ? '#166534' : '#b91c1c')
          .font('Helvetica')
          .fontSize(7.5)
          .text(filePresent ? 'Present' : 'Missing', fileX + 10, y + 8, {
            width: colW[4] - colPad - 10,
            lineBreak: false,
          });

        doc
          .moveTo(MARGIN, y + rowH)
          .lineTo(MARGIN + contentW, y + rowH)
          .strokeColor(BORDER)
          .lineWidth(0.5)
          .stroke();

        y += rowH;
      });
    });

    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      this.drawReportFooter(
        doc,
        branding,
        reportDateLabel,
        i + 1,
        range.count,
        PORTRAIT_W,
        PORTRAIT_H,
      );
    }
  }

  private drawDocsBrandHeader(
    doc: PDFKit.PDFDocument,
    branding: ExportBranding,
    logoBuf: Buffer | null,
    reportDateLabel: string,
    reportTitle?: string,
    reportSubtitle?: string,
  ): number {
    const top = MARGIN;
    const logoSize = 44;
    const contentW = PORTRAIT_W - MARGIN * 2;
    const rightW = 140;
    const rightX = MARGIN + contentW - rightW;
    const titleW = reportTitle ? 170 : 0;
    const titleX = reportTitle ? rightX - titleW - 8 : rightX;
    const brandX = MARGIN + logoSize + 10;
    const brandW = Math.max(140, titleX - brandX - 10);

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

    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(12)
      .text(branding.name.toUpperCase(), brandX, top + 6, {
        width: brandW,
        lineBreak: false,
        ellipsis: true,
      });
    if (branding.tagLine) {
      doc
        .fillColor('#5b8def')
        .font('Helvetica')
        .fontSize(7)
        .text(branding.tagLine.toUpperCase(), brandX, top + 24, {
          width: brandW,
          lineBreak: false,
          ellipsis: true,
        });
    }

    if (reportTitle) {
      doc
        .fillColor(NAVY)
        .font('Helvetica-Bold')
        .fontSize(11)
        .text(reportTitle, titleX, top + 6, {
          width: titleW,
          align: 'right',
          lineBreak: false,
          ellipsis: true,
        });
      if (reportSubtitle) {
        doc
          .fillColor(MUTED)
          .font('Helvetica')
          .fontSize(8)
          .text(reportSubtitle, titleX, top + 22, {
            width: titleW,
            align: 'right',
            lineBreak: false,
            ellipsis: true,
          });
      }
    }

    const dateBoxH = 28;
    const dateBoxY = top + 8;
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
      .fontSize(7.5)
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

  private drawDocsSummaryBar(
    doc: PDFKit.PDFDocument,
    y: number,
    contentW: number,
    title: string,
    subtitle: string,
    totalDocs: number,
    status: string,
  ): number {
    const h = 40;
    doc.roundedRect(MARGIN, y, contentW, h, 6).fill('#f8fafc');

    const iconX = MARGIN + 8;
    const iconY = y + 8;
    doc.roundedRect(iconX, iconY, 24, 24, 4).fill(GREEN);
    doc
      .roundedRect(iconX + 7, iconY + 6, 10, 12, 1.5)
      .fill('#ffffff');

    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(11)
      .text(title, MARGIN + 40, y + 8, {
        width: contentW - 230,
        lineBreak: false,
        ellipsis: true,
      });
    doc
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(7)
      .text(subtitle, MARGIN + 40, y + 23, {
        width: contentW - 230,
        lineBreak: false,
        ellipsis: true,
      });

    const statusW = 88;
    const badgeW = 108;
    const statusX = MARGIN + contentW - statusW - 8;
    const badgeX = statusX - badgeW - 8;

    doc
      .roundedRect(badgeX, y + 7, badgeW, 26, 5)
      .fillAndStroke('#ffffff', BORDER);
    doc
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(6)
      .text('Total Documents', badgeX + 8, y + 10, {
        width: badgeW - 16,
        lineBreak: false,
      });
    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(12)
      .text(String(totalDocs), badgeX + 8, y + 19, {
        width: badgeW - 16,
        lineBreak: false,
      });

    doc
      .roundedRect(statusX, y + 7, statusW, 26, 5)
      .fillAndStroke('#f0fdf4', '#bbf7d0');
    doc
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(6)
      .text('Status', statusX + 8, y + 10, {
        width: statusW - 16,
        lineBreak: false,
      });
    doc.circle(statusX + 12, y + 24, 2.5).fill(GREEN);
    doc
      .fillColor('#166534')
      .font('Helvetica-Bold')
      .fontSize(8)
      .text(this.clip(status, 12), statusX + 18, y + 20, {
        width: statusW - 26,
        lineBreak: false,
        ellipsis: true,
      });

    return y + h + 10;
  }

  private docTypeBadgeColor(docType: string): { bg: string; fg: string } {
    let hash = 0;
    for (let i = 0; i < docType.length; i++) {
      hash = (hash + docType.charCodeAt(i) * (i + 1)) % 997;
    }
    return DOC_TYPE_BADGE_COLORS[hash % DOC_TYPE_BADGE_COLORS.length];
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
