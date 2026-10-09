import { canonicalJson } from '#/core/canonical-json.ts';
import { sha256Hex } from '#/core/hash.ts';
import type { LocalManifest } from '#/features/sign/manifest.ts';
import { recordIsGenuine, toLocalManifest } from '#/features/verify/outcome.ts';
import { loadScriptFonts } from '#/pdf/fonts.ts';
import { render } from '#/pdf/render.ts';
import { previewDocumentFn } from '#/server/documents.ts';
import { verifyManifestFn } from '#/server/verify.ts';

type Failure = { error: string };

/**
 * Loads the original PDF and checks it against the hash the record or the preview expects.
 * The owner's session is enough to read it, so a preview needs no read grant.
 */
async function fetchOriginal(
  documentId: string,
  grant: string | null,
  sha256: string,
): Promise<Uint8Array | Failure> {
  const query = grant ? `?grant=${encodeURIComponent(grant)}` : '';
  const response = await fetch(`/files/documents/${documentId}/source${query}`);
  if (!response.ok) {
    return { error: 'The original PDF could not be loaded. Try again.' };
  }
  const original = new Uint8Array(await response.arrayBuffer());
  if ((await sha256Hex(original)) !== sha256) {
    return {
      error:
        'The stored original does not match its record, so no PDF was made.',
    };
  }
  return original;
}

/**
 * The finished PDF with its record. Built in the browser the same way the verify page builds
 * it, so the bytes match what the record describes.
 *
 * This file pulls in pdf-lib, so load it only through
 * `import.meta.env.SSR ? null : () => import(...)` (see .cursor/rules/server-bundle.mdc).
 */
export async function signedPdfBytes(
  documentId: string,
): Promise<Uint8Array | Failure> {
  try {
    const record = await verifyManifestFn({ data: { documentId } });
    if (!recordIsGenuine(record)) {
      return {
        error:
          'The signed record could not be confirmed, so no signed PDF was made. Try again in a moment.',
      };
    }
    const original = await fetchOriginal(
      documentId,
      record.grant,
      record.manifest.source.sha256,
    );
    if ('error' in original) return original;
    return await render(original, toLocalManifest(record), {
      fonts: await loadScriptFonts(),
      verifyOrigin: window.location.origin,
      envelope: record.envelope,
    });
  } catch {
    return { error: 'The signed PDF could not be made. Try again.' };
  }
}

/**
 * The signatures recorded so far, stamped as a preview. It has no record, no certificate and
 * no verification footer, so it cannot pass as the finished PDF.
 */
export async function previewPdfBytes(
  documentId: string,
): Promise<Uint8Array | Failure> {
  try {
    const data = await previewDocumentFn({ data: { documentId } });
    if ('error' in data) return data;
    const original = await fetchOriginal(documentId, null, data.sourceSha256);
    if ('error' in original) return original;
    const manifest: LocalManifest = {
      v: 1,
      documentId: data.documentId,
      title: data.title,
      source: { sha256: data.sourceSha256, size: data.sourceSize },
      geometrySha256: await sha256Hex(canonicalJson(data.geometry)),
      layoutSha256: await sha256Hex(canonicalJson(data.layout)),
      geometry: data.geometry,
      layout: data.layout,
      signers: data.signers,
      completedAt: Date.now(),
    };
    return await render(original, manifest, {
      fonts: await loadScriptFonts(),
      verifyOrigin: window.location.origin,
      preview: { signedCount: data.signedCount, total: data.total },
    });
  } catch {
    return { error: 'The preview could not be made. Try again.' };
  }
}

export async function downloadSignedPdf(
  documentId: string,
  title: string,
): Promise<{ ok: true } | Failure> {
  const bytes = await signedPdfBytes(documentId);
  if ('error' in bytes) return bytes;
  const url = URL.createObjectURL(
    new Blob([bytes.slice()], { type: 'application/pdf' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `${title.replace(/\.pdf$/i, '')}-signed.pdf`;
  link.click();
  URL.revokeObjectURL(url);
  return { ok: true };
}
