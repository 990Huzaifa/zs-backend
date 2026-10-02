import * as bwipjs from 'bwip-js';

/** Code 128 barcode PNG encoding the given text (e.g. bilty code). */
export async function buildCode128PngBuffer(
  text: string,
  options?: {
    scale?: number;
    height?: number;
    includetext?: boolean;
  },
): Promise<Buffer> {
  const value = text?.trim();
  if (!value) {
    throw new Error('Barcode text is required');
  }

  return bwipjs.toBuffer({
    bcid: 'code128',
    text: value,
    scale: options?.scale ?? 3,
    height: options?.height ?? 12,
    includetext: options?.includetext ?? false,
    textxalign: 'center',
    backgroundcolor: 'FFFFFF',
    barcolor: '1A3C70',
  });
}
