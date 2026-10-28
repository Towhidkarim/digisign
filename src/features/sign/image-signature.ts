import type { SignatureInput } from '#/core/contracts/index.ts';
import { sha256Hex } from '#/core/hash.ts';
import { limits } from '#/core/limits.ts';

export type ImageSignature = Extract<SignatureInput, { kind: 'image' }>;

/** The biggest file we will even try to read. It is re-encoded far smaller below. */
export const IMAGE_SOURCE_MAX_BYTES = 8 * 1024 * 1024;
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export const IMAGE_ERRORS = {
  type: 'Choose a PNG, JPEG or WebP image.',
  big: 'That file is too large. Choose one under 8 MB.',
  unreadable: 'That image could not be read. Try another one.',
  heavy: 'That image is too detailed. Try a simpler or smaller one.',
} as const;

/** The largest size that fits inside the box and keeps the image's proportions. Never upscales. */
export function fitWithin(
  w: number,
  h: number,
  max: { w: number; h: number } = limits.imageMaxPx,
): { w: number; h: number } {
  const scale = Math.min(1, max.w / w, max.h / h);
  return {
    w: Math.max(1, Math.round(w * scale)),
    h: Math.max(1, Math.round(h * scale)),
  };
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

async function encode(
  source: ImageBitmap,
  w: number,
  h: number,
): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext('2d');
  if (!context) throw new Error(IMAGE_ERRORS.unreadable);
  context.drawImage(source, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/png'),
  );
  if (!blob) throw new Error(IMAGE_ERRORS.unreadable);
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Turns a chosen file into a small PNG signature. The picture is redrawn on a canvas, so the
 * server only ever sees a clean PNG we made, never the original file with its metadata.
 */
export async function prepareImageSignature(
  file: File,
): Promise<ImageSignature> {
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) {
    throw new Error(IMAGE_ERRORS.type);
  }
  if (file.size > IMAGE_SOURCE_MAX_BYTES) throw new Error(IMAGE_ERRORS.big);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(IMAGE_ERRORS.unreadable);
  }
  try {
    let size = fitWithin(bitmap.width, bitmap.height);
    // Shrink a step at a time until the PNG fits the limit.
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const bytes = await encode(bitmap, size.w, size.h);
      const data = toBase64(bytes);
      if (data.length <= limits.imageBase64MaxChars) {
        return {
          kind: 'image',
          mime: 'image/png',
          w: size.w,
          h: size.h,
          data,
          sha256: await sha256Hex(bytes),
        };
      }
      size = {
        w: Math.max(1, Math.round(size.w * 0.8)),
        h: Math.max(1, Math.round(size.h * 0.8)),
      };
    }
    throw new Error(IMAGE_ERRORS.heavy);
  } finally {
    bitmap.close();
  }
}
