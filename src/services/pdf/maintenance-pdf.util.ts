import { Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import {
  BusinessInfoSettingValue,
  SystemSetting,
  SystemSettingKey,
} from '../../database/entities/system-setting.entity';

export const MAINT_NAVY = '#1A3C70';
export const MAINT_MUTED = '#6b7280';
export const MAINT_HEADER_BG = '#374151';
export const MAINT_PAGE_W = 595.28;
export const MAINT_PAGE_H = 841.89;
export const MAINT_MARGIN = 36;

export const DEFAULT_MAINT_BUSINESS_INFO: BusinessInfoSettingValue = {
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

export type MaintPrintBranding = {
  logoUrl: string;
  name: string;
  addressLine: string;
  phone: string;
  ptcl: string;
  email: string;
  contactLine: string;
};

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];
const TENS = [
  '',
  '',
  'Twenty',
  'Thirty',
  'Forty',
  'Fifty',
  'Sixty',
  'Seventy',
  'Eighty',
  'Ninety',
];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return `${TENS[t]}${o ? ` ${ONES[o]}` : ''}`.trim();
}

function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  if (h && r) return `${ONES[h]} Hundred ${twoDigits(r)}`;
  if (h) return `${ONES[h]} Hundred`;
  return twoDigits(r);
}

/** Convert integer amount to English words (western scale). */
export function amountInWords(amount: number): string {
  const n = Math.round(Math.abs(amount));
  if (n === 0) return 'Pak Rupees Zero Only';

  const billion = Math.floor(n / 1_000_000_000);
  const million = Math.floor((n % 1_000_000_000) / 1_000_000);
  const thousand = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;

  const parts: string[] = [];
  if (billion) parts.push(`${threeDigits(billion)} Billion`);
  if (million) parts.push(`${threeDigits(million)} Million`);
  if (thousand) parts.push(`${threeDigits(thousand)} Thousand`);
  if (rest) {
    if (parts.length) parts.push(`and ${threeDigits(rest)}`);
    else parts.push(threeDigits(rest));
  }

  return `Pak Rupees ${parts.join(' ')} Only`;
}

export function money(v?: string | number | null): string {
  if (v == null || v === '') return '0.00';
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString('en-PK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function moneyPk(v?: string | number | null): string {
  return `PKR ${money(v)}`;
}

export function dash(value?: string | number | null): string {
  if (value == null) return '—';
  const t = String(value).trim();
  return t || '—';
}

export function formatPrintDate(iso?: string | Date | null): string {
  if (!iso) return '—';
  try {
    const raw = iso instanceof Date ? iso.toISOString() : String(iso);
    const d = new Date(
      raw.includes('T') ? raw : `${raw.slice(0, 10)}T00:00:00`,
    );
    if (Number.isNaN(d.getTime())) return raw.slice(0, 10);
    return d
      .toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
      .toUpperCase();
  } catch {
    return String(iso).slice(0, 10);
  }
}

export function titleCaseLabel(value: string): string {
  return value
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export async function resolveMaintBranding(
  settingRepo: Repository<SystemSetting>,
): Promise<MaintPrintBranding> {
  const setting = await settingRepo.findOne({
    where: { key: SystemSettingKey.BUSINESS_INFO },
  });
  const value = {
    ...DEFAULT_MAINT_BUSINESS_INFO,
    ...((setting?.value as BusinessInfoSettingValue) ?? {}),
  };

  const phone = value.phone?.trim() || '';
  const ptcl = value.ptcl?.trim() || '';
  const email = value.email?.trim() || '';
  const contactParts = [phone || ptcl, email].filter(Boolean);

  return {
    logoUrl: value.logoUrl?.trim() || DEFAULT_MAINT_BUSINESS_INFO.logoUrl!,
    name: value.companyName?.trim() || DEFAULT_MAINT_BUSINESS_INFO.companyName!,
    addressLine: value.address?.trim() || '',
    phone,
    ptcl,
    email,
    contactLine: contactParts.join(' · '),
  };
}

export async function fetchLogoBuffer(
  logoUrl: string,
  logger: Logger,
): Promise<Buffer | null> {
  if (!logoUrl) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(logoUrl, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const arr = await res.arrayBuffer();
    return Buffer.from(arr);
  } catch (err) {
    logger.warn(
      `Failed to fetch logo for PDF: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

export function drawLogoFallback(
  doc: PDFKit.PDFDocument,
  name: string,
  x: number,
  y: number,
  size = 72,
) {
  const initials = (name || 'ZS').trim().slice(0, 2).toUpperCase();
  doc.roundedRect(x, y, size, size, 6).fill('#f3f4f6');
  doc
    .fillColor(MAINT_NAVY)
    .font('Helvetica-Bold')
    .fontSize(18)
    .text(initials, x, y + size / 2 - 9, {
      width: size,
      align: 'center',
    });
}

export function drawTableHeader(
  doc: PDFKit.PDFDocument,
  y: number,
  cols: { x: number; w: number; label: string; align?: 'left' | 'right' }[],
  rowH = 22,
) {
  const left = cols[0].x;
  const right = cols[cols.length - 1].x + cols[cols.length - 1].w;
  doc.rect(left, y, right - left, rowH).fill(MAINT_HEADER_BG);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9);
  for (const col of cols) {
    doc.text(col.label, col.x + 6, y + 7, {
      width: col.w - 12,
      align: col.align ?? 'left',
    });
  }
  return y + rowH;
}
