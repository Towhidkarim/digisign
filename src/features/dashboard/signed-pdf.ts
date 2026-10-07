import { sha256Hex } from '#/core/hash.ts';
import { recordIsGenuine, toLocalManifest } from '#/features/verify/outcome.ts';
import { loadScriptFonts } from '#/pdf/fonts.ts';
import { render } from '#/pdf/render.ts';
import { verifyManifestFn } from '#/server/verify.ts';

/**
 * Builds the signed PDF in the browser, the same way the verify page does: the signed
 * record and a read grant come from the server, the original is checked against the
 * recorded hash, and the deterministic renderer stamps it. No server change is involved.
 *
 * This file pulls in pdf-lib, so load it only through
 * `import.meta.env.SSR ? null : () => import(...)` (see .cursor/rules/server-bundle.mdc).
 */
export async function downloadSignedPdf(
  documentId: string,
  title: string,
): Promise<{ ok: true } | { error: string }> {
  try {
    const record = await verifyManifestFn({ data: { documentId } });
    if (!recordIsGenuine(record)) {
      return {
        error:
          'The signed record could not be confirmed, so no signed PDF was made. Try again in a moment.',
      };
    }
    const response = await fetch(
      `/files/documents/${documentId}/source?grant=${encodeURIComponent(record.grant)}`,
    );
    if (!response.ok) {
      return { error: 'The original PDF could not be loaded. Try again.' };
    }
    const original = new Uint8Array(await response.arrayBuffer());
    if ((await sha256Hex(original)) !== record.manifest.source.sha256) {
      return {
        error:
          'The stored original does not match the signed record, so no signed PDF was made.',
      };
    }
    const signed = await render(original, toLocalManifest(record), {
      fonts: await loadScriptFonts(),
      verifyOrigin: window.location.origin,
    });
    const url = URL.createObjectURL(
      new Blob([signed.slice()], { type: 'application/pdf' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title.replace(/\.pdf$/i, '')}-signed.pdf`;
    link.click();
    URL.revokeObjectURL(url);
    return { ok: true };
  } catch {
    return { error: 'The signed PDF could not be made. Try again.' };
  }
}
