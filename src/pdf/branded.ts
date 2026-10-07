import {
  degrees,
  type PDFDocument,
  type PDFFont,
  type PDFPage,
  rgb,
  StandardFonts,
} from 'pdf-lib';
import { create as createQr } from 'qrcode';

import {
  clampMicro,
  type PageGeometry,
  viewMicroToPdf,
  viewSize,
} from '#/core/coords.ts';
import type { LocalManifest } from '#/features/sign/manifest.ts';
import { safeText as safe } from '#/pdf/text.ts';

/**
 * Renderer 1.1.0: the certificate page and the page footer.
 * Everything here is deterministic: no clock, no random, no fonts from the network.
 * The colors are the light values of the design tokens in DESIGN.md.
 */

const hex = (value: string) =>
  rgb(
    Number.parseInt(value.slice(1, 3), 16) / 255,
    Number.parseInt(value.slice(3, 5), 16) / 255,
    Number.parseInt(value.slice(5, 7), 16) / 255,
  );

const C = {
  brand: hex('#1a7cb5'),
  brandBg: hex('#e3f2fa'),
  brandFg: hex('#0e5a85'),
  brandSoft: hex('#9fd0ea'),
  ink: hex('#10303f'),
  muted: hex('#456072'),
  subtle: hex('#5a7184'),
  border: hex('#dbe6ee'),
  well: hex('#edf3f7'),
  desk: hex('#f5f8fa'),
  success: hex('#1d7a4b'),
  successBg: hex('#e2f4ea'),
  successFg: hex('#14603a'),
  white: rgb(1, 1, 1),
} as const;

const W = 595;
const H = 842;
const M = 44;
const CW = W - M * 2;
const BOTTOM = 56;

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** 6 Oct 2026, 21:48:26 UTC. Fixed zone and format, so it never depends on the machine. */
export function formatCertificateTime(ms: number): string {
  const d = new Date(ms);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${two(d.getUTCHours())}:${two(d.getUTCMinutes())}:${two(d.getUTCSeconds())} UTC`;
}

type Fonts = { regular: PDFFont; bold: PDFFont; mono: PDFFont };

async function embedFonts(pdf: PDFDocument): Promise<Fonts> {
  return {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    mono: await pdf.embedFont(StandardFonts.Courier),
  };
}

function wrap(
  font: PDFFont,
  value: string,
  size: number,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = safe(font, value).split(' ').filter(Boolean);
  const lines: string[] = [];
  let line = '';
  const push = (next: string) => {
    lines.push(next);
    line = '';
  };
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) push(line);
    let rest = word;
    while (font.widthOfTextAtSize(rest, size) > maxWidth && rest.length > 1) {
      let cut = rest.length - 1;
      while (
        cut > 1 &&
        font.widthOfTextAtSize(rest.slice(0, cut), size) > maxWidth
      ) {
        cut -= 1;
      }
      push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    line = rest;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1] ?? '';
    while (
      last.length > 1 &&
      font.widthOfTextAtSize(`${last}...`, size) > maxWidth
    ) {
      last = last.slice(0, -1);
    }
    kept[maxLines - 1] = `${last}...`;
    return kept;
  }
  return lines.length ? lines : [''];
}

function roundedPath(w: number, h: number, r: number): string {
  const k = r * 0.5523;
  return [
    `M ${r} 0`,
    `L ${w - r} 0`,
    `C ${w - r + k} 0 ${w} ${r - k} ${w} ${r}`,
    `L ${w} ${h - r}`,
    `C ${w} ${h - r + k} ${w - r + k} ${h} ${w - r} ${h}`,
    `L ${r} ${h}`,
    `C ${r - k} ${h} 0 ${h - r + k} 0 ${h - r}`,
    `L 0 ${r}`,
    `C 0 ${r - k} ${r - k} 0 ${r} 0`,
    'Z',
  ].join(' ');
}

type Paint = {
  fill?: ReturnType<typeof rgb>;
  stroke?: ReturnType<typeof rgb>;
  width?: number;
  opacity?: number;
};

class Sheet {
  readonly pages: PDFPage[] = [];
  page!: PDFPage;
  /** Distance from the top of the page, in points. */
  y = 0;

  constructor(
    readonly pdf: PDFDocument,
    readonly fonts: Fonts,
  ) {}

  addPage(): void {
    this.page = this.pdf.addPage([W, H]);
    this.pages.push(this.page);
  }

  /** Starts a new page when the next block of this height would run into the footer. */
  ensure(height: number): void {
    if (this.y + height <= H - BOTTOM) return;
    this.addPage();
    this.continuation();
  }

  rect(
    x: number,
    top: number,
    w: number,
    h: number,
    r: number,
    paint: Paint,
  ): void {
    const options: Parameters<PDFPage['drawSvgPath']>[1] = { x, y: H - top };
    if (paint.fill) options.color = paint.fill;
    if (paint.stroke) {
      options.borderColor = paint.stroke;
      options.borderWidth = paint.width ?? 0.8;
    }
    if (paint.opacity !== undefined) options.opacity = paint.opacity;
    this.page.drawSvgPath(roundedPath(w, h, r), options);
  }

  line(
    x1: number,
    x2: number,
    top: number,
    color = C.border,
    width = 0.8,
  ): void {
    this.page.drawLine({
      start: { x: x1, y: H - top },
      end: { x: x2, y: H - top },
      thickness: width,
      color,
    });
  }

  text(
    value: string,
    x: number,
    baseline: number,
    size: number,
    font: PDFFont,
    color: ReturnType<typeof rgb>,
    opacity?: number,
  ): void {
    this.page.drawText(safe(font, value), {
      x,
      y: H - baseline,
      size,
      font,
      color,
      ...(opacity !== undefined ? { opacity } : {}),
    });
  }

  textRight(
    value: string,
    right: number,
    baseline: number,
    size: number,
    font: PDFFont,
    color: ReturnType<typeof rgb>,
  ): void {
    const clean = safe(font, value);
    this.text(
      clean,
      right - font.widthOfTextAtSize(clean, size),
      baseline,
      size,
      font,
      color,
    );
  }

  tick(
    cx: number,
    cyTop: number,
    size: number,
    color: ReturnType<typeof rgb>,
    width = 1.4,
  ): void {
    const a = { x: cx - size * 0.42, y: H - (cyTop + size * 0.02) };
    const b = { x: cx - size * 0.1, y: H - (cyTop + size * 0.34) };
    const c = { x: cx + size * 0.46, y: H - (cyTop - size * 0.34) };
    this.page.drawLine({ start: a, end: b, thickness: width, color });
    this.page.drawLine({ start: b, end: c, thickness: width, color });
  }

  mark(
    x: number,
    top: number,
    size: number,
    fill: ReturnType<typeof rgb>,
    ink: ReturnType<typeof rgb>,
  ): void {
    this.rect(x, top, size, size, size * 0.27, { fill });
    const label = 'D';
    const fontSize = size * 0.55;
    const width = this.fonts.bold.widthOfTextAtSize(label, fontSize);
    this.text(
      label,
      x + (size - width) / 2,
      top + size * 0.68,
      fontSize,
      this.fonts.bold,
      ink,
    );
  }

  private continuation(): void {
    this.mark(M, 34, 22, C.brand, C.white);
    this.text(
      'Certificate of completion',
      M + 32,
      50,
      11.5,
      this.fonts.bold,
      C.ink,
    );
    this.text(
      'continued',
      M +
        32 +
        this.fonts.bold.widthOfTextAtSize('Certificate of completion', 11.5) +
        8,
      50,
      9.5,
      this.fonts.regular,
      C.subtle,
    );
    this.line(M, W - M, 68);
    this.y = 92;
  }
}

function cover(sheet: Sheet, completedAt: number): void {
  const { fonts } = sheet;
  const page = sheet.page;
  page.drawRectangle({
    x: 0,
    y: H - 124,
    width: W,
    height: 124,
    color: C.brand,
  });
  page.drawCircle({
    x: W - 36,
    y: H - 8,
    size: 112,
    color: C.white,
    opacity: 0.1,
  });
  page.drawCircle({
    x: W - 150,
    y: H - 140,
    size: 66,
    color: C.white,
    opacity: 0.07,
  });
  sheet.mark(M, 26, 30, C.white, C.brand);
  sheet.text('DigiSign', M + 40, 47, 17, fonts.bold, C.white);

  const label = 'Completed';
  const labelWidth = fonts.bold.widthOfTextAtSize(label, 9.5);
  const pillW = labelWidth + 38;
  sheet.rect(W - M - pillW, 29, pillW, 24, 12, { fill: C.white, opacity: 0.2 });
  sheet.tick(W - M - pillW + 15, 41, 9, C.white, 1.5);
  sheet.text(label, W - M - pillW + 26, 44.5, 9.5, fonts.bold, C.white);

  sheet.text('Certificate of completion', M, 90, 27, fonts.bold, C.white);
  sheet.text(
    `Issued by DigiSign when the last signature was recorded, ${formatCertificateTime(completedAt)}.`,
    M,
    109,
    9.5,
    fonts.regular,
    C.white,
    0.9,
  );
  sheet.y = 152;
}

function documentBlock(sheet: Sheet, manifest: LocalManifest): void {
  const { fonts } = sheet;
  sheet.text('DOCUMENT', M, sheet.y + 7, 8, fonts.bold, C.subtle);
  sheet.y += 12;
  const lines = wrap(fonts.bold, manifest.title || 'Document', 19, CW, 2);
  for (const line of lines) {
    sheet.y += 25;
    sheet.text(line, M, sheet.y - 4, 19, fonts.bold, C.ink);
  }
  sheet.y += 14;
  sheet.text('ID', M, sheet.y, 8.5, fonts.regular, C.subtle);
  sheet.text(manifest.documentId, M + 16, sheet.y, 8.5, fonts.mono, C.muted);
  sheet.y += 16;

  const top = sheet.y;
  sheet.rect(M, top, CW, 50, 10, { fill: C.white, stroke: C.border });
  const cell = CW / 3;
  const count = manifest.signers.length;
  const pages = manifest.geometry.length;
  const facts: [string, string][] = [
    ['COMPLETED', formatCertificateTime(manifest.completedAt)],
    ['SIGNERS', `${count} of ${count} signed`],
    ['PAGES', `${pages} ${pages === 1 ? 'page' : 'pages'}, signed copy`],
  ];
  facts.forEach(([name, value], index) => {
    const x = M + cell * index + 16;
    sheet.text(name, x, top + 19, 7.5, fonts.bold, C.subtle);
    sheet.text(value, x, top + 37, 10.5, fonts.bold, C.ink);
    if (index > 0) {
      sheet.page.drawLine({
        start: { x: M + cell * index, y: H - (top + 11) },
        end: { x: M + cell * index, y: H - (top + 39) },
        thickness: 0.8,
        color: C.border,
      });
    }
  });
  sheet.y = top + 50 + 24;
}

function signatures(sheet: Sheet, manifest: LocalManifest): void {
  const { fonts } = sheet;
  sheet.ensure(40 + 38);
  sheet.text('Signatures', M, sheet.y + 12, 13, fonts.bold, C.ink);
  sheet.text(
    'Signed in this order. Each person used a private link, so no account was needed.',
    M,
    sheet.y + 27,
    9,
    fonts.regular,
    C.muted,
  );
  sheet.y += 38;
  const total = manifest.signers.length;
  const ordered = [...manifest.signers].sort((a, b) => a.order - b.order);
  sheet.line(M, W - M, sheet.y);
  for (const [index, signer] of ordered.entries()) {
    sheet.ensure(38);
    const top = sheet.y;
    sheet.page.drawCircle({
      x: M + 14,
      y: H - (top + 19),
      size: 12,
      color: C.brandBg,
    });
    const num = String(index + 1);
    const numW = fonts.bold.widthOfTextAtSize(num, 10.5);
    sheet.text(num, M + 14 - numW / 2, top + 22.5, 10.5, fonts.bold, C.brandFg);
    const nameLines = wrap(
      fonts.bold,
      signer.name || 'Signer',
      11.5,
      CW - 36 - 190,
      1,
    );
    sheet.text(nameLines[0] ?? '', M + 38, top + 18, 11.5, fonts.bold, C.ink);
    sheet.text(
      `Signer ${index + 1} of ${total}`,
      M + 38,
      top + 31,
      8.5,
      fonts.regular,
      C.subtle,
    );
    sheet.textRight(
      formatCertificateTime(signer.signedAt),
      W - M - 4,
      top + 17,
      9.5,
      fonts.regular,
      C.ink,
    );
    const pillW = 52;
    const pillX = W - M - 4 - pillW;
    sheet.rect(pillX, top + 21, pillW, 14, 7, { fill: C.successBg });
    sheet.tick(pillX + 11, top + 28, 6.5, C.success, 1.2);
    sheet.text('Signed', pillX + 19, top + 31, 8, fonts.bold, C.successFg);
    sheet.y = top + 38;
    sheet.line(M, W - M, sheet.y);
  }
  sheet.y += 24;
}

function qrBlock(sheet: Sheet, verifyUrl: string): void {
  const { fonts } = sheet;
  const height = 122;
  sheet.ensure(height + 24);
  const top = sheet.y;
  sheet.rect(M, top, CW, height, 12, { fill: C.brandBg, stroke: C.brandSoft });
  sheet.rect(M + 15, top + 15, 92, 92, 8, { fill: C.white });
  const qr = createQr(verifyUrl, { errorCorrectionLevel: 'M', maskPattern: 0 });
  const size = qr.modules.size;
  const cell = 76 / size;
  const originX = M + 23;
  const originTop = top + 23;
  for (let row = 0; row < size; row += 1) {
    let col = 0;
    while (col < size) {
      if (!qr.modules.data[row * size + col]) {
        col += 1;
        continue;
      }
      let end = col;
      while (end < size && qr.modules.data[row * size + end]) end += 1;
      sheet.page.drawRectangle({
        x: originX + col * cell,
        y: H - (originTop + (row + 1) * cell),
        width: (end - col) * cell + 0.1,
        height: cell + 0.1,
        color: C.ink,
      });
      col = end;
    }
  }
  const x = M + 130;
  const width = CW - 130 - 18;
  sheet.text('Check this file', x, top + 30, 14, fonts.bold, C.brandFg);
  const body = wrap(
    fonts.regular,
    'Scan the code, or open the address below, then drop this PDF on the page. DigiSign compares it with the signed record.',
    9.5,
    width,
    3,
  );
  body.forEach((line, index) => {
    sheet.text(line, x, top + 47 + index * 13, 9.5, fonts.regular, C.ink);
  });
  const shown = safe(fonts.bold, verifyUrl.replace(/^https?:\/\//, ''));
  let urlSize = 10;
  while (urlSize > 6 && fonts.bold.widthOfTextAtSize(shown, urlSize) > width)
    urlSize -= 0.5;
  sheet.text(
    shown,
    x,
    top + 47 + body.length * 13 + 10,
    urlSize,
    fonts.bold,
    C.brand,
  );
  sheet.text(
    'If anything changed after signing, the check will say so.',
    x,
    top + 110,
    8.5,
    fonts.regular,
    C.muted,
  );
  sheet.y = top + height + 24;
}

function integrity(sheet: Sheet, manifest: LocalManifest): void {
  const { fonts } = sheet;
  const rows: [string, string][] = [
    ['Original document', manifest.source.sha256],
    ['Field layout', manifest.layoutSha256],
    ['Page geometry', manifest.geometrySha256],
  ];
  const boxH = 12 + rows.length * 22;
  sheet.ensure(40 + boxH);
  sheet.text('Integrity', M, sheet.y + 12, 13, fonts.bold, C.ink);
  sheet.text(
    'SHA-256 fingerprints sealed in the signed record. Change one byte of the file and they stop matching.',
    M,
    sheet.y + 27,
    9,
    fonts.regular,
    C.muted,
  );
  sheet.y += 38;
  const top = sheet.y;
  sheet.rect(M, top, CW, boxH, 8, { fill: C.well });
  rows.forEach(([label, hash], index) => {
    const base = top + 6 + index * 22 + 14;
    sheet.text(label, M + 14, base, 8.5, fonts.bold, C.ink);
    sheet.text(hash, M + 124, base, 7.5, fonts.mono, C.muted);
  });
  sheet.y = top + boxH;
}

function pageFooters(sheet: Sheet, manifest: LocalManifest): void {
  const { fonts } = sheet;
  const count = sheet.pages.length;
  sheet.pages.forEach((page, index) => {
    sheet.page = page;
    sheet.line(M, W - M, H - 40);
    sheet.text(
      `DigiSign  |  Certificate of completion  |  ${manifest.documentId}`,
      M,
      H - 26,
      7.5,
      fonts.regular,
      C.subtle,
    );
    sheet.textRight(
      `Certificate page ${index + 1} of ${count}`,
      W - M,
      H - 26,
      7.5,
      fonts.regular,
      C.subtle,
    );
  });
}

/** Adds the certificate to the end of the document. One page for a normal case, more for long lists. */
export async function drawBrandedCertificate(
  pdf: PDFDocument,
  manifest: LocalManifest,
  verifyUrl: string,
): Promise<void> {
  const sheet = new Sheet(pdf, await embedFonts(pdf));
  sheet.addPage();
  cover(sheet, manifest.completedAt);
  documentBlock(sheet, manifest);
  signatures(sheet, manifest);
  qrBlock(sheet, verifyUrl);
  integrity(sheet, manifest);
  pageFooters(sheet, manifest);
}

/** The line at the bottom of every original page. It carries the verify address as text. */
export async function drawBrandedFooters(
  pdf: PDFDocument,
  manifest: LocalManifest,
  verifyUrl: string,
): Promise<void> {
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pages = pdf.getPages();
  for (let index = 0; index < manifest.geometry.length; index += 1) {
    const page = pages[index];
    const geometry = manifest.geometry[index];
    if (!page || !geometry) continue;
    drawFooter(page, geometry, verifyUrl, font);
  }
}

function drawFooter(
  page: PDFPage,
  geometry: PageGeometry,
  verifyUrl: string,
  font: PDFFont,
): void {
  const { viewW, viewH } = viewSize(geometry);
  if (!(viewW > 80 && viewH > 60)) return;
  const toX = (pt: number) => clampMicro(Math.round((pt / viewW) * 1_000_000));
  const toY = (pt: number) => clampMicro(Math.round((pt / viewH) * 1_000_000));
  const at = (xPt: number, yFromTop: number) =>
    viewMicroToPdf(geometry, toX(xPt), toY(yFromTop));
  const left = at(24, viewH - 14);
  const right = at(viewW - 24, viewH - 14);
  const span = Math.hypot(right.x - left.x, right.y - left.y);
  const text = `Signed with DigiSign · ${verifyUrl}`;
  const indent = 9;
  let size = 7.5;
  while (size > 5 && font.widthOfTextAtSize(text, size) + indent > span)
    size -= 0.5;
  const ux = (right.x - left.x) / (span || 1);
  const uy = (right.y - left.y) / (span || 1);
  const angle = (Math.atan2(uy, ux) * 180) / Math.PI;
  page.drawLine({
    start: at(24, viewH - 26),
    end: at(viewW - 24, viewH - 26),
    thickness: 0.5,
    color: C.border,
  });
  const dot = at(24 + 2.5, viewH - 14 - size * 0.34);
  page.drawCircle({ x: dot.x, y: dot.y, size: 2.2, color: C.brand });
  page.drawText(text, {
    x: left.x + ux * indent,
    y: left.y + uy * indent,
    size,
    font,
    color: C.subtle,
    rotate: degrees(angle),
  });
}
