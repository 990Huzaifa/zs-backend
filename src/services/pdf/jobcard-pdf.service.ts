import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import PDFDocument from 'pdfkit';
import { Repository } from 'typeorm';
import { buildPublicQrPngBuffer } from '../../common/utils/public-link.util';
import {
  JobCard,
  JobCardFindingStatus,
  JobCardPriority,
  JobCardStatus,
  MaintenanceType,
} from '../../database/entities/maintenance/jobcard.entity';
import { SystemSetting } from '../../database/entities/system-setting.entity';
import {
  dash,
  drawLogoFallback,
  drawTableHeader,
  fetchLogoBuffer,
  formatPrintDate,
  MAINT_MARGIN,
  MAINT_MUTED,
  MAINT_NAVY,
  MAINT_PAGE_H,
  MAINT_PAGE_W,
  MaintPrintBranding,
  resolveMaintBranding,
  titleCaseLabel,
} from './maintenance-pdf.util';

const STATUS_LABELS: Record<JobCardStatus, string> = {
  [JobCardStatus.DRAFT]: 'Draft',
  [JobCardStatus.OPEN]: 'Open',
  [JobCardStatus.IN_PROGRESS]: 'In Progress',
  [JobCardStatus.ON_HOLD]: 'On Hold',
  [JobCardStatus.COMPLETED]: 'Completed',
  [JobCardStatus.CANCELLED]: 'Cancelled',
};

const PRIORITY_LABELS: Record<JobCardPriority, string> = {
  [JobCardPriority.LOW]: 'Low',
  [JobCardPriority.MEDIUM]: 'Medium',
  [JobCardPriority.HIGH]: 'High',
  [JobCardPriority.CRITICAL]: 'Critical',
};

const PRIORITY_COLORS: Record<JobCardPriority, string> = {
  [JobCardPriority.LOW]: '#0d9488',
  [JobCardPriority.MEDIUM]: '#d97706',
  [JobCardPriority.HIGH]: '#b45309',
  [JobCardPriority.CRITICAL]: '#7c3aed',
};

const TYPE_LABELS: Record<MaintenanceType, string> = {
  [MaintenanceType.SCHEDULED]: 'Scheduled',
  [MaintenanceType.UNPLANNED]: 'Unplanned',
};

const FINDING_STATUS_LABELS: Record<JobCardFindingStatus, string> = {
  [JobCardFindingStatus.OPEN]: 'Open',
  [JobCardFindingStatus.IN_PROGRESS]: 'In Progress',
  [JobCardFindingStatus.RESOLVED]: 'Resolved',
  [JobCardFindingStatus.DEFERRED]: 'Deferred',
  [JobCardFindingStatus.CANCELLED]: 'Cancelled',
};

const WATERMARK_COLORS: Record<JobCardStatus, string> = {
  [JobCardStatus.DRAFT]: '#1A3C701A',
  [JobCardStatus.OPEN]: '#1D4ED81F',
  [JobCardStatus.IN_PROGRESS]: '#B453091F',
  [JobCardStatus.ON_HOLD]: '#6D28D91F',
  [JobCardStatus.COMPLETED]: '#0596691F',
  [JobCardStatus.CANCELLED]: '#6B728024',
};

export type JobCardPdfResult = {
  buffer: Buffer;
  filename: string;
  jobCardNo: string;
};

@Injectable()
export class JobCardPdfService {
  private readonly logger = new Logger(JobCardPdfService.name);

  constructor(
    @InjectRepository(JobCard)
    private readonly jobCardRepo: Repository<JobCard>,
    @InjectRepository(SystemSetting)
    private readonly settingRepo: Repository<SystemSetting>,
  ) {}

  async generateById(id: string): Promise<JobCardPdfResult> {
    const jobCard = await this.load({ id });
    if (!jobCard) throw new NotFoundException('Job card not found');
    return this.renderPdf(jobCard);
  }

  async generateByCodeOrId(codeOrId: string): Promise<JobCardPdfResult> {
    const key = codeOrId.trim();
    if (!key) throw new NotFoundException('Job card not found');

    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    const jobCard = uuidRe.test(key)
      ? await this.load({ id: key })
      : await this.load({ jobCardNo: key.toUpperCase() });

    if (!jobCard) throw new NotFoundException('Job card not found');
    return this.renderPdf(jobCard);
  }

  private async renderPdf(jobCard: JobCard): Promise<JobCardPdfResult> {
    try {
      const branding = await resolveMaintBranding(this.settingRepo);
      const qrPng = await buildPublicQrPngBuffer(
        'job-cards',
        jobCard.jobCardNo || jobCard.id,
      );
      const logoBuf = await fetchLogoBuffer(branding.logoUrl, this.logger);

      const buffer = await new Promise<Buffer>((resolve, reject) => {
        const doc = new PDFDocument({
          size: 'A4',
          margin: MAINT_MARGIN,
          info: {
            Title: `Job Card ${jobCard.jobCardNo}`,
            Author: branding.name,
          },
        });
        const chunks: Buffer[] = [];
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        this.drawPage(doc, jobCard, branding, qrPng, logoBuf);
        doc.end();
      });

      return {
        buffer,
        filename: `job-card-${jobCard.jobCardNo}.pdf`,
        jobCardNo: jobCard.jobCardNo,
      };
    } catch (err) {
      this.logger.error(
        `Failed to generate job card PDF for ${jobCard.jobCardNo}`,
        err instanceof Error ? err.stack : String(err),
      );
      throw new InternalServerErrorException('Failed to generate job card PDF');
    }
  }

  private drawPage(
    doc: PDFKit.PDFDocument,
    jc: JobCard,
    branding: MaintPrintBranding,
    qrPng: Buffer,
    logoBuf: Buffer | null,
  ) {
    const contentW = MAINT_PAGE_W - MAINT_MARGIN * 2;
    const statusLabel = STATUS_LABELS[jc.status] ?? titleCaseLabel(jc.status);

    this.drawWatermark(doc, statusLabel, jc.status);

    // Header: logo | title | QR
    const headerTop = MAINT_MARGIN;
    if (logoBuf) {
      try {
        doc.image(logoBuf, MAINT_MARGIN, headerTop, {
          fit: [72, 72],
          align: 'center',
          valign: 'center',
        });
      } catch {
        drawLogoFallback(doc, branding.name, MAINT_MARGIN, headerTop);
      }
    } else {
      drawLogoFallback(doc, branding.name, MAINT_MARGIN, headerTop);
    }

    doc
      .fillColor(MAINT_NAVY)
      .font('Helvetica-Bold')
      .fontSize(26)
      .text('Job Card', MAINT_MARGIN + 80, headerTop + 28, {
        width: contentW - 170,
        align: 'center',
      });

    const qrX = MAINT_PAGE_W - MAINT_MARGIN - 72;
    doc.image(qrPng, qrX, headerTop, { width: 72, height: 72 });

    let y = headerTop + 78;
    doc
      .fillColor(MAINT_MUTED)
      .font('Helvetica')
      .fontSize(10)
      .text(`Date `, MAINT_MARGIN, y, { continued: true })
      .fillColor('#111827')
      .font('Helvetica-Bold')
      .text(formatPrintDate(jc.createdAt));

    doc
      .fillColor(MAINT_NAVY)
      .font('Helvetica-Bold')
      .fontSize(10)
      .text(jc.jobCardNo, qrX - 4, y, { width: 80, align: 'center' });

    y += 18;
    doc
      .moveTo(MAINT_MARGIN, y)
      .lineTo(MAINT_PAGE_W - MAINT_MARGIN, y)
      .strokeColor('#e5e7eb')
      .lineWidth(1)
      .stroke();

    // Parties
    y += 14;
    const partyW = (contentW - 12) / 2;
    const vehicleLabel = this.vehicleLabel(jc);
    this.drawPartyBox(doc, MAINT_MARGIN, y, partyW, 'Vehicle', vehicleLabel, [
      `Odometer: ${
        jc.odometerReading != null
          ? `${Number(jc.odometerReading).toLocaleString('en-US')} km`
          : '—'
      }`,
      `Driver: ${dash(jc.driver?.name)}`,
    ]);
    this.drawPartyBox(
      doc,
      MAINT_MARGIN + partyW + 12,
      y,
      partyW,
      'Job details',
      dash(jc.jobCardTitle),
      [
        `Type: ${TYPE_LABELS[jc.maintenanceType] ?? titleCaseLabel(jc.maintenanceType)}`,
        `Reported by: ${dash(jc.reportedBy?.name)}`,
      ],
    );
    y += 92;

    // Priority row
    doc
      .fillColor('#374151')
      .font('Helvetica-Bold')
      .fontSize(9)
      .text('PRIORITY', MAINT_MARGIN, y + 4);
    let px = MAINT_MARGIN + 58;
    const levels: JobCardPriority[] = [
      JobCardPriority.LOW,
      JobCardPriority.MEDIUM,
      JobCardPriority.HIGH,
      JobCardPriority.CRITICAL,
    ];
    for (const level of levels) {
      const on = level === jc.priority;
      const color = PRIORITY_COLORS[level];
      const label = PRIORITY_LABELS[level];
      const bw = 68;
      doc
        .roundedRect(px, y, bw, 18, 4)
        .lineWidth(1)
        .strokeColor(color)
        .stroke();
      if (on) {
        doc.roundedRect(px, y, bw, 18, 4).fillOpacity(0.08).fill(color);
        doc.fillOpacity(1);
      }
      doc
        .fillColor(color)
        .font(on ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(8)
        .text(`${on ? '✓ ' : ''}${label}`, px, y + 5, {
          width: bw,
          align: 'center',
        });
      px += bw + 6;
    }
    y += 28;

    // Findings table
    const cols = [
      { x: MAINT_MARGIN, w: contentW * 0.55, label: 'Finding / description' },
      {
        x: MAINT_MARGIN + contentW * 0.55,
        w: contentW * 0.2,
        label: 'Status',
      },
      {
        x: MAINT_MARGIN + contentW * 0.75,
        w: contentW * 0.25,
        label: 'Resolution notes',
      },
    ];
    y = drawTableHeader(doc, y, cols);

    const items = jc.items ?? [];
    if (!items.length) {
      doc
        .fillColor(MAINT_MUTED)
        .font('Helvetica')
        .fontSize(10)
        .text('No findings recorded', MAINT_MARGIN + 6, y + 10);
      y += 28;
    } else {
      items.forEach((it, i) => {
        if (y > MAINT_PAGE_H - 160) {
          doc.addPage({ size: 'A4', margin: MAINT_MARGIN });
          y = MAINT_MARGIN;
          y = drawTableHeader(doc, y, cols);
        }
        const title = `${i + 1}. ${it.title || '—'}`;
        const desc = it.description?.trim() || '';
        const status =
          FINDING_STATUS_LABELS[it.status] ?? titleCaseLabel(it.status);
        const notes = it.resolutionNotes?.trim() || '—';

        const titleH = doc.heightOfString(title, {
          width: cols[0].w - 12,
        });
        const descH = desc
          ? doc.heightOfString(desc, { width: cols[0].w - 12 })
          : 0;
        const notesH = doc.heightOfString(notes, { width: cols[2].w - 12 });
        const rowH = Math.max(22, titleH + descH + 10, notesH + 10);

        if (i % 2 === 1) {
          doc
            .rect(MAINT_MARGIN, y, contentW, rowH)
            .fill('#f9fafb');
        }

        doc
          .fillColor('#111827')
          .font('Helvetica')
          .fontSize(10)
          .text(title, cols[0].x + 6, y + 5, { width: cols[0].w - 12 });
        if (desc) {
          doc
            .fillColor(MAINT_MUTED)
            .fontSize(8)
            .text(desc, cols[0].x + 6, y + 5 + titleH, {
              width: cols[0].w - 12,
            });
        }
        doc
          .fillColor('#111827')
          .fontSize(10)
          .text(status, cols[1].x + 6, y + 5, { width: cols[1].w - 12 });
        doc.text(notes, cols[2].x + 6, y + 5, { width: cols[2].w - 12 });

        doc
          .moveTo(MAINT_MARGIN, y + rowH)
          .lineTo(MAINT_PAGE_W - MAINT_MARGIN, y + rowH)
          .strokeColor('#e5e7eb')
          .lineWidth(0.5)
          .stroke();
        y += rowH;
      });
    }

    // Footer grid
    y += 16;
    const leftW = contentW * 0.55;
    const rightX = MAINT_MARGIN + leftW + 16;
    const rightW = contentW - leftW - 16;

    doc
      .fillColor('#111827')
      .font('Helvetica-Bold')
      .fontSize(10)
      .text('Remarks', MAINT_MARGIN, y);
    doc
      .fillColor('#4b5563')
      .font('Helvetica')
      .fontSize(9)
      .text(dash(jc.remarks), MAINT_MARGIN, y + 14, { width: leftW });

    doc
      .fillColor('#111827')
      .font('Helvetica-Bold')
      .fontSize(10)
      .text('Lifecycle', rightX, y);
    const life = [
      ['Reported', formatPrintDate(jc.reportedAt)],
      ['Started', formatPrintDate(jc.startedAt)],
      ['Completed', formatPrintDate(jc.completedAt)],
    ];
    let ly = y + 14;
    for (const [k, v] of life) {
      doc
        .fillColor('#374151')
        .font('Helvetica')
        .fontSize(9)
        .text(k, rightX, ly, { width: rightW * 0.45, continued: false });
      doc.text(v, rightX + rightW * 0.45, ly, {
        width: rightW * 0.55,
        align: 'right',
      });
      ly += 14;
    }

    ly += 28;
    doc
      .moveTo(rightX + rightW - 140, ly)
      .lineTo(rightX + rightW, ly)
      .strokeColor('#9ca3af')
      .lineWidth(1)
      .stroke();
    doc
      .fillColor(MAINT_MUTED)
      .font('Helvetica')
      .fontSize(9)
      .text('Authorized Signature', rightX + rightW - 140, ly + 6, {
        width: 140,
        align: 'center',
      });

    // Business footer
    const footerY = MAINT_PAGE_H - MAINT_MARGIN - 40;
    doc
      .moveTo(MAINT_MARGIN, footerY)
      .lineTo(MAINT_PAGE_W - MAINT_MARGIN, footerY)
      .strokeColor('#e5e7eb')
      .lineWidth(1)
      .stroke();
    doc
      .fillColor('#111827')
      .font('Helvetica-Bold')
      .fontSize(10)
      .text(branding.name.toUpperCase(), MAINT_MARGIN, footerY + 8);
    if (branding.addressLine) {
      doc
        .fillColor(MAINT_MUTED)
        .font('Helvetica')
        .fontSize(8)
        .text(branding.addressLine, MAINT_MARGIN, footerY + 22, {
          width: contentW * 0.7,
        });
    }
    if (branding.contactLine) {
      doc
        .fillColor(MAINT_MUTED)
        .fontSize(8)
        .text(branding.contactLine, MAINT_MARGIN, footerY + 34, {
          width: contentW * 0.7,
        });
    }
  }

  private drawWatermark(
    doc: PDFKit.PDFDocument,
    label: string,
    status: JobCardStatus,
  ) {
    const color = WATERMARK_COLORS[status] ?? '#1A3C701A';
    doc.save();
    doc
      .fillColor(color)
      .font('Helvetica-Bold')
      .fontSize(64)
      .opacity(0.55);
    doc.rotate(-28, { origin: [MAINT_PAGE_W / 2, MAINT_PAGE_H / 2] });
    doc.text(label.toUpperCase(), 40, MAINT_PAGE_H / 2 - 20, {
      width: MAINT_PAGE_W - 80,
      align: 'center',
    });
    doc.restore();
    doc.opacity(1);
  }

  private drawPartyBox(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    w: number,
    label: string,
    title: string,
    lines: string[],
  ) {
    doc.roundedRect(x, y, w, 84, 6).fill('#f3f4f6');
    doc
      .fillColor(MAINT_MUTED)
      .font('Helvetica-Bold')
      .fontSize(8)
      .text(label.toUpperCase(), x + 12, y + 10);
    doc
      .fillColor('#111827')
      .font('Helvetica-Bold')
      .fontSize(11)
      .text(title, x + 12, y + 24, { width: w - 24 });
    let ly = y + 42;
    doc.fillColor('#374151').font('Helvetica').fontSize(9);
    for (const line of lines) {
      doc.text(line, x + 12, ly, { width: w - 24 });
      ly += 13;
    }
  }

  private vehicleLabel(jc: JobCard): string {
    const v = jc.vehicle;
    if (!v) return '—';
    return v.regNo?.trim() || '—';
  }

  private async load(
    where: { id: string } | { jobCardNo: string },
  ): Promise<JobCard | null> {
    return this.jobCardRepo.findOne({
      where,
      relations: {
        vehicle: true,
        driver: true,
        reportedBy: true,
        items: true,
      },
      order: { items: { createdAt: 'ASC' } },
    });
  }
}
