import script3Url from '#/assets/fonts/AlexBrush-Regular.ttf?url';
import script2Url from '#/assets/fonts/Allura-Regular.ttf?url';
import script1Url from '#/assets/fonts/GreatVibes-Regular.ttf?url';
import script5Url from '#/assets/fonts/Parisienne-Regular.ttf?url';
import script6Url from '#/assets/fonts/PinyonScript-Regular.ttf?url';
import script4Url from '#/assets/fonts/Sacramento-Regular.ttf?url';
import type { ScriptFont } from '#/features/sign/capture.ts';

export const SCRIPT_FACE: Record<
  ScriptFont,
  { family: string; label: string; url: string }
> = {
  'script-1': { family: 'Great Vibes', label: 'Great Vibes', url: script1Url },
  'script-2': { family: 'Allura', label: 'Allura', url: script2Url },
  'script-3': { family: 'Alex Brush', label: 'Alex Brush', url: script3Url },
  'script-4': { family: 'Sacramento', label: 'Sacramento', url: script4Url },
  'script-5': { family: 'Parisienne', label: 'Parisienne', url: script5Url },
  'script-6': {
    family: 'Pinyon Script',
    label: 'Pinyon Script',
    url: script6Url,
  },
};

export type ScriptFontBytes = Record<ScriptFont, Uint8Array>;

export async function loadScriptFonts(): Promise<ScriptFontBytes> {
  const names = Object.keys(SCRIPT_FACE) as ScriptFont[];
  const loaded = await Promise.all(
    names.map(async (name) => {
      const response = await fetch(SCRIPT_FACE[name].url);
      if (!response.ok) {
        throw new Error('A signature font could not be loaded.');
      }
      return [name, new Uint8Array(await response.arrayBuffer())] as const;
    }),
  );
  return Object.fromEntries(loaded) as ScriptFontBytes;
}

export async function installScriptFaces(): Promise<void> {
  if (typeof document === 'undefined') return;
  await Promise.all(
    (Object.keys(SCRIPT_FACE) as ScriptFont[]).map(async (name) => {
      const face = SCRIPT_FACE[name];
      const loaded = new FontFace(face.family, `url(${face.url})`);
      await loaded.load();
      document.fonts.add(loaded);
    }),
  );
}
