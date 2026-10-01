import { containFit } from "#/core/coords.ts";
import type { Stroke } from "#/core/strokes-codec.ts";

export type Fraction = { x: number; y: number };

export function inkFractions(
	box: { w: number; h: number },
	strokes: readonly Stroke[],
	fieldW: number,
	fieldH: number,
): Fraction[][] {
	const fit = containFit(box.w, box.h, fieldW, fieldH);
	if (fieldW <= 0 || fieldH <= 0) return [];
	return strokes.map((stroke) =>
		stroke.map(([sx, sy]) => ({
			x: (fit.x + (sx / box.w) * fit.w) / fieldW,
			y: (fit.y + (sy / box.h) * fit.h) / fieldH,
		})),
	);
}

export function checkFractions(): Fraction[] {
	return [
		{ x: 0.18, y: 0.52 },
		{ x: 0.4, y: 0.78 },
		{ x: 0.82, y: 0.22 },
	];
}
