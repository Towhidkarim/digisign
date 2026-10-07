import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { encodeStrokes } from '#/core/strokes-codec.ts';
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

describe('signed pdf render', () => {
  it('produces the same bytes when the inputs do not change', async () => {
    const blank = await PDFDocument.create();
    blank.addPage([200, 200]);
    const original = await blank.save();
    const manifest: LocalManifest = {
      v: 1,
      documentId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      title: 'Agreement',
      source: { sha256: 'ab'.repeat(32), size: original.length },
      geometrySha256: 'cd'.repeat(32),
      layoutSha256: 'ef'.repeat(32),
      geometry: [
        {
          mediaBox: [0, 0, 200, 200],
          cropBox: [0, 0, 200, 200],
          rotate: 0,
        },
      ],
      layout: {
        documentId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
        layoutVersion: 1,
        fields: [
          {
            id: '01ARZ3NDEKTSV4RRFFQ69G5FB0',
            signerId: '01ARZ3NDEKTSV4RRFFQ69G5FB1',
            pageIndex: 0,
            kind: 'text',
            x: 100_000,
            y: 100_000,
            w: 400_000,
            h: 80_000,
            required: true,
          },
        ],
      },
      signers: [
        {
          order: 1,
          signerId: '01ARZ3NDEKTSV4RRFFQ69G5FB1',
          name: 'Ada',
          signedAt: 1_700_000_000_000,
          values: [{ fieldId: '01ARZ3NDEKTSV4RRFFQ69G5FB0', text: 'Yes' }],
          valuesSha256: '11'.repeat(32),
          privateEvidenceSha256: '22'.repeat(32),
        },
      ],
      completedAt: 1_700_000_000_000,
    };
    const options = { fonts, verifyOrigin: 'https://digisign.test' };
    const first = await render(original, manifest, options);
    const second = await render(original, manifest, options);
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
  });

  it('stamps drawn and typed ink with the same bytes twice', async () => {
    const blank = await PDFDocument.create();
    blank.addPage([200, 200]);
    const original = await blank.save();
    const script = readFileSync('src/assets/fonts/GreatVibes-Regular.ttf');
    const loaded: ScriptFontBytes = {
      'script-1': new Uint8Array(script),
      'script-2': new Uint8Array(script),
      'script-3': new Uint8Array(script),
      'script-4': new Uint8Array(script),
      'script-5': new Uint8Array(script),
      'script-6': new Uint8Array(script),
    };
    const manifest: LocalManifest = {
      v: 1,
      documentId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
      title: 'Agreement',
      source: { sha256: 'ab'.repeat(32), size: original.length },
      geometrySha256: 'cd'.repeat(32),
      layoutSha256: 'ef'.repeat(32),
      geometry: [
        {
          mediaBox: [0, 0, 200, 200],
          cropBox: [0, 0, 200, 200],
          rotate: 0,
        },
      ],
      layout: {
        documentId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
        layoutVersion: 1,
        fields: [
          {
            id: '01ARZ3NDEKTSV4RRFFQ69G5FB0',
            signerId: '01ARZ3NDEKTSV4RRFFQ69G5FB1',
            pageIndex: 0,
            kind: 'signature',
            x: 50_000,
            y: 50_000,
            w: 500_000,
            h: 150_000,
            required: true,
          },
          {
            id: '01ARZ3NDEKTSV4RRFFQ69G5FB2',
            signerId: '01ARZ3NDEKTSV4RRFFQ69G5FB1',
            pageIndex: 0,
            kind: 'initials',
            x: 50_000,
            y: 250_000,
            w: 200_000,
            h: 80_000,
            required: true,
          },
        ],
      },
      signers: [
        {
          order: 1,
          signerId: '01ARZ3NDEKTSV4RRFFQ69G5FB1',
          name: 'Ada',
          signedAt: 1_700_000_000_000,
          values: [
            {
              fieldId: '01ARZ3NDEKTSV4RRFFQ69G5FB0',
              signature: {
                kind: 'drawn',
                box: { w: 9000, h: 3000 },
                strokes: encodeStrokes([
                  [
                    [100, 100],
                    [4000, 1500],
                    [8000, 400],
                  ],
                ]),
              },
            },
            {
              fieldId: '01ARZ3NDEKTSV4RRFFQ69G5FB2',
              signature: { kind: 'typed', text: 'Ada', font: 'script-1' },
            },
          ],
          valuesSha256: '11'.repeat(32),
          privateEvidenceSha256: '22'.repeat(32),
        },
      ],
      completedAt: 1_700_000_000_000,
    };
    const options = { fonts: loaded, verifyOrigin: 'https://digisign.test' };
    const first = await render(original, manifest, options);
    const second = await render(original, manifest, options);
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
    expect(first.length).toBeGreaterThan(original.length);
  });
});
