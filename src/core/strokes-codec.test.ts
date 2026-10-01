import { describe, expect, it } from "vitest";

import { limits } from "#/core/limits.ts";
import {
	decodeStrokes,
	encodeStrokes,
	validatePackedStrokes,
} from "#/core/strokes-codec.ts";

describe("strokes codec", () => {
	it("round-trips strokes exactly", () => {
		const packed = encodeStrokes([
			[
				[0, 0],
				[10, 20],
			],
			[[100, 200]],
		]);
		expect(Array.from(decodeStrokes(packed))).toEqual([
			2, 0, 0, 10, 20, 1, 100, 200,
		]);
		expect(validatePackedStrokes(packed)).toBeNull();
	});

	it("accepts an empty signature", () => {
		expect(validatePackedStrokes("")).toBeNull();
		expect(Array.from(decodeStrokes(""))).toEqual([]);
	});

	it("rejects too many strokes, points, coordinates, and oversized text", () => {
		const strokes = Array.from({ length: limits.drawnStrokes + 1 }, () => [
			[0, 0] as const,
		]);
		expect(() => encodeStrokes(strokes)).toThrow(/strokes/);
		expect(() =>
			encodeStrokes([
				Array.from({ length: limits.drawnPoints + 1 }, () => [1, 1] as const),
			]),
		).toThrow(/points/);
		expect(() => encodeStrokes([[[limits.strokeCoordMax + 1, 0]]])).toThrow(
			/outside/,
		);
		expect(
			validatePackedStrokes("A".repeat(limits.strokesBase64MaxChars + 1)),
		).toMatch(/ink/);
		expect(validatePackedStrokes("@@@")).toMatch(/not valid/);
	});
});
