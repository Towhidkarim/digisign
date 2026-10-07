/**
 * The version of the code that draws the signed PDF (stamps, footer, certificate). It is recorded
 * in every signed manifest. Verification draws the PDF again and compares bytes, so any change to
 * the drawing changes the bytes: bump the version when you change it. Nothing is published yet,
 * so there is no dispatch to older drawing code. Add one before the first real document is signed.
 */
export const RENDERER_NAME = 'digisign-render' as const;

export const RENDERER_VERSION = '1.1.0' as const;

export type RendererStamp = {
  name: typeof RENDERER_NAME;
  version: string;
};

export function currentRenderer(): RendererStamp {
  return { name: RENDERER_NAME, version: RENDERER_VERSION };
}
