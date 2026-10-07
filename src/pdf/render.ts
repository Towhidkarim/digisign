import fontkit from '@pdf-lib/fontkit';
import {
  degrees,
  LineCapStyle,
  PDFDict,
  PDFDocument,
  type PDFFont,
  PDFHexString,
  PDFName,
  type PDFPage,
  rgb,
  StandardFonts,
} from 'pdf-lib';
import { create as createQr } from 'qrcode';

import type { FieldInput, FieldValue } from '#/core/contracts/index.ts';
import {
  clampMicro,
  type PageGeometry,
  ptToMicro,
  viewMicroToPdf,
  viewSize,
} from '#/core/coords.ts';
import { type ScriptFont, unpackStrokes } from '#/features/sign/capture.ts';
import { fontSizeForBox } from '#/features/sign/fitted-script.tsx';
import type { LocalManifest } from '#/features/sign/manifest.ts';
import { envelopeJson } from '#/features/sign/manifest.ts';
import { formatSignedTime } from '#/features/sign/values.ts';
import type { ScriptFontBytes } from '#/pdf/fonts.ts';
import {
  checkFractions,
  type Fraction,
  inkFractions,
  inkStrokeWidth,
} from '#/pdf/ink.ts';

const INK = rgb(18 / 255, 52 / 255, 74 / 255);
const QUIET = rgb(70 / 255, 110 / 255, 130 / 255);

export async function render(
  originalBytes: Uint8Array,
  manifest: LocalManifest,
  options: { fonts: ScriptFontBytes; verifyOrigin: string },
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(originalBytes, { updateMetadata: false });
  const body = await pdf.embedFont(StandardFonts.Helvetica);
  const script = await embedScripts(pdf, manifest, options.fonts);
  const pages = pdf.getPages();
  const verifyUrl = `${options.verifyOrigin.replace(/\/$/, '')}/v/${manifest.documentId}`;

  for (const field of manifest.layout.fields) {
    const page = pages[field.pageIndex];
    const geometry = manifest.geometry[field.pageIndex];
    const value = valueFor(manifest, field.id);
    if (!page || !geometry || !value) continue;
    drawField(page, geometry, field, value, body, script, options.fonts);
  }

  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    const geometry = manifest.geometry[index];
    if (!page || !geometry) continue;
    drawFooter(page, geometry, manifest, verifyUrl, body);
  }

  drawCertificate(pdf, manifest, verifyUrl, body);
  const completed = new Date(manifest.completedAt);
  pdf.setTitle(manifest.title);
  pdf.setAuthor('DigiSign');
  pdf.setCreator('DigiSign');
  pdf.setProducer('DigiSign');
  pdf.setCreationDate(completed);
  pdf.setModificationDate(completed);
  const info = infoDict(pdf);
  info.set(
    PDFName.of('DigiSignDocumentId'),
    PDFHexString.fromText(manifest.documentId),
  );
  const id = PDFHexString.of(manifest.source.sha256);
  pdf.context.trailerInfo.ID = pdf.context.obj([id, id]);
  const payload = new TextEncoder().encode(envelopeJson(manifest));
  await pdf.attach(payload, 'digisign-manifest.json', {
    mimeType: 'application/json',
    description: 'DigiSign manifest',
    creationDate: completed,
    modificationDate: completed,
  });
  return pdf.save({ useObjectStreams: false, updateFieldAppearances: false });
}

async function embedScripts(
  pdf: PDFDocument,
  manifest: LocalManifest,
  fonts: ScriptFontBytes,
): Promise<Partial<Record<ScriptFont, PDFFont>>> {
  const needed = new Set<ScriptFont>();
  for (const signer of manifest.signers) {
    for (const value of signer.values) {
      if (value.signature?.kind === 'typed') needed.add(value.signature.font);
    }
  }
  if (needed.size === 0) return {};
  pdf.registerFontkit(fontkit);
  const embedded: Partial<Record<ScriptFont, PDFFont>> = {};
  for (const name of needed) {
    const bytes = fonts[name];
    if (!bytes) throw new Error('A signature font is missing.');
    embedded[name] = await pdf.embedFont(bytes, { subset: false });
  }
  return embedded;
}

function drawField(
  page: PDFPage,
  geometry: PageGeometry,
  field: FieldInput,
  value: FieldValue,
  body: PDFFont,
  script: Partial<Record<ScriptFont, PDFFont>>,
  fonts: ScriptFontBytes,
): void {
  if (value.signature?.kind === 'drawn') {
    const strokes = unpackStrokes(value.signature.strokes);
    const { viewW, viewH } = viewSize(geometry);
    const fieldW = (field.w / 1_000_000) * viewW;
    const fieldH = (field.h / 1_000_000) * viewH;
    const groups = inkFractions(value.signature.box, strokes, fieldW, fieldH);
    const stroke = inkStrokeWidth(value.signature.box, fieldW, fieldH);
    for (const group of groups)
      drawFractions(page, geometry, field, group, stroke);
    return;
  }
  if (value.signature?.kind === 'typed') {
    const font = script[value.signature.font];
    if (!font) throw new Error('A signature font is missing.');
    drawScriptText(
      page,
      geometry,
      field,
      value.signature.text,
      font,
      fonts[value.signature.font],
    );
    return;
  }
  if (value.checked) {
    drawFractions(page, geometry, field, checkFractions(), 1.6);
    return;
  }
  if (value.text) {
    drawFittedText(page, geometry, field, value.text, body, 11);
  }
}

function drawFractions(
  page: PDFPage,
  geometry: PageGeometry,
  field: FieldInput,
  fractions: readonly Fraction[],
  thickness = 1.15,
): void {
  const points = fractions.map((fraction) =>
    viewMicroToPdf(
      geometry,
      field.x + fraction.x * field.w,
      field.y + fraction.y * field.h,
    ),
  );
  if (points.length === 1 && points[0]) {
    const nudge = viewMicroToPdf(
      geometry,
      field.x + fractions[0].x * field.w + field.w * 0.02,
      field.y + fractions[0].y * field.h,
    );
    points.push(nudge);
  }
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    if (!start || !end) continue;
    page.drawLine({
      start,
      end,
      thickness,
      color: INK,
      lineCap: LineCapStyle.Round,
    });
  }
}

function drawScriptText(
  page: PDFPage,
  geometry: PageGeometry,
  field: FieldInput,
  text: string,
  font: PDFFont,
  bytes: Uint8Array | undefined,
): void {
  const topLeft = viewMicroToPdf(geometry, field.x, field.y);
  const topRight = viewMicroToPdf(geometry, field.x + field.w, field.y);
  const bottomLeft = viewMicroToPdf(geometry, field.x, field.y + field.h);
  const span = Math.hypot(topRight.x - topLeft.x, topRight.y - topLeft.y);
  const fieldHeight = Math.hypot(
    bottomLeft.x - topLeft.x,
    bottomLeft.y - topLeft.y,
  );
  const face = bytes ? fontkit.create(bytes) : null;
  const run = face?.layout(text);
  const units = face?.unitsPerEm || 1000;
  const inkW =
    Math.max(run?.bbox.width ?? font.widthOfTextAtSize(text, units), 1) / units;
  const inkH =
    Math.max(run?.bbox.height ?? font.heightAtSize(units), 1) / units;
  const size = fontSizeForBox(span, fieldHeight, inkW, inkH);
  const textWidth = font.widthOfTextAtSize(text, size);
  const centerAbove =
    (((run?.bbox.maxY ?? units * 0.8) + (run?.bbox.minY ?? units * -0.2)) /
      2 /
      units) *
    size;
  const ux = (topRight.x - topLeft.x) / (span || 1);
  const uy = (topRight.y - topLeft.y) / (span || 1);
  const vx = (bottomLeft.x - topLeft.x) / (fieldHeight || 1);
  const vy = (bottomLeft.y - topLeft.y) / (fieldHeight || 1);
  const cx = (topLeft.x + topRight.x) / 2 + (bottomLeft.x - topLeft.x) / 2;
  const cy = (topLeft.y + topRight.y) / 2 + (bottomLeft.y - topLeft.y) / 2;
  page.drawText(text, {
    x: cx - ux * (textWidth / 2) + vx * centerAbove,
    y: cy - uy * (textWidth / 2) + vy * centerAbove,
    size,
    font,
    color: INK,
    rotate: degrees((Math.atan2(uy, ux) * 180) / Math.PI),
  });
}

function drawFittedText(
  page: PDFPage,
  geometry: PageGeometry,
  field: FieldInput,
  text: string,
  font: PDFFont,
  maxSize: number,
): void {
  const topLeft = viewMicroToPdf(geometry, field.x, field.y);
  const topRight = viewMicroToPdf(geometry, field.x + field.w, field.y);
  const bottomLeft = viewMicroToPdf(geometry, field.x, field.y + field.h);
  const span = Math.hypot(topRight.x - topLeft.x, topRight.y - topLeft.y);
  const fieldHeight = Math.hypot(
    bottomLeft.x - topLeft.x,
    bottomLeft.y - topLeft.y,
  );
  const size = fitSize(font, text, span * 0.9, fieldHeight * 0.8, maxSize);
  const textWidth = font.widthOfTextAtSize(text, size);
  const ascent = font.heightAtSize(size, { descender: false });
  const descent = font.heightAtSize(size) - ascent;
  const centerAbove = (ascent - descent) / 2;
  const ux = (topRight.x - topLeft.x) / (span || 1);
  const uy = (topRight.y - topLeft.y) / (span || 1);
  const vx = (bottomLeft.x - topLeft.x) / (fieldHeight || 1);
  const vy = (bottomLeft.y - topLeft.y) / (fieldHeight || 1);
  const cx = (topLeft.x + topRight.x) / 2 + (bottomLeft.x - topLeft.x) / 2;
  const cy = (topLeft.y + topRight.y) / 2 + (bottomLeft.y - topLeft.y) / 2;
  page.drawText(text, {
    x: cx - ux * (textWidth / 2) + vx * centerAbove,
    y: cy - uy * (textWidth / 2) + vy * centerAbove,
    size,
    font,
    color: INK,
    rotate: degrees((Math.atan2(uy, ux) * 180) / Math.PI),
  });
}

function drawFooter(
  page: PDFPage,
  geometry: PageGeometry,
  manifest: LocalManifest,
  verifyUrl: string,
  font: PDFFont,
): void {
  const { viewW, viewH } = viewSize(geometry);
  const yMicro = clampMicro(Math.round(((viewH - 16) / viewH) * 1_000_000));
  const left = viewMicroToPdf(geometry, ptToMicro(8, viewW), yMicro);
  const right = viewMicroToPdf(
    geometry,
    clampMicro(1_000_000 - ptToMicro(8, viewW)),
    yMicro,
  );
  const span = Math.hypot(right.x - left.x, right.y - left.y);
  const text = `DigiSign · ${manifest.documentId} · ${manifest.source.sha256.slice(0, 12)} · ${verifyUrl}`;
  let size = 8;
  while (size > 5 && font.widthOfTextAtSize(text, size) > span) size -= 0.5;
  page.drawText(text, {
    x: left.x,
    y: left.y,
    size,
    font,
    color: QUIET,
    rotate: degrees(
      (Math.atan2(right.y - left.y, right.x - left.x) * 180) / Math.PI,
    ),
  });
}

function drawCertificate(
  pdf: PDFDocument,
  manifest: LocalManifest,
  verifyUrl: string,
  font: PDFFont,
): void {
  let page = pdf.addPage([612, 792]);
  let y = 740;
  const write = (text: string, size: number, gap: number) => {
    if (y < 150) {
      page = pdf.addPage([612, 792]);
      y = 740;
    }
    page.drawText(text, { x: 48, y, size, font, color: INK });
    y -= gap;
  };
  write('Certificate of Completion', 18, 28);
  write(`Document ${manifest.documentId}`, 11, 18);
  write(`Title ${manifest.title}`, 11, 18);
  write(`Original SHA-256 ${manifest.source.sha256}`, 9, 16);
  write(`Geometry SHA-256 ${manifest.geometrySha256}`, 9, 16);
  write(`Layout SHA-256 ${manifest.layoutSha256}`, 9, 22);
  for (const signer of manifest.signers) {
    write(
      `${signer.order}. ${signer.name} · ${formatSignedTime(signer.signedAt)}`,
      11,
      16,
    );
  }
  write(`Verify at ${verifyUrl}`, 11, 18);
  const qr = createQr(verifyUrl, {
    errorCorrectionLevel: 'M',
    maskPattern: 0,
  });
  const cell = 96 / qr.modules.size;
  const originX = 48;
  const originY = Math.max(48, y - 96);
  for (let row = 0; row < qr.modules.size; row += 1) {
    for (let col = 0; col < qr.modules.size; col += 1) {
      if (!qr.modules.data[row * qr.modules.size + col]) continue;
      page.drawRectangle({
        x: originX + col * cell,
        y: originY + (qr.modules.size - 1 - row) * cell,
        width: cell,
        height: cell,
        color: INK,
      });
    }
  }
}

function valueFor(
  manifest: LocalManifest,
  fieldId: string,
): FieldValue | undefined {
  for (const signer of manifest.signers) {
    const found = signer.values.find((value) => value.fieldId === fieldId);
    if (found) return found;
  }
  return undefined;
}

function infoDict(pdf: PDFDocument): PDFDict {
  const existing = pdf.context.lookup(pdf.context.trailerInfo.Info);
  if (existing instanceof PDFDict) return existing;
  const created = pdf.context.obj({});
  pdf.context.trailerInfo.Info = pdf.context.register(created);
  return created;
}

function fitSize(
  font: PDFFont,
  text: string,
  maxWidth: number,
  maxHeight: number,
  maxSize: number,
): number {
  let size = Math.min(maxSize, Math.max(6, maxHeight));
  while (
    size > 4 &&
    (font.widthOfTextAtSize(text, size) > maxWidth ||
      font.heightAtSize(size) > maxHeight)
  ) {
    size -= 0.5;
  }
  return size;
}
