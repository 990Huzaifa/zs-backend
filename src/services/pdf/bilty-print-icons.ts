/**
 * Lucide / filled glyphs matching FE `printBilty.ts` (`I` + `IF`).
 * Drawn via PDFKit SVG path commands in a 24×24 viewBox.
 */

export type StrokeIconKind =
  | 'hash'
  | 'tag'
  | 'calendar'
  | 'file'
  | 'weight'
  | 'box'
  | 'user'
  | 'phone'
  | 'truck'
  | 'mapPin'
  | 'map'
  | 'mapFolded'
  | 'mail'
  | 'warehouse';

export type FillIconKind = 'user' | 'phone' | 'map' | 'mail' | 'truck' | 'file';

type CircleSpec = { cx: number; cy: number; r: number; fill?: boolean };
type RectSpec = { x: number; y: number; w: number; h: number; rx?: number };

type StrokeIcon = {
  paths: string[];
  circles?: CircleSpec[];
  rects?: RectSpec[];
};

type FillIcon = {
  paths: string[];
};

/** Outline icons — same path data as FE `const I`. */
const STROKE: Record<StrokeIconKind, StrokeIcon> = {
  hash: {
    paths: ['M4 9h16M4 15h16M10 3 8 21M16 3l-2 18'],
  },
  tag: {
    paths: [
      'M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z',
    ],
    circles: [{ cx: 7.5, cy: 7.5, r: 0.5, fill: true }],
  },
  calendar: {
    paths: [
      'M16 2v4M8 2v4M3 10h18',
      'M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01',
    ],
    rects: [{ x: 3, y: 4, w: 18, h: 18, rx: 2 }],
  },
  file: {
    paths: [
      'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z',
      'M14 2v6h6M16 13H8M16 17H8M10 9H8',
    ],
  },
  weight: {
    paths: ['M12 3v3M8.5 21h7l1.5-9h-10L8.5 21zM9 12l1.5-3h3L15 12'],
  },
  box: {
    paths: [
      'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z',
      'M3.27 6.96 12 12.01l8.73-5.05M12 22.08V12',
    ],
  },
  user: {
    paths: ['M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2'],
    circles: [{ cx: 12, cy: 7, r: 4 }],
  },
  phone: {
    paths: [
      'M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.35 1.9.67 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.32 1.85.54 2.81.67A2 2 0 0 1 22 16.92z',
    ],
  },
  truck: {
    paths: [
      'M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2',
      'M15 18H9',
      'M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14',
    ],
    circles: [
      { cx: 17, cy: 18, r: 2 },
      { cx: 7, cy: 18, r: 2 },
    ],
  },
  mapPin: {
    paths: ['M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z'],
    circles: [{ cx: 12, cy: 10, r: 3 }],
  },
  map: {
    paths: ['M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z'],
    circles: [{ cx: 12, cy: 10, r: 3 }],
  },
  mapFolded: {
    paths: [
      'M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z',
      'M15 5.764v15M9 3.236v15',
    ],
  },
  mail: {
    paths: ['m22 7-10 7L2 7'],
    rects: [{ x: 2, y: 4, w: 20, h: 16, rx: 2 }],
  },
  warehouse: {
    paths: [
      'M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z',
      'M6 18h12M6 14h12',
      'M10 22V12h4v10',
    ],
  },
};

/** Solid filled glyphs — same path data as FE `const IF`. */
const FILL: Record<FillIconKind, FillIcon> = {
  user: {
    paths: [
      'M12 12a4.5 4.5 0 1 0-4.5-4.5A4.5 4.5 0 0 0 12 12zm0 2c-4.42 0-8 2.24-8 5v1.5A.5.5 0 0 0 4.5 21h15a.5.5 0 0 0 .5-.5V19c0-2.76-3.58-5-8-5z',
    ],
  },
  phone: {
    paths: [
      'M6.62 10.79a15.15 15.15 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.07 21 3 13.93 3 5a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.46.57 3.58a1 1 0 0 1-.25 1.02l-2.2 2.19z',
    ],
  },
  map: {
    paths: [
      'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z',
    ],
  },
  mail: {
    paths: [
      'M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 4-8 5L4 8V6l8 5 8-5v2z',
    ],
  },
  truck: {
    paths: [
      'M18 7h-1V5a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h1.05a2.5 2.5 0 0 0 4.9 0h4.1a2.5 2.5 0 0 0 4.9 0H20a1 1 0 0 0 1-1v-4.17a1 1 0 0 0-.29-.71L18 7zM6.5 17.5a1 1 0 1 1 1-1 1 1 0 0 1-1 1zm10 0a1 1 0 1 1 1-1 1 1 0 0 1-1 1zM17 9.41 19.59 12H17V9.41z',
    ],
  },
  file: {
    paths: [
      'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11zM8 13h8v2H8v-2zm0 4h8v2H8v-2zm0-8h5v2H8V9z',
    ],
  },
};

const VIEW = 24;

/** Stroke Lucide icon (FE `I`) at top-left (x,y) with size×size. */
export function drawStrokeIcon(
  doc: PDFKit.PDFDocument,
  kind: StrokeIconKind,
  x: number,
  y: number,
  size: number,
  color: string,
) {
  const icon = STROKE[kind];
  if (!icon) return;
  const scale = size / VIEW;
  doc.save();
  doc.translate(x, y).scale(scale);
  doc
    .strokeColor(color)
    .fillColor(color)
    .lineWidth(1.75)
    .lineCap('round')
    .lineJoin('round');

  for (const p of icon.paths) {
    doc.path(p).stroke();
  }
  for (const r of icon.rects ?? []) {
    if (r.rx) {
      doc.roundedRect(r.x, r.y, r.w, r.h, r.rx).stroke();
    } else {
      doc.rect(r.x, r.y, r.w, r.h).stroke();
    }
  }
  for (const c of icon.circles ?? []) {
    if (c.fill) {
      doc.circle(c.cx, c.cy, c.r).fill(color);
    } else {
      doc.circle(c.cx, c.cy, c.r).stroke();
    }
  }
  doc.restore();
}

/** Filled glyph (FE `IF`) at top-left (x,y) with size×size. */
export function drawFillIcon(
  doc: PDFKit.PDFDocument,
  kind: FillIconKind,
  x: number,
  y: number,
  size: number,
  color: string,
) {
  const icon = FILL[kind];
  if (!icon) return;
  const scale = size / VIEW;
  doc.save();
  doc.translate(x, y).scale(scale);
  doc.fillColor(color);
  for (const p of icon.paths) {
    doc.path(p).fill(color);
  }
  doc.restore();
}

/** Navy circle badge with white filled glyph — FE `.banner-ico`. */
export function drawBannerBadge(
  doc: PDFKit.PDFDocument,
  kind: FillIconKind,
  x: number,
  y: number,
  size: number,
  bg = '#1A3C70',
) {
  const cx = x + size / 2;
  const cy = y + size / 2;
  doc.save();
  doc.circle(cx, cy, size / 2).fill(bg);
  const glyph = size * 0.55;
  drawFillIcon(doc, kind, cx - glyph / 2, cy - glyph / 2, glyph, '#FFFFFF');
  doc.restore();
}
