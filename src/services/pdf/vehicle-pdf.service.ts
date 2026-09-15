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
  BusinessInfoSettingValue,
  SystemSetting,
  SystemSettingKey,
} from '../../database/entities/system-setting.entity';
import {
  Designation,
  VehicleOwnerShip,
  VehicleStatus,
  VehicleTypeMeasurement,
} from '../../database/entities/vehicle.entity';
import { VehiclesService } from '../vehicles.service';

const NAVY = '#1A3C70';
const GREEN = '#A9C43F';
const MINT = '#eef6e8';
const MUTED = '#6b7280';
const LABEL = '#9ca3af';
const VALUE = '#111827';
const CARD_BORDER = '#e5e7eb';
const PAGE_W = 595.28;
const PAGE_H = 841.89;
/** ~12mm — page margins are 0 to avoid PDFKit blank-page overflow. */
const MARGIN = 34;

const DEFAULT_BUSINESS_INFO: BusinessInfoSettingValue = {
  logoUrl:
    'https://zsparktech-bucket.s3.eu-north-1.amazonaws.com/assets/logo.png',
  companyName: 'ZS Logistics Services',
  tagLine: 'Move today for a brighter tomorrow',
  address: 'Head Office: Office 101, DHA Phase 7 Ext, Karachi, Pakistan',
  ptcl: null,
  phone: '+92 21 3499 0000',
  email: 'info@zslogistics.com',
};

const OWNERSHIP_LABELS: Record<VehicleOwnerShip, string> = {
  [VehicleOwnerShip.OWN]: 'Own',
  [VehicleOwnerShip.BANK_LEASE]: 'Bank Lease',
  [VehicleOwnerShip.CONTRACT_BASED]: 'Contract Based',
  [VehicleOwnerShip.RENTED]: 'Rented',
};

const DESIGNATION_LABELS: Record<Designation, string> = {
  [Designation.DRIVER]: 'Driver',
  [Designation.OWNER]: 'Owner',
  [Designation.FORMEN]: 'Foreman',
  [Designation.OFFICE_PERSON]: 'Office Person',
};

const MEASUREMENT_LABELS: Record<VehicleTypeMeasurement, string> = {
  [VehicleTypeMeasurement.SIZE]: 'Size',
  [VehicleTypeMeasurement.CAPACITY]: 'Capacity',
};

type PrintBranding = {
  logoUrl: string;
  name: string;
  tagLine: string;
  addressLine: string;
  phone: string;
  ptcl: string;
  email: string;
};

type VehiclePdfData = Awaited<ReturnType<VehiclesService['findOne']>>;

export type VehiclePdfResult = {
  buffer: Buffer;
  filename: string;
  code: string;
};

@Injectable()
export class VehiclePdfService {
  private readonly logger = new Logger(VehiclePdfService.name);

  constructor(
    private readonly vehiclesService: VehiclesService,
    @InjectRepository(SystemSetting)
    private readonly settingRepo: Repository<SystemSetting>,
  ) {}

  async generateById(id: string): Promise<VehiclePdfResult> {
    let vehicle: VehiclePdfData;
    try {
      vehicle = await this.vehiclesService.findOne(id);
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      throw err;
    }
    return this.renderPdf(vehicle);
  }

  private async renderPdf(vehicle: VehiclePdfData): Promise<VehiclePdfResult> {
    const regNo = vehicle.regNo?.trim() || vehicle.id;

    try {
      const branding = await this.resolveBranding();
      const logoBuf = await this.fetchImageBuffer(branding.logoUrl);

      const buffer = await new Promise<Buffer>((resolve, reject) => {
        const doc = new PDFDocument({
          size: 'A4',
          margin: 0,
          autoFirstPage: false,
          info: {
            Title: `Vehicle Profile — ${regNo}`,
            Author: branding.name,
          },
        });
        const chunks: Buffer[] = [];
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        doc.addPage({ size: 'A4', margin: 0 });
        this.resetPageCursor(doc);
        this.drawPage(doc, vehicle, branding, logoBuf);

        doc.end();
      });

      const safeReg = regNo.replace(/[^\w.-]+/g, '_').slice(0, 60);
      return {
        buffer,
        filename: `vehicle-${safeReg}.pdf`,
        code: regNo,
      };
    } catch (err) {
      this.logger.error(
        `Failed to generate vehicle PDF for ${regNo}`,
        err instanceof Error ? err.stack : String(err),
      );
      throw new InternalServerErrorException('Failed to generate vehicle PDF');
    }
  }

  /** Matches zs-frontend printVehicle.ts A4 fleet template. */
  private drawPage(
    doc: PDFKit.PDFDocument,
    vehicle: VehiclePdfData,
    branding: PrintBranding,
    logoBuf: Buffer | null,
  ): void {
    const contentW = PAGE_W - MARGIN * 2;
    let y = this.drawTopHeader(doc, branding, logoBuf);

    y = this.drawSummary(doc, vehicle, branding, y, contentW);
    y = this.drawCardsGrid(doc, vehicle, y, contentW);
    y = this.drawBizBar(doc, branding, y, contentW);
    y = this.drawNote(doc, branding, y, contentW);
    this.drawSideRail(doc);

    this.resetPageCursor(doc);
  }

  private drawTopHeader(
    doc: PDFKit.PDFDocument,
    branding: PrintBranding,
    logoBuf: Buffer | null,
  ): number {
    const top = MARGIN;
    const logoSize = 48;
    const contentW = PAGE_W - MARGIN * 2;

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

    const brandX = MARGIN + logoSize + 10;
    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(13)
      .text(branding.name, brandX, top + 6, {
        width: 220,
        lineBreak: false,
        ellipsis: true,
      });
    doc
      .fillColor(MUTED)
      .font('Helvetica-Bold')
      .fontSize(7)
      .text(branding.tagLine.toUpperCase(), brandX, top + 24, {
        width: 220,
        lineBreak: false,
        ellipsis: true,
      });

    const rightW = 180;
    const rightX = MARGIN + contentW - rightW;
    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(16)
      .text('VEHICLE PROFILE', rightX, top + 4, {
        width: rightW,
        align: 'right',
        lineBreak: false,
      });
    doc
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(8)
      .text(`Printed on: ${this.fmtPrintedOn()}`, rightX, top + 28, {
        width: rightW,
        align: 'right',
        lineBreak: false,
      });

    this.resetPageCursor(doc);
    return top + logoSize + 12;
  }

  private drawSummary(
    doc: PDFKit.PDFDocument,
    vehicle: VehiclePdfData,
    branding: PrintBranding,
    y: number,
    contentW: number,
  ): number {
    const h = 62;
    doc
      .roundedRect(MARGIN, y, contentW, h, 10)
      .fillAndStroke(MINT, '#d9e8b8');

    // Truck icon box
    const iconX = MARGIN + 12;
    const iconY = y + 9;
    const iconSize = 44;
    doc
      .roundedRect(iconX, iconY, iconSize, iconSize, 8)
      .fillAndStroke('#ffffff', '#dfe7c8');
    this.drawTruckGlyph(doc, iconX, iconY, iconSize);

    const textX = iconX + iconSize + 12;
    const regNo = this.dash(vehicle.regNo);
    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(15)
      .text(regNo, textX, y + 12, {
        width: 160,
        lineBreak: false,
        ellipsis: true,
      });

    this.drawStatusPill(doc, vehicle.status, textX + 165, y + 14);

    doc
      .fillColor(MUTED)
      .font('Helvetica-Bold')
      .fontSize(8)
      .text(this.ownerLine(vehicle, branding), textX, y + 38, {
        width: contentW - iconSize - 200,
        lineBreak: false,
        ellipsis: true,
      });

    // Right meta: type / size-capacity / registered
    const metaW = 78;
    const metaGap = 10;
    const metaStart =
      MARGIN + contentW - (metaW * 3 + metaGap * 2) - 8;
    const typeName = this.dash(vehicle.vehicleType?.name);
    const sizeCap = this.sizeCapacity(vehicle);
    const registered = this.fmtDate(vehicle.createdAt);

    this.drawMetaItem(doc, metaStart, y + 14, metaW, 'Vehicle Type', typeName);
    this.drawMetaItem(
      doc,
      metaStart + metaW + metaGap,
      y + 14,
      metaW,
      'Size / Capacity',
      sizeCap,
    );
    this.drawMetaItem(
      doc,
      metaStart + (metaW + metaGap) * 2,
      y + 14,
      metaW,
      'Registered',
      registered,
    );

    this.resetPageCursor(doc);
    return y + h + 12;
  }

  private drawCardsGrid(
    doc: PDFKit.PDFDocument,
    vehicle: VehiclePdfData,
    y: number,
    contentW: number,
  ): number {
    const gap = 10;
    const colW = (contentW - gap) / 2;
    const leftX = MARGIN;
    const rightX = MARGIN + colW + gap;

    const ownershipLabel =
      OWNERSHIP_LABELS[vehicle.ownership as VehicleOwnerShip] ??
      String(vehicle.ownership ?? '—');
    const desigLabel =
      DESIGNATION_LABELS[vehicle.Designation as Designation] ??
      String(vehicle.Designation ?? '—');
    const measurement = vehicle.vehicleType?.measurement
      ? (MEASUREMENT_LABELS[
          vehicle.vehicleType.measurement as VehicleTypeMeasurement
        ] ?? String(vehicle.vehicleType.measurement))
      : '—';

    const imageCount =
      vehicle.vehicleImages?.length ?? vehicle.vehicleImageUrls?.length ?? 0;
    const docCount = vehicle.documents?.length ?? 0;

    let leftY = y;
    let rightY = y;

    leftY = this.drawCard(doc, leftX, leftY, colW, 'Ownership Details', [
      ['Ownership Type', ownershipLabel],
      ['Owner First Name', this.dash(vehicle.ownerFirstName)],
      ['Owner Last Name', this.dash(vehicle.ownerLastName)],
    ]);

    rightY = this.drawCard(doc, rightX, rightY, colW, 'Contact Person', [
      ['Name', this.dash(vehicle.contactPersonName)],
      ['Phone', this.dash(vehicle.contactNo)],
      ['Designation', desigLabel],
    ], { designationPill: true });

    leftY = this.drawCard(doc, leftX, leftY, colW, 'Vehicle Information', [
      ['Registration No', this.dash(vehicle.regNo)],
      ['Engine No', this.dash(vehicle.enginNo)],
      ['Chassis No', this.dash(vehicle.chassisNo)],
    ]);

    rightY = this.drawCard(
      doc,
      rightX,
      rightY,
      colW,
      'Vehicle Classification',
      [
        ['Vehicle Type', this.dash(vehicle.vehicleType?.name)],
        ['Size', this.dash(vehicle.vehicleSize?.name)],
        ['Capacity', this.dash(vehicle.vehicleCapacity?.name)],
        ['Measurement', measurement],
      ],
    );

    leftY = this.drawCard(doc, leftX, leftY, colW, 'System Information', [
      ['Vehicle ID', this.dash(vehicle.id)],
      ['Created Date', this.fmtDate(vehicle.createdAt)],
      ['Updated At', this.fmtDate(vehicle.updatedAt)],
      ['Document Count', String(docCount)],
    ]);

    rightY = this.drawMediaCard(
      doc,
      rightX,
      rightY,
      colW,
      imageCount,
      docCount,
    );

    return Math.max(leftY, rightY) + 4;
  }

  private drawCard(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    w: number,
    title: string,
    rows: Array<[string, string]>,
    opts?: { designationPill?: boolean },
  ): number {
    const headH = 26;
    const rowH = 22;
    const bodyPad = 6;
    const bodyH = bodyPad + rows.length * rowH + 4;
    const h = headH + bodyH;

    doc.roundedRect(x, y, w, h, 10).fillAndStroke('#ffffff', CARD_BORDER);

    doc.save();
    doc.roundedRect(x, y, w, headH, 10).clip();
    doc.rect(x, y, w, headH + 6).fill('#eef3f9');
    doc.restore();
    doc
      .moveTo(x, y + headH)
      .lineTo(x + w, y + headH)
      .strokeColor('#e2e8f0')
      .lineWidth(0.8)
      .stroke();

    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .text(title.toUpperCase(), x + 12, y + 9, {
        width: w - 24,
        lineBreak: false,
        ellipsis: true,
      });

    let rowY = y + headH + bodyPad;
    for (const [label, value] of rows) {
      doc
        .fillColor(LABEL)
        .font('Helvetica-Bold')
        .fontSize(7.5)
        .text(label.toUpperCase(), x + 12, rowY + 4, {
          width: w * 0.42,
          lineBreak: false,
          ellipsis: true,
        });

      const valueX = x + w * 0.42 + 8;
      const valueW = w - (w * 0.42) - 20;

      if (opts?.designationPill && label === 'Designation') {
        this.drawDesigPill(doc, value, valueX + valueW - 78, rowY + 2, 78);
      } else {
        doc
          .fillColor(VALUE)
          .font('Helvetica-Bold')
          .fontSize(9)
          .text(value, valueX, rowY + 3, {
            width: valueW,
            align: 'right',
            lineBreak: false,
            ellipsis: true,
          });
      }

      doc
        .moveTo(x + 12, rowY + 18)
        .lineTo(x + w - 12, rowY + 18)
        .strokeColor('#f3f4f6')
        .lineWidth(0.6)
        .stroke();
      rowY += rowH;
    }

    this.resetPageCursor(doc);
    return y + h + 10;
  }

  private drawMediaCard(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    w: number,
    imageCount: number,
    docCount: number,
  ): number {
    const headH = 26;
    const bodyH = 78;
    const h = headH + bodyH;

    doc.roundedRect(x, y, w, h, 10).fillAndStroke('#ffffff', CARD_BORDER);
    doc.save();
    doc.roundedRect(x, y, w, headH, 10).clip();
    doc.rect(x, y, w, headH + 6).fill('#eef3f9');
    doc.restore();
    doc
      .moveTo(x, y + headH)
      .lineTo(x + w, y + headH)
      .strokeColor('#e2e8f0')
      .lineWidth(0.8)
      .stroke();

    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .text('DOCUMENTS & MEDIA', x + 12, y + 9, {
        width: w - 24,
        lineBreak: false,
      });

    const boxGap = 8;
    const boxW = (w - 24 - boxGap) / 2;
    const boxH = 58;
    const boxY = y + headH + 10;

    this.drawMediaBox(
      doc,
      x + 12,
      boxY,
      boxW,
      boxH,
      'Images',
      imageCount > 0
        ? `${imageCount} image${imageCount === 1 ? '' : 's'} on file`
        : 'No images uploaded yet.',
    );
    this.drawMediaBox(
      doc,
      x + 12 + boxW + boxGap,
      boxY,
      boxW,
      boxH,
      'Documents',
      docCount > 0
        ? `${docCount} document${docCount === 1 ? '' : 's'} on file`
        : 'No documents uploaded yet.',
    );

    this.resetPageCursor(doc);
    return y + h + 10;
  }

  private drawMediaBox(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    w: number,
    h: number,
    title: string,
    msg: string,
  ) {
    doc
      .roundedRect(x, y, w, h, 8)
      .fillAndStroke('#fafbfd', '#d1d5db');

    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(8)
      .text(title.toUpperCase(), x + 4, y + 16, {
        width: w - 8,
        align: 'center',
        lineBreak: false,
      });
    doc
      .fillColor('#9ca3af')
      .font('Helvetica')
      .fontSize(7.5)
      .text(msg, x + 6, y + 32, {
        width: w - 12,
        align: 'center',
        lineBreak: false,
        ellipsis: true,
      });
  }

  private drawBizBar(
    doc: PDFKit.PDFDocument,
    branding: PrintBranding,
    y: number,
    contentW: number,
  ): number {
    const h = 40;
    const cellW = contentW / 3;
    const location =
      this.locationFromAddress(branding.addressLine) || '—';
    const phone = branding.phone || branding.ptcl || '—';
    const email = branding.email || '—';

    doc
      .moveTo(MARGIN, y)
      .lineTo(MARGIN + contentW, y)
      .strokeColor('#d1d5db')
      .lineWidth(1)
      .stroke();
    doc
      .moveTo(MARGIN, y + h)
      .lineTo(MARGIN + contentW, y + h)
      .strokeColor('#d1d5db')
      .lineWidth(1)
      .stroke();

    const cells: Array<[string, string]> = [
      [branding.name, location],
      ['Phone:', phone],
      ['Email:', email],
    ];

    cells.forEach(([title, sub], i) => {
      const cx = MARGIN + i * cellW;
      if (i > 0) {
        doc
          .moveTo(cx, y + 4)
          .lineTo(cx, y + h - 4)
          .strokeColor('#d1d5db')
          .lineWidth(0.8)
          .stroke();
      }
      doc
        .fillColor(NAVY)
        .font('Helvetica-Bold')
        .fontSize(9)
        .text(title, cx + 10, y + 8, {
          width: cellW - 18,
          lineBreak: false,
          ellipsis: true,
        });
      doc
        .fillColor('#4b5563')
        .font('Helvetica-Bold')
        .fontSize(8)
        .text(sub, cx + 10, y + 22, {
          width: cellW - 18,
          lineBreak: false,
          ellipsis: true,
        });
    });

    this.resetPageCursor(doc);
    return y + h + 10;
  }

  private drawNote(
    doc: PDFKit.PDFDocument,
    branding: PrintBranding,
    y: number,
    contentW: number,
  ): number {
    const h = 36;
    doc
      .roundedRect(MARGIN, y, contentW, h, 8)
      .fillAndStroke('#eff6ff', '#bfdbfe');

    doc
      .fillColor('#1e3a5f')
      .font('Helvetica')
      .fontSize(8.5)
      .text(
        `This is a system generated document from ${branding.name} fleet management system. All information shown here is accurate as per system records.`,
        MARGIN + 12,
        y + 10,
        { width: contentW - 24, lineBreak: false, ellipsis: true },
      );

    this.resetPageCursor(doc);
    return y + h + 8;
  }

  private drawSideRail(doc: PDFKit.PDFDocument) {
    doc.save();
    const text = 'DRIVEN BY TRUST / POWERED BY PEOPLE';
    doc
      .fillColor('#cbd5e1')
      .font('Helvetica-Bold')
      .fontSize(7)
      .rotate(-90, { origin: [PAGE_W - 10, PAGE_H / 2] })
      .text(text, PAGE_W - 10 - 90, PAGE_H / 2 - 4, {
        width: 180,
        align: 'center',
        lineBreak: false,
      });
    doc.restore();
    this.resetPageCursor(doc);
  }

  private drawMetaItem(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    w: number,
    label: string,
    value: string,
  ) {
    doc
      .fillColor(MUTED)
      .font('Helvetica-Bold')
      .fontSize(6.5)
      .text(label.toUpperCase(), x, y, {
        width: w,
        lineBreak: false,
        ellipsis: true,
      });
    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(9)
      .text(value, x, y + 12, {
        width: w,
        lineBreak: false,
        ellipsis: true,
      });
  }

  private drawStatusPill(
    doc: PDFKit.PDFDocument,
    status: VehicleStatus | string,
    x: number,
    y: number,
  ) {
    const active = status === VehicleStatus.ACTIVE || status === 'ACTIVE';
    const bg = active ? '#ecfdf5' : '#fef2f2';
    const fg = active ? '#059669' : '#dc2626';
    const border = active ? '#a7f3d0' : '#fecaca';
    const label = active ? 'Active' : 'Inactive';
    const w = 58;
    doc.roundedRect(x, y, w, 14, 7).fillAndStroke(bg, border);
    doc.circle(x + 8, y + 7, 2.2).fill(fg);
    doc
      .fillColor(fg)
      .font('Helvetica-Bold')
      .fontSize(7.5)
      .text(label, x + 14, y + 3.5, {
        width: w - 18,
        lineBreak: false,
      });
  }

  private drawDesigPill(
    doc: PDFKit.PDFDocument,
    label: string,
    x: number,
    y: number,
    w: number,
  ) {
    doc
      .roundedRect(x, y, w, 14, 7)
      .fillAndStroke('#f0fdf4', '#bbf7d0');
    doc
      .fillColor('#15803d')
      .font('Helvetica-Bold')
      .fontSize(7.5)
      .text(label, x, y + 3.5, {
        width: w,
        align: 'center',
        lineBreak: false,
        ellipsis: true,
      });
  }

  private drawTruckGlyph(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    size: number,
  ) {
    const cx = x + size / 2;
    const cy = y + size / 2;
    doc
      .roundedRect(cx - 12, cy - 8, 14, 10, 1.5)
      .strokeColor(NAVY)
      .lineWidth(1.4)
      .stroke();
    doc
      .moveTo(cx + 2, cy - 4)
      .lineTo(cx + 10, cy - 4)
      .lineTo(cx + 12, cy + 2)
      .lineTo(cx + 2, cy + 2)
      .strokeColor(NAVY)
      .lineWidth(1.4)
      .stroke();
    doc.circle(cx - 6, cy + 6, 2.5).strokeColor(NAVY).lineWidth(1.4).stroke();
    doc.circle(cx + 6, cy + 6, 2.5).strokeColor(NAVY).lineWidth(1.4).stroke();
  }

  private drawLogoFallback(
    doc: PDFKit.PDFDocument,
    name: string,
    x: number,
    y: number,
    size: number,
  ) {
    doc.roundedRect(x, y, size, size, 6).fillAndStroke('#eef2f7', CARD_BORDER);
    doc
      .fillColor(NAVY)
      .font('Helvetica-Bold')
      .fontSize(8)
      .text(name, x + 2, y + size / 2 - 6, {
        width: size - 4,
        align: 'center',
      });
  }

  private ownerLine(vehicle: VehiclePdfData, branding: PrintBranding): string {
    const owner = [vehicle.ownerFirstName, vehicle.ownerLastName]
      .filter(Boolean)
      .join(' ')
      .trim();
    const ownership =
      OWNERSHIP_LABELS[vehicle.ownership as VehicleOwnerShip] ??
      String(vehicle.ownership ?? '');
    const parts = [branding.name, ownership];
    if (owner) parts.unshift(owner);
    return parts.join(' · ');
  }

  private sizeCapacity(vehicle: VehiclePdfData): string {
    const size = vehicle.vehicleSize?.name?.trim();
    const cap = vehicle.vehicleCapacity?.name?.trim();
    if (size && cap) return `${size} / ${cap}`;
    return size || cap || '—';
  }

  private locationFromAddress(address?: string | null): string {
    const a = (address ?? '').trim();
    if (!a) return '';
    const parts = a
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    const skip = /^(pakistan|head office:?|office\b)/i;
    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i].replace(/^Head Office:\s*/i, '').trim();
      if (!part || skip.test(part)) continue;
      if (part.length <= 40) return part;
    }
    return parts[parts.length - 1] || a;
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
        'ZS Logistics Services',
      tagLine:
        (value.tagLine ?? '').trim() ||
        DEFAULT_BUSINESS_INFO.tagLine ||
        'Move today for a brighter tomorrow',
      addressLine:
        (value.address ?? '').trim() || DEFAULT_BUSINESS_INFO.address || '',
      phone: (value.phone ?? '').trim() || DEFAULT_BUSINESS_INFO.phone || '',
      ptcl: (value.ptcl ?? '').trim() || '',
      email: (value.email ?? '').trim() || DEFAULT_BUSINESS_INFO.email || '',
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

  private fmtPrintedOn(): string {
    const d = new Date();
    const date = d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
    const time = d.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${date} | ${time}`;
  }

  private resetPageCursor(doc: PDFKit.PDFDocument) {
    doc.x = MARGIN;
    doc.y = MARGIN;
  }
}
