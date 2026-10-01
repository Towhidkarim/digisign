import { describe, expect, it } from "vitest";

import type {
	PageGeometryInput,
	SaveLayoutInput,
} from "#/core/contracts/index.ts";
import { signingStateHash } from "#/features/sign/state-hash.ts";

const geometry: PageGeometryInput[] = [
	{
		mediaBox: [0, 0, 200, 200],
		cropBox: [0, 0, 200, 200],
		rotate: 0,
	},
];

const layout: SaveLayoutInput = {
	documentId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
	layoutVersion: 1,
	fields: [],
};

describe("signing state hash", () => {
	it("stays the same for the same source, geometry, layout, and evidence", async () => {
		const input = {
			sourceSha256: "a".repeat(64),
			geometry,
			layout,
			priorEvidenceSha256: ["b".repeat(64)],
		};
		expect(await signingStateHash(input)).toBe(await signingStateHash(input));
	});

	it("changes when an earlier signer’s evidence changes", async () => {
		const first = await signingStateHash({
			sourceSha256: "a".repeat(64),
			geometry,
			layout,
			priorEvidenceSha256: ["b".repeat(64)],
		});
		const second = await signingStateHash({
			sourceSha256: "a".repeat(64),
			geometry,
			layout,
			priorEvidenceSha256: ["c".repeat(64)],
		});
		expect(first).not.toBe(second);
	});
});
