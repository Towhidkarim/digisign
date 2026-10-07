import { getDocument } from 'pdfjs-dist';

import { readEmbeddedClues } from '#/features/verify/embedded.ts';
import { parseFooter } from '#/features/verify/outcome.ts';

import '#/pdf/setup.ts';

export type Identified = {
  documentId: string | null;
  via: 'manifest' | 'info' | 'footer' | null;
  embeddedManifest: boolean;
  verifyOrigin: string | null;
};

const ID = /^[0-9A-Za-z]{10,40}$/;

async function footerText(bytes: Uint8Array): Promise<string> {
  const task = getDocument({
    data: bytes.slice(),
    disableRange: true,
    disableStream: true,
  });
  try {
    const pdf = await task.promise;
    try {
      const first = await pdf.getPage(1);
      return (await first.getTextContent()).items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ');
    } finally {
      await pdf.cleanup().catch(() => undefined);
    }
  } catch {
    return '';
  } finally {
    if (!task.destroyed) await task.destroy().catch(() => undefined);
  }
}

/**
 * Finds out which DigiSign document a PDF claims to be.
 * Order: embedded manifest, Info key, footer text. The file never leaves the browser.
 */
export async function identifyPdf(bytes: Uint8Array): Promise<Identified> {
  const result: Identified = {
    documentId: null,
    via: null,
    embeddedManifest: false,
    verifyOrigin: null,
  };
  const clues = await readEmbeddedClues(bytes);
  if (clues.manifestText !== null) {
    result.embeddedManifest = true;
    try {
      const parsed = JSON.parse(clues.manifestText) as {
        manifest?: { documentId?: unknown };
      };
      const id = parsed.manifest?.documentId;
      if (typeof id === 'string' && ID.test(id)) {
        result.documentId = id;
        result.via = 'manifest';
      }
    } catch {
      // An unreadable attachment falls through to the other clues.
    }
  }
  if (
    !result.documentId &&
    clues.infoDocumentId &&
    ID.test(clues.infoDocumentId)
  ) {
    result.documentId = clues.infoDocumentId;
    result.via = 'info';
  }
  const footer = parseFooter(await footerText(bytes));
  if (footer) result.verifyOrigin = footer.origin;
  if (!result.documentId && footer) {
    result.documentId = footer.documentId;
    result.via = 'footer';
  }
  return result;
}
