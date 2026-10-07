import { getDocument, PasswordException } from 'pdfjs-dist';
import {
  type PageGeometryInput,
  type UploadInit,
  uploadInitSchema,
} from '#/core/contracts/index.ts';
import type { Rotate } from '#/core/coords.ts';
import { sha256Hex } from '#/core/hash.ts';
import { limits } from '#/core/limits.ts';
import { ulid } from '#/core/ulid.ts';

import '#/pdf/setup.ts';

export const pdfMessages = {
  tooBig: 'This file is over 25 MB. Choose a smaller PDF.',
  password:
    'This PDF is password-protected. Choose a file that opens without a password.',
  unreadable: 'This file could not be read as a PDF. Choose another file.',
  tooManyPages: 'This PDF has more than 200 pages. Choose a shorter file.',
} as const;

export class PdfLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PdfLoadError';
  }
}

export async function readUpload(bytes: Uint8Array): Promise<UploadInit> {
  if (bytes.byteLength > limits.pdfSizeBytes) {
    throw new PdfLoadError(pdfMessages.tooBig);
  }
  if (bytes.byteLength === 0) {
    throw new PdfLoadError(pdfMessages.unreadable);
  }

  const sha256Promise = sha256Hex(bytes);
  const task = getDocument({
    data: bytes.slice(),
    disableRange: true,
    disableStream: true,
  });

  try {
    const pdf = await task.promise;
    try {
      if (pdf.numPages > limits.pdfPages) {
        throw new PdfLoadError(pdfMessages.tooManyPages);
      }
      const geometry: PageGeometryInput[] = [];
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const box = asBox(page.view);
        if (
          !box ||
          box[2] - box[0] > limits.pageExtentMaxPt ||
          box[3] - box[1] > limits.pageExtentMaxPt
        ) {
          throw new PdfLoadError(pdfMessages.unreadable);
        }
        geometry.push({
          // pdf.js exposes the visible box (crop ∩ media) as `view`.
          mediaBox: box,
          cropBox: box,
          rotate: asRotate(page.rotate),
        });
      }
      return uploadInitSchema.parse({
        documentId: ulid(),
        sha256: await sha256Promise,
        sizeBytes: bytes.byteLength,
        pageCount: pdf.numPages,
        geometry,
      });
    } finally {
      // Release page data, but keep the worker. The viewer opens the same file next.
      await pdf.cleanup().catch(() => undefined);
    }
  } catch (error) {
    if (!task.destroyed) await task.destroy().catch(() => undefined);
    if (error instanceof PdfLoadError) throw error;
    if (
      error instanceof PasswordException ||
      (error instanceof Error && error.name === 'PasswordException')
    ) {
      throw new PdfLoadError(pdfMessages.password);
    }
    throw new PdfLoadError(pdfMessages.unreadable);
  }
}

function asBox(
  value: readonly number[],
): [number, number, number, number] | null {
  if (value.length !== 4) return null;
  const [x0, y0, x1, y1] = value;
  if (
    x0 === undefined ||
    y0 === undefined ||
    x1 === undefined ||
    y1 === undefined
  ) {
    return null;
  }
  if (![x0, y0, x1, y1].every((part) => Number.isFinite(part))) return null;
  if (!(x1 > x0 && y1 > y0)) return null;
  return [x0, y0, x1, y1];
}

function asRotate(value: number): Rotate {
  const turns = ((Math.round(value) % 360) + 360) % 360;
  if (turns === 90 || turns === 180 || turns === 270) return turns;
  return 0;
}
