export const limits = {
  pdfSizeBytes: 25 * 1024 * 1024,
  pdfPages: 200,
  signersPerDocument: 10,
  fieldsPerDocument: 300,
  fieldsPerPage: 40,
  signatureFieldMinPt: { w: 60, h: 20 },
  initialsFieldMinPt: { w: 24, h: 16 },
  drawnStrokes: 64,
  drawnPoints: 8_000,
  strokeCoordMax: 10_000,
  strokesBase64MaxChars: 48 * 1024,
  typedSignatureChars: 64,
  /** A stamp or image signature, as base64 of a small PNG (about 30 KB of bytes). */
  imageBase64MaxChars: 40 * 1024,
  imageMaxPx: { w: 600, h: 240 },
  textFieldChars: 240,
  fieldLabelChars: 60,
  templatesPerOwner: 100,
  requestBodyBytes: 128 * 1024,
  pageExtentMaxPt: 14_400,
  micro: 1_000_000,
} as const;

export type FieldKind =
  | 'signature'
  | 'initials'
  | 'date_signed'
  | 'full_name'
  | 'text'
  | 'checkbox'
  | 'prefilled_text';

export function minFieldSizePt(
  kind: FieldKind,
): { w: number; h: number } | null {
  if (kind === 'signature') return limits.signatureFieldMinPt;
  if (kind === 'initials') return limits.initialsFieldMinPt;
  return null;
}
