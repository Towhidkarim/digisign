import type { SignatureInput } from '#/core/contracts/index.ts';
import { limits } from '#/core/limits.ts';
import {
  decodeStrokes,
  encodeStrokes,
  type Stroke,
} from '#/core/strokes-codec.ts';

export const CAPTURE_BOX = { w: 9000, h: 3000 } as const;

export const SCRIPT_FONTS = [
  'script-1',
  'script-2',
  'script-3',
  'script-4',
  'script-5',
  'script-6',
] as const;
export type ScriptFont = (typeof SCRIPT_FONTS)[number];

export function pointsToStrokes(
  groups: readonly { points: readonly { x: number; y: number }[] }[],
  canvasWidth: number,
  canvasHeight: number,
): Stroke[] {
  if (canvasWidth <= 0 || canvasHeight <= 0) return [];
  const strokes: Stroke[] = [];
  for (const group of groups) {
    const stroke: [number, number][] = [];
    for (const point of group.points) {
      stroke.push([
        clampCoord((point.x / canvasWidth) * CAPTURE_BOX.w),
        clampCoord((point.y / canvasHeight) * CAPTURE_BOX.h),
      ]);
    }
    if (stroke.length > 0) strokes.push(stroke);
  }
  return strokes;
}

export function strokesToCanvasPoints(
  strokes: readonly Stroke[],
  canvasWidth: number,
  canvasHeight: number,
): { x: number; y: number; pressure: number; time: number }[][] {
  return strokes.map((stroke) =>
    stroke.map(([x, y]) => ({
      x: (x / CAPTURE_BOX.w) * canvasWidth,
      y: (y / CAPTURE_BOX.h) * canvasHeight,
      pressure: 0.5,
      time: 0,
    })),
  );
}

export function drawnSignature(
  strokes: readonly Stroke[],
): Extract<SignatureInput, { kind: 'drawn' }> {
  return {
    kind: 'drawn',
    box: { w: CAPTURE_BOX.w, h: CAPTURE_BOX.h },
    strokes: encodeStrokes(strokes),
  };
}

export function typedSignature(text: string, font: ScriptFont): SignatureInput {
  return { kind: 'typed', text: text.trim(), font };
}

export function unpackStrokes(packed: string): Stroke[] {
  const data = decodeStrokes(packed);
  const strokes: Stroke[] = [];
  let index = 0;
  while (index < data.length) {
    const count = data[index] ?? 0;
    index += 1;
    const stroke: [number, number][] = [];
    for (let point = 0; point < count; point += 1) {
      stroke.push([data[index] ?? 0, data[index + 1] ?? 0]);
      index += 2;
    }
    strokes.push(stroke);
  }
  return strokes;
}

function clampCoord(value: number): number {
  const rounded = Math.round(value);
  return Math.min(limits.strokeCoordMax, Math.max(0, rounded));
}
