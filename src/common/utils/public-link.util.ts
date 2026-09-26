import * as QRCode from 'qrcode';

/** Path segment under `{FRONTEND_URL}/public/...` and API `/public/...`. */
export type PublicResourceKind =
  | 'biltys'
  | 'client-invoices'
  | 'contra-vouchers'
  | 'expense-vouchers'
  | 'client-vouchers'
  | 'vendor-vouchers'
  | 'bilty-freights'
  | 'job-cards'
  | 'purchase-orders'
  | 'maintenance-vouchers';

export function frontendBaseUrl(): string {
  return (
    process.env.FRONTEND_URL ||
    process.env.APP_URL ||
    'http://localhost:5173'
  ).replace(/\/$/, '');
}

/** Frontend page URL encoded into the QR. */
export function buildPublicPageUrl(
  kind: PublicResourceKind,
  code: string,
): string {
  return `${frontendBaseUrl()}/public/${kind}/${encodeURIComponent(code)}`;
}

/** Relative API paths for QR PNG + public JSON. */
export function buildPublicApiLinks(
  kind: PublicResourceKind,
  code: string,
): { publicUrl: string; qrUrl: string; publicApiUrl: string } {
  const encoded = encodeURIComponent(code);
  return {
    publicUrl: buildPublicPageUrl(kind, code),
    qrUrl: `/public/${kind}/${encoded}/qr`,
    publicApiUrl: `/public/${kind}/${encoded}`,
  };
}

export async function buildPublicQrPngBuffer(
  kind: PublicResourceKind,
  code: string,
): Promise<Buffer> {
  return QRCode.toBuffer(buildPublicPageUrl(kind, code), {
    type: 'png',
    width: 256,
    margin: 1,
    errorCorrectionLevel: 'M',
  });
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseCodeOrId(codeOrId: string): {
  isUuid: boolean;
  key: string;
} {
  const key = codeOrId.trim();
  return { isUuid: UUID_RE.test(key), key };
}
