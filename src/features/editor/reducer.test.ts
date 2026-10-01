import { describe, expect, it } from "vitest";
import { saveLayoutInputSchema } from "#/core/contracts/index.ts";
import type { PageGeometry } from "#/core/coords.ts";
import { footerStripMicro, MICRO, ptToMicro } from "#/core/coords.ts";
import {
	createEditorState,
	type EditorState,
	editorReducer,
	toSaveLayout,
} from "#/features/editor/reducer.ts";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

const letter: PageGeometry = {
	mediaBox: [0, 0, 612, 792],
	cropBox: [0, 0, 612, 792],
	rotate: 0,
};

function id(value: number): string {
	let rest = value;
	let out = "";
	for (let index = 0; index < 26; index += 1) {
		out = (ALPHABET[rest % 32] ?? "0") + out;
		rest = Math.floor(rest / 32);
	}
	return out;
}

function desk(pages = 1): EditorState {
	return createEditorState({
		documentId: id(1),
		geometry: Array.from({ length: pages }, () => ({ ...letter })),
		signers: [{ id: id(2), name: "Ava", color: "#C4622D" }],
	});
}

describe("editor reducer", () => {
	it("round-trips a layout as integers", () => {
		const placed = editorReducer(desk(), {
			type: "place",
			id: id(10),
			pageIndex: 0,
			kind: "signature",
			x: 400_000,
			y: 200_000,
		});
		const moved = editorReducer(placed, {
			type: "move",
			id: id(10),
			x: 20_000,
			y: 30_000,
			record: true,
		});
		const nudged = editorReducer(moved, {
			type: "nudge",
			id: id(10),
			dx: 5,
			dy: -3,
		});
		const layout = toSaveLayout(nudged);
		expect(saveLayoutInputSchema.parse(layout)).toEqual(layout);
		for (const field of layout.fields) {
			expect(Number.isInteger(field.x)).toBe(true);
			expect(Number.isInteger(field.y)).toBe(true);
			expect(Number.isInteger(field.w)).toBe(true);
			expect(Number.isInteger(field.h)).toBe(true);
		}
		const loaded = createEditorState({
			documentId: layout.documentId,
			geometry: nudged.geometry,
			signers: nudged.signers,
			fields: layout.fields,
			layoutVersion: layout.layoutVersion,
		});
		expect(toSaveLayout(loaded).fields).toEqual(layout.fields);
	});

	it("undoes and redoes a place, and treats a drag as one step", () => {
		const placed = editorReducer(desk(), {
			type: "place",
			id: id(10),
			pageIndex: 0,
			kind: "signature",
			x: 100_000,
			y: 100_000,
		});
		const undone = editorReducer(placed, { type: "undo" });
		expect(undone.fields).toEqual([]);
		const redone = editorReducer(undone, { type: "redo" });
		expect(redone.fields).toEqual(placed.fields);

		const first = editorReducer(placed, {
			type: "move",
			id: id(10),
			x: 40_000,
			y: 40_000,
			record: true,
		});
		const second = editorReducer(first, {
			type: "move",
			id: id(10),
			x: 50_000,
			y: 40_000,
			record: false,
		});
		expect(editorReducer(second, { type: "undo" }).fields[0]?.x).toBe(
			placed.fields[0]?.x,
		);
	});

	it("keeps a field on its page, above the footer, and at least the minimum size", () => {
		const placed = editorReducer(desk(), {
			type: "place",
			id: id(11),
			pageIndex: 0,
			kind: "signature",
			x: 500_000,
			y: MICRO,
		});
		const field = placed.fields[0];
		expect(field).toBeDefined();
		if (!field) return;
		expect(field.pageIndex).toBe(0);
		expect(field.y + field.h).toBeLessThanOrEqual(
			MICRO - footerStripMicro(letter),
		);
		expect(field.x + field.w).toBeLessThanOrEqual(MICRO);

		const shrunk = editorReducer(placed, {
			type: "resize",
			id: field.id,
			x: field.x,
			y: field.y,
			w: 1,
			h: 1,
			record: true,
		});
		expect(shrunk.fields[0]?.w).toBeGreaterThanOrEqual(ptToMicro(60, 612));
		expect(shrunk.fields[0]?.h).toBeGreaterThanOrEqual(ptToMicro(20, 792));
		expect(shrunk.fields[0]?.pageIndex).toBe(0);
	});

	it("stops at 40 fields on a page and 300 in the document", () => {
		let crowded = desk();
		for (let index = 0; index < 41; index += 1) {
			crowded = editorReducer(crowded, {
				type: "place",
				id: id(1_000 + index),
				pageIndex: 0,
				kind: "initials",
				x: 10_000,
				y: 10_000,
			});
		}
		expect(crowded.fields).toHaveLength(40);

		let full = desk(8);
		for (let index = 0; index < 301; index += 1) {
			full = editorReducer(full, {
				type: "place",
				id: id(2_000 + index),
				pageIndex: Math.floor(index / 40),
				kind: "initials",
				x: 10_000,
				y: 10_000,
			});
		}
		expect(full.fields).toHaveLength(300);
	});
});
