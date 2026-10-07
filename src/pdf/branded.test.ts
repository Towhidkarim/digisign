import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import type { LocalManifest } from '#/features/sign/manifest.ts';
import { readEmbeddedClues } from '#/features/verify/embedded.ts';
import { parseFooter } from '#/features/verify/outcome.ts';
import { formatCertificateTime } from '#/pdf/branded.ts';
import type { ScriptFontBytes } from '#/pdf/fonts.ts';
import { render } from '#/pdf/render.ts';

const ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const FIELD = '01ARZ3NDEKTSV4RRFFQ69G5FB0';
const SIGNER = '01ARZ3NDEKTSV4RRFFQ69G5FB1';
const fonts = Object.fromEntries(
  ['script-1', 'script-2', 'script-3', 'script-4', 'script-5', 'script-6'].map(
    (name) => [name, new Uint8Array()],
  ),
) as ScriptFontBytes;

/** The server's signed envelope, as stored. The test only needs it to be some exact bytes. */
const ENVELOPE = JSON.stringify({
  keyId: 'k1',
  manifest: { documentId: ID, v: 1 },
  sig: 'c2ln',
});
const options = {
  fonts,
  verifyOrigin: 'https://digisign.test',
  envelope: ENVELOPE,
};

async function blank(pages = 1): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  for (let index = 0; index < pages; index += 1) pdf.addPage([200, 200]);
  return pdf.save();
}

function manifest(
  size: number,
  extra: Partial<LocalManifest> = {},
  signerCount = 1,
  pages = 1,
  fieldText = 'Yes',
): LocalManifest {
  return {
    v: 1,
    documentId: ID,
    title: 'Agreement',
    source: { sha256: 'ab'.repeat(32), size },
    geometrySha256: 'cd'.repeat(32),
    layoutSha256: 'ef'.repeat(32),
    geometry: Array.from({ length: pages }, () => ({
      mediaBox: [0, 0, 200, 200] as [number, number, number, number],
      cropBox: [0, 0, 200, 200] as [number, number, number, number],
      rotate: 0 as const,
    })),
    layout: {
      documentId: ID,
      layoutVersion: 1,
      fields: [
        {
          id: FIELD,
          signerId: SIGNER,
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
    signers: Array.from({ length: signerCount }, (_, index) => ({
      order: index + 1,
      signerId: SIGNER,
      name: index === 0 ? 'Ada' : `Signer ${index + 1}`,
      signedAt: 1_700_000_000_000 + index * 60_000,
      values: index === 0 ? [{ fieldId: FIELD, text: fieldText }] : [],
      valuesSha256: '11'.repeat(32),
      privateEvidenceSha256: '22'.repeat(32),
    })),
    completedAt: 1_700_000_000_000,
    ...extra,
  };
}

describe('signed pdf', () => {
  it('draws the same bytes every time', async () => {
    const original = await blank();
    const signed = manifest(original.length);
    const first = await render(original, signed, options);
    const second = await render(original, signed, options);
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
    expect((await PDFDocument.load(first)).getPageCount()).toBe(2);
  });

  it('embeds the server envelope exactly as given', async () => {
    const original = await blank();
    const out = await render(original, manifest(original.length), options);
    const clues = await readEmbeddedClues(out);
    expect(clues.manifestText).toBe(ENVELOPE);
    expect(clues.infoDocumentId).toBe(ID);
  });

  it('survives text a built-in font cannot draw, in fields and on the certificate', async () => {
    const original = await blank();
    const signed = manifest(
      original.length,
      { title: `${'রহিম এর চুক্তি '.repeat(6)}${'x'.repeat(200)}` },
      3,
      1,
      'রহিম উদ্দিন 王小明 ok',
    );
    signed.signers[0] = {
      ...(signed.signers[0] as (typeof signed.signers)[number]),
      name: 'রহিম উদ্দিন 王小明',
    };
    const out = await render(original, signed, options);
    expect((await PDFDocument.load(out)).getPageCount()).toBe(2);
  });

  it('moves a long list of signers onto a second certificate page', async () => {
    const original = await blank(2);
    const out = await render(
      original,
      manifest(original.length, {}, 10, 2),
      options,
    );
    expect((await PDFDocument.load(out)).getPageCount()).toBeGreaterThanOrEqual(
      4,
    );
  });
});

describe('certificate time', () => {
  it('is fixed to UTC and a fixed shape', () => {
    expect(formatCertificateTime(Date.UTC(2026, 9, 6, 21, 48, 26))).toBe(
      '6 Oct 2026, 21:48:26 UTC',
    );
  });
});

describe('footer text', () => {
  it('reads the document id and origin', () => {
    expect(
      parseFooter(`Signed with DigiSign · https://digisign.test/v/${ID}`),
    ).toEqual({ documentId: ID, origin: 'https://digisign.test' });
  });

  it('ignores other text', () => {
    expect(parseFooter('just a page')).toBeNull();
  });
});
