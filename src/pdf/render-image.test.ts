import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import type { LocalManifest } from '#/features/sign/manifest.ts';
import type { ScriptFontBytes } from '#/pdf/fonts.ts';
import { render } from '#/pdf/render.ts';

const fonts = {
  'script-1': new Uint8Array(),
  'script-2': new Uint8Array(),
  'script-3': new Uint8Array(),
  'script-4': new Uint8Array(),
  'script-5': new Uint8Array(),
  'script-6': new Uint8Array(),
} satisfies ScriptFontBytes;

// A real 1 x 1 PNG.
const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('image signature render', () => {
  it('places the picture on the page, the same bytes every time', async () => {
    const blank = await PDFDocument.create();
    blank.addPage([200, 200]);
    const original = await blank.save();
    const field = {
      id: '01ARZ3NDEKTSV4RRFFQ69G5FB0',
      signerId: '01ARZ3NDEKTSV4RRFFQ69G5FB1',
      pageIndex: 0,
      kind: 'signature' as const,
      x: 50_000,
      y: 50_000,
      w: 500_000,
      h: 150_000,
      required: true,
    };
    const manifest: LocalManifest = {
      v: 1,
      documentId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      title: 'Agreement',
      source: { sha256: 'ab'.repeat(32), size: original.length },
      geometrySha256: 'cd'.repeat(32),
      layoutSha256: 'ef'.repeat(32),
      geometry: [
        { mediaBox: [0, 0, 200, 200], cropBox: [0, 0, 200, 200], rotate: 0 },
      ],
      layout: {
        documentId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
        layoutVersion: 1,
        fields: [field],
      },
      signers: [
        {
          order: 1,
          signerId: field.signerId,
          name: 'Ada',
          signedAt: 1_700_000_000_000,
          values: [
            {
              fieldId: field.id,
              signature: {
                kind: 'image',
                mime: 'image/png',
                w: 1,
                h: 1,
                data: PNG_1X1,
                sha256: '00'.repeat(32),
              },
            },
          ],
          valuesSha256: '11'.repeat(32),
          privateEvidenceSha256: '22'.repeat(32),
        },
      ],
      completedAt: 1_700_000_000_000,
    };
    const options = {
      fonts,
      verifyOrigin: 'https://digisign.test',
      envelope: '{"keyId":"k1","manifest":{},"sig":""}',
    };
    const first = await render(original, manifest, options);
    const second = await render(original, manifest, options);
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
    expect(Buffer.from(first).includes('/Subtype /Image')).toBe(true);
  });
});
