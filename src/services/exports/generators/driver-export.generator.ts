import { Injectable, Logger } from '@nestjs/common';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
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
import { User } from '../../../database/entities/user.entity';
import { GeneratedExportFile } from '../export.types';

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
    return new Promise<Buffer>((resolve, reject) => {
      const landscape = mode === ExportMode.LIST;
      const doc = new PDFDocument({
        size: 'A4',
        layout: landscape ? 'landscape' : 'portrait',
        margin: 36,
        autoFirstPage: false,
        info: { Title: `Drivers Export — ${mode}`, Author: 'ZS Logistics' },
      });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      try {
        if (mode === ExportMode.LIST) {
          this.drawListPdf(doc, drivers);
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

  private drawListPdf(doc: PDFKit.PDFDocument, drivers: ExportDriverRow[]) {
    const pageW = 841.89;
    const pageH = 595.28;
    const margin = 28;
    const headers = [
      'S No.',
      'Emp ID',
      'Name',
      'Phone',
      'Type',
      'License',
      'Status',
      'CNIC',
    ];
    const colW = [36, 70, 120, 80, 70, 90, 55, 100];
    const rowH = 16;
    const startY = 56;

    const drawHeader = () => {
      doc.addPage({ size: 'A4', layout: 'landscape', margin });
      doc
        .fillColor('#1A3C70')
        .fontSize(14)
        .font('Helvetica-Bold')
        .text('Drivers Export — List', margin, 28, {
          width: pageW - margin * 2,
        });
      let x = margin;
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#111827');
      headers.forEach((h, i) => {
        doc.text(h, x, startY, { width: colW[i], continued: false });
        x += colW[i];
      });
      doc
        .moveTo(margin, startY + 12)
        .lineTo(pageW - margin, startY + 12)
        .strokeColor('#d1d5db')
        .stroke();
    };

    drawHeader();
    let y = startY + 18;
    doc.font('Helvetica').fontSize(8).fillColor('#111827');

    drivers.forEach((d, idx) => {
      if (y + rowH > pageH - margin) {
        drawHeader();
        y = startY + 18;
        doc.font('Helvetica').fontSize(8).fillColor('#111827');
      }
      const vals = [
        String(idx + 1),
        d.user?.code ?? '',
        d.user?.name ?? '',
        d.phone ?? '',
        DRIVER_TYPE_LABELS[d.driverType] ?? d.driverType,
        `${d.licenseNo ?? '—'} (${d.licenseType ?? '—'})`,
        d.status,
        d.cnicNo ?? '',
      ];
      let x = margin;
      vals.forEach((v, i) => {
        doc.text(this.clip(v, 28), x, y, {
          width: colW[i],
          height: rowH,
          ellipsis: true,
        });
        x += colW[i];
      });
      y += rowH;
    });
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
