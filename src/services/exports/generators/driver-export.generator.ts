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
      const landscape =
        mode === ExportMode.LIST || mode === ExportMode.DETAIL_PAGES;
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
    const contentW = PAGE_W - MARGIN * 2;
    const cardGap = 12;
    const cardW = (contentW - cardGap) / 2;
    const reportDateLabel = this.fmtReportDateTime(new Date());

    for (let i = 0; i < drivers.length; i += 2) {
      doc.addPage({ size: 'A4', layout: 'landscape', margin: MARGIN });
      const y = this.drawLandscapeDetailHeader(
        doc,
        branding,
        logoBuf,
        reportDateLabel,
        'Driver Details Report',
      );
      const pair = drivers.slice(i, i + 2);
      pair.forEach((driver, col) => {
        this.drawDriverDetailCard(
          doc,
          MARGIN + col * (cardW + cardGap),
          y,
          cardW,
          driver,
          i + col,
        );
      });
    }

    const range = doc.bufferedPageRange();
    for (let p = 0; p < range.count; p++) {
      doc.switchToPage(range.start + p);
      this.drawReportFooter(
        doc,
        branding,
        reportDateLabel,
        p + 1,
        range.count,
        PAGE_W,
        PAGE_H,
      );
    }
  }

  private drawLandscapeDetailHeader(
    doc: PDFKit.PDFDocument,
    branding: ExportBranding,
    logoBuf: Buffer | null,
    reportDateLabel: string,
    reportTitle: string,
  ): number {
    const top = MARGIN;
    const logoSize = 40;
    const contentW = PAGE_W - MARGIN * 2;
    const rightW = 200;
    const rightX = MARGIN + contentW - rightW;
    const brandX = MARGIN + logoSize + 10;
    const brandW = Math.max(200, rightX - brandX - 16);

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

    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(14)
      .text(reportTitle, rightX, top + 4, {
        width: rightW,
        align: 'right',
        lineBreak: false,
      });
    doc
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(8)
      .text(`Generated On: ${reportDateLabel}`, rightX, top + 24, {
        width: rightW,
        align: 'right',
        lineBreak: false,
        ellipsis: true,
      });

    const lineY = top + logoSize + 8;
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

    return lineY + 10;
  }

  private drawDriverDetailCard(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    w: number,
    driver: ExportDriverRow,
    index: number,
  ) {
    const cardBottom = PAGE_H - MARGIN - FOOTER_H;
    const cardH = cardBottom - y;
    const pad = 10;
    const code = driver.user?.code ?? driver.id;
    const name = driver.user?.name ?? 'Driver';
    const status = String(driver.status ?? '—');
    const typeLabel =
      DRIVER_TYPE_LABELS[driver.driverType] ?? driver.driverType ?? '—';
    const employer =
      EMPLOYEER_LABELS[driver.employeerType ?? EmployeerType.OWN] ?? '—';

    doc.roundedRect(x, y, w, cardH, 8).fillAndStroke('#ffffff', BORDER);

    let cy = y + pad;
    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(11)
      .text(`Driver Detail — ${name}`, x + pad, cy, {
        width: w - pad * 2 - 200,
        lineBreak: false,
        ellipsis: true,
      });
    doc
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(7.5)
      .text(`#${index + 1} · ${code}`, x + pad, cy + 14, {
        width: w - pad * 2 - 200,
        lineBreak: false,
      });

    this.drawCardBadges(doc, x + w - pad, cy, [
      { text: status, bg: '#dcfce7', fg: '#166534' },
      { text: typeLabel, bg: '#dbeafe', fg: '#1e40af' },
      { text: employer, bg: '#fef9c3', fg: '#854d0e' },
    ]);

    cy += 36;
    doc.roundedRect(x + pad, cy, w - pad * 2, 18, 3).fill('#eef2ff');
    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(8)
      .text('Driver Information', x + pad + 8, cy + 5, {
        width: w - pad * 2 - 16,
        lineBreak: false,
      });
    cy += 22;

    const fields: Array<[string, string]> = [
      ['Employee ID', code],
      ['Name', name],
      ['Father Name', driver.fatherName ?? '—'],
      ['Phone', driver.phone ?? driver.user?.phone ?? '—'],
      ['CNIC', driver.cnicNo ?? '—'],
      ['Type', typeLabel],
      ['License No', driver.licenseNo ?? '—'],
      [
        'License Type',
        driver.licenseType
          ? String(driver.licenseType as DriverLicenseType)
          : '—',
      ],
      ['Employeer', employer],
      ['Joining Date', this.fmtDisplayDate(driver.joiningDate)],
      ['Status', status],
      [
        'Assigned',
        (driver.assignedDrivers ?? [])
          .map((ad) => ad.vehicle?.regNo)
          .filter(Boolean)
          .join(', ') || '—',
      ],
    ];

    const rowH = 22;
    const labelW = 90;
    fields.forEach(([label, value], i) => {
      const rowY = cy + i * rowH;
      if (i % 2 === 0) {
        doc.rect(x + pad, rowY, w - pad * 2, rowH).fill(ZEBRA);
      }
      doc
        .fillColor(MUTED)
        .font('Helvetica')
        .fontSize(7)
        .text(label, x + pad + 6, rowY + 6, {
          width: labelW,
          lineBreak: false,
        });
      if (label === 'Status') {
        const vw = Math.min(56, w - pad * 2 - labelW - 16);
        doc
          .roundedRect(x + pad + labelW + 4, rowY + 4, vw, 14, 7)
          .fill('#dcfce7');
        doc
          .fillColor('#166534')
          .font('Helvetica-Bold')
          .fontSize(7)
          .text(value, x + pad + labelW + 8, rowY + 7, {
            width: vw - 8,
            lineBreak: false,
            ellipsis: true,
          });
      } else {
        doc
          .fillColor(VALUE)
          .font('Helvetica-Bold')
          .fontSize(8)
          .text(value || '—', x + pad + labelW + 4, rowY + 6, {
            width: w - pad * 2 - labelW - 10,
            lineBreak: false,
            ellipsis: true,
          });
      }
    });
  }

  private drawCardBadges(
    doc: PDFKit.PDFDocument,
    rightX: number,
    y: number,
    badges: Array<{ text: string; bg: string; fg: string }>,
  ) {
    let x = rightX;
    for (let i = badges.length - 1; i >= 0; i--) {
      const b = badges[i];
      const text = this.clip(b.text, 14);
      doc.font('Helvetica-Bold').fontSize(6.5);
      const tw = Math.min(doc.widthOfString(text) + 12, 90);
      x -= tw;
      doc.roundedRect(x, y + 2, tw, 14, 7).fill(b.bg);
      doc.fillColor(b.fg).text(text, x + 6, y + 5, {
        width: tw - 12,
        lineBreak: false,
        ellipsis: true,
      });
      x -= 5;
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
