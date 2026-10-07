import {
  decodePDFRawStream,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFRawStream,
  PDFString,
} from 'pdf-lib';

export type EmbeddedClues = {
  /** The text of `digisign-manifest.json`, when the file carries it. */
  manifestText: string | null;
  /** The `DigiSignDocumentId` Info key. */
  infoDocumentId: string | null;
};

function textOf(value: unknown): string | null {
  if (value instanceof PDFHexString || value instanceof PDFString)
    return value.decodeText();
  return null;
}

/** Reads the embedded manifest and Info key with pdf-lib, which sees attachments pdf.js misses. */
export async function readEmbeddedClues(
  bytes: Uint8Array,
): Promise<EmbeddedClues> {
  const clues: EmbeddedClues = { manifestText: null, infoDocumentId: null };
  let pdf: PDFDocument;
  try {
    pdf = await PDFDocument.load(bytes, {
      updateMetadata: false,
      throwOnInvalidObject: false,
    });
  } catch {
    return clues;
  }
  const info = pdf.context.lookup(pdf.context.trailerInfo.Info);
  if (info instanceof PDFDict) {
    clues.infoDocumentId = textOf(info.get(PDFName.of('DigiSignDocumentId')));
  }
  for (const [, object] of pdf.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFDict)) continue;
    const name =
      textOf(object.get(PDFName.of('UF'))) ??
      textOf(object.get(PDFName.of('F')));
    if (name !== 'digisign-manifest.json') continue;
    const embedded = object.lookupMaybe(PDFName.of('EF'), PDFDict);
    const stream = embedded?.lookup(PDFName.of('F'));
    if (!(stream instanceof PDFRawStream)) continue;
    try {
      clues.manifestText = new TextDecoder().decode(
        decodePDFRawStream(stream).decode(),
      );
    } catch {
      clues.manifestText = '';
    }
    break;
  }
  return clues;
}
