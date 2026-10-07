import { PDFDocument } from 'pdf-lib';
import { expect, it } from 'vitest';
import { envelopeJson } from '#/features/sign/manifest.ts';
import { readEmbeddedClues } from '#/features/verify/embedded.ts';

it('reads pdf-lib attachments back', async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage([200, 200]);
  const text = envelopeJson({ documentId: 'ABCDEFGHIJK' } as never);
  await pdf.attach(new TextEncoder().encode(text), 'digisign-manifest.json', {
    mimeType: 'application/json',
  });
  const bytes = await pdf.save({ useObjectStreams: false });
  const clues = await readEmbeddedClues(bytes);
  expect(clues.manifestText).toBe(text);
  const plain = await PDFDocument.create();
  plain.addPage([200, 200]);
  expect((await readEmbeddedClues(await plain.save())).manifestText).toBeNull();
});
