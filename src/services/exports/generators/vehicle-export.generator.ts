import { Injectable, Logger } from '@nestjs/common';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import {
  ExportFormat,
  ExportMode,
} from '../../../database/entities/export-job.entity';
import {
  Designation,
  Vehicle,
  VehicleDocument,
  VehicleOwnerShip,
} from '../../../database/entities/vehicle.entity';
import { GeneratedExportFile } from '../export.types';

const OWNERSHIP_LABELS: Record<VehicleOwnerShip, string> = {
  [VehicleOwnerShip.CONTRACT_BASED]: 'Contract Based',
  [VehicleOwnerShip.BANK_LEASE]: 'Bank Lease',
  [VehicleOwnerShip.OWN]: 'Own',
  [VehicleOwnerShip.RENTED]: 'Rented',
};

const DESIGNATION_LABELS: Record<Designation, string> = {
  [Designation.DRIVER]: 'Driver',
  [Designation.OWNER]: 'Owner',
  [Designation.FORMEN]: 'Formen',
  [Designation.OFFICE_PERSON]: 'Office Person',
};

const LIST_HEADERS = [
  'S No.',
  'Reg No',
  'Engine No',
  'Chassis No',
  'Type',
  'Size',
  'Capacity',
  'Ownership',
  'Owner First Name',
  'Owner Last Name',
  'Contact Person',
  'Contact No',
  'Designation',
  'Status',
  'Joining Date',
] as const;

export type ExportVehicleRow = Vehicle & {
  documents?: VehicleDocument[];
};

@Injectable()
export class VehicleExportGenerator {
  private readonly logger = new Logger(VehicleExportGenerator.name);

  async generate(
    vehicles: ExportVehicleRow[],
    format: ExportFormat,
    mode: ExportMode,
  ): Promise<GeneratedExportFile> {
    const stamp = new Date().toISOString().slice(0, 10);
    if (format === ExportFormat.XLSX) {
      const buffer = await this.generateXlsx(vehicles, mode);
      return {
        buffer,
        fileName: `vehicles-export-${mode.toLowerCase()}-${stamp}.xlsx`,
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
    }

    const buffer = await this.generatePdf(vehicles, mode);
    return {
      buffer,
      fileName: `vehicles-export-${mode.toLowerCase()}-${stamp}.pdf`,
      contentType: 'application/pdf',
    };
  }

  private async generateXlsx(
    vehicles: ExportVehicleRow[],
    mode: ExportMode,
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'ZS Logistics';
    workbook.created = new Date();

    if (mode === ExportMode.LIST) {
      const sheet = workbook.addWorksheet('Vehicles');
      sheet.addRow([...LIST_HEADERS]);
      sheet.getRow(1).font = { bold: true };
      vehicles.forEach((v, i) => sheet.addRow(this.listRowValues(v, i)));
      this.autoWidth(sheet);
    } else if (mode === ExportMode.DETAIL_PAGES) {
      for (const vehicle of vehicles) {
        const sheet = workbook.addWorksheet(
          this.safeSheetName(vehicle.regNo || vehicle.id, workbook),
        );
        this.writeDetailSheet(sheet, vehicle);
        this.autoWidth(sheet);
      }
    } else {
      for (const vehicle of vehicles) {
        const sheet = workbook.addWorksheet(
          this.safeSheetName(vehicle.regNo || vehicle.id, workbook),
        );
        this.writeDocumentsSheet(sheet, vehicle);
        this.autoWidth(sheet);
      }
    }

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  private async generatePdf(
    vehicles: ExportVehicleRow[],
    mode: ExportMode,
  ): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const landscape = mode === ExportMode.LIST;
      const doc = new PDFDocument({
        size: 'A4',
        layout: landscape ? 'landscape' : 'portrait',
        margin: 36,
        autoFirstPage: false,
        info: { Title: `Vehicles Export — ${mode}`, Author: 'ZS Logistics' },
      });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      try {
        if (mode === ExportMode.LIST) {
          this.drawListPdf(doc, vehicles);
        } else if (mode === ExportMode.DETAIL_PAGES) {
          vehicles.forEach((v, i) => this.drawDetailPdfPage(doc, v, i));
        } else {
          vehicles.forEach((v, i) => this.drawDocumentsPdfPage(doc, v, i));
        }
        doc.end();
      } catch (err) {
        this.logger.error(
          'Vehicle PDF generation failed',
          err instanceof Error ? err.stack : String(err),
        );
        reject(err);
      }
    });
  }

  private listRowValues(
    vehicle: ExportVehicleRow,
    index: number,
  ): (string | number)[] {
    return [
      index + 1,
      vehicle.regNo ?? '',
      vehicle.enginNo ?? '',
      vehicle.chassisNo ?? '',
      vehicle.vehicleType?.name ?? '',
      vehicle.vehicleSize?.name ?? '',
      vehicle.vehicleCapacity?.name ?? '',
      OWNERSHIP_LABELS[vehicle.ownership] ?? vehicle.ownership,
      vehicle.ownerFirstName ?? '',
      vehicle.ownerLastName ?? '',
      vehicle.contactPersonName ?? '',
      vehicle.contactNo ?? '',
      DESIGNATION_LABELS[vehicle.Designation] ?? vehicle.Designation ?? '',
      vehicle.status,
      this.fmtDate(vehicle.joiningDate),
    ];
  }

  private writeDetailSheet(sheet: ExcelJS.Worksheet, vehicle: ExportVehicleRow) {
    const pairs: [string, string][] = [
      ['Reg No', vehicle.regNo ?? ''],
      ['Engine No', vehicle.enginNo ?? ''],
      ['Chassis No', vehicle.chassisNo ?? ''],
      ['Type', vehicle.vehicleType?.name ?? ''],
      ['Size', vehicle.vehicleSize?.name ?? ''],
      ['Capacity', vehicle.vehicleCapacity?.name ?? ''],
      ['Ownership', OWNERSHIP_LABELS[vehicle.ownership] ?? vehicle.ownership],
      ['Owner First Name', vehicle.ownerFirstName ?? ''],
      ['Owner Last Name', vehicle.ownerLastName ?? ''],
      ['Contact Person', vehicle.contactPersonName ?? ''],
      ['Contact No', vehicle.contactNo ?? ''],
      [
        'Designation',
        DESIGNATION_LABELS[vehicle.Designation] ?? vehicle.Designation ?? '',
      ],
      ['Status', vehicle.status],
      ['Joining Date', this.fmtDate(vehicle.joiningDate)],
    ];

    sheet.addRow(['Field', 'Value']).font = { bold: true };
    for (const [k, v] of pairs) sheet.addRow([k, v]);
  }

  private writeDocumentsSheet(
    sheet: ExcelJS.Worksheet,
    vehicle: ExportVehicleRow,
  ) {
    sheet.addRow(['Vehicle']).font = { bold: true };
    sheet.addRow(['Reg No', vehicle.regNo ?? '']);
    sheet.addRow(['Engine No', vehicle.enginNo ?? '']);
    sheet.addRow(['Chassis No', vehicle.chassisNo ?? '']);
    sheet.addRow(['Type', vehicle.vehicleType?.name ?? '']);
    sheet.addRow(['Status', vehicle.status]);
    sheet.addRow(['Contact', vehicle.contactNo ?? '']);
    sheet.addRow([]);
    sheet.addRow(['Documents']).font = { bold: true };
    sheet
      .addRow(['Name', 'Doc Type', 'Validity', 'Uploaded At', 'File Present'])
      .font = { bold: true };

    const docs = vehicle.documents ?? [];
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

  private drawListPdf(doc: PDFKit.PDFDocument, vehicles: ExportVehicleRow[]) {
    const pageW = 841.89;
    const pageH = 595.28;
    const margin = 28;
    const headers = [
      'S No.',
      'Reg No',
      'Engine',
      'Chassis',
      'Type',
      'Ownership',
      'Contact',
      'Status',
    ];
    const colW = [36, 80, 90, 90, 80, 80, 90, 55];
    const rowH = 16;
    const startY = 56;

    const drawHeader = () => {
      doc.addPage({ size: 'A4', layout: 'landscape', margin });
      doc
        .fillColor('#1A3C70')
        .fontSize(14)
        .font('Helvetica-Bold')
        .text('Vehicles Export — List', margin, 28, {
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

    vehicles.forEach((v, idx) => {
      if (y + rowH > pageH - margin) {
        drawHeader();
        y = startY + 18;
        doc.font('Helvetica').fontSize(8).fillColor('#111827');
      }
      const vals = [
        String(idx + 1),
        v.regNo ?? '',
        v.enginNo ?? '',
        v.chassisNo ?? '',
        v.vehicleType?.name ?? '',
        OWNERSHIP_LABELS[v.ownership] ?? v.ownership,
        v.contactNo ?? '',
        v.status,
      ];
      let x = margin;
      vals.forEach((val, i) => {
        doc.text(this.clip(val, 28), x, y, {
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
    vehicle: ExportVehicleRow,
    index: number,
  ) {
    doc.addPage({ size: 'A4', layout: 'portrait', margin: 40 });
    doc
      .fillColor('#1A3C70')
      .fontSize(14)
      .font('Helvetica-Bold')
      .text(`Vehicle Detail — ${vehicle.regNo}`, { continued: false });
    doc
      .fontSize(9)
      .fillColor('#6b7280')
      .font('Helvetica')
      .text(`#${index + 1} · ${vehicle.regNo}`);

    let y = 90;
    const pairs: [string, string][] = [
      ['Reg No', vehicle.regNo ?? '—'],
      ['Engine No', vehicle.enginNo ?? '—'],
      ['Chassis No', vehicle.chassisNo ?? '—'],
      ['Type', vehicle.vehicleType?.name ?? '—'],
      ['Size', vehicle.vehicleSize?.name ?? '—'],
      ['Capacity', vehicle.vehicleCapacity?.name ?? '—'],
      ['Ownership', OWNERSHIP_LABELS[vehicle.ownership] ?? vehicle.ownership],
      ['Owner', `${vehicle.ownerFirstName} ${vehicle.ownerLastName}`.trim()],
      ['Contact Person', vehicle.contactPersonName ?? '—'],
      ['Contact No', vehicle.contactNo ?? '—'],
      [
        'Designation',
        DESIGNATION_LABELS[vehicle.Designation] ?? vehicle.Designation ?? '—',
      ],
      ['Status', vehicle.status],
      ['Joining Date', this.fmtDate(vehicle.joiningDate) || '—'],
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
    }
  }

  private drawDocumentsPdfPage(
    doc: PDFKit.PDFDocument,
    vehicle: ExportVehicleRow,
    index: number,
  ) {
    doc.addPage({ size: 'A4', layout: 'portrait', margin: 40 });
    doc
      .fillColor('#1A3C70')
      .fontSize(14)
      .font('Helvetica-Bold')
      .text(`Documents — ${vehicle.regNo}`);
    doc
      .fontSize(9)
      .fillColor('#6b7280')
      .font('Helvetica')
      .text(
        `#${index + 1} · ${vehicle.regNo} · ${vehicle.vehicleType?.name ?? '—'} · ${vehicle.status}`,
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

    const docs = vehicle.documents ?? [];
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
