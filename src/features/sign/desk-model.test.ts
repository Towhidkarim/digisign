import { describe, expect, it } from "vitest";

import type { FieldInput, FieldValue } from "#/core/contracts/index.ts";
import {
	clearEntries,
	fieldState,
	keyFor,
	loadEntries,
	progressAlt,
	progressLabel,
	progressOf,
	requiredFields,
	saveEntries,
} from "#/features/sign/desk-model.ts";

function field(
	id: string,
	kind: FieldInput["kind"],
	y: number,
	required = true,
): FieldInput {
	return {
		id,
		signerId: "s1",
		pageIndex: 0,
		kind,
		x: 0,
		y,
		w: 100_000,
		h: 40_000,
		required,
	};
}

const fields = [
	field("A", "signature", 10),
	field("B", "text", 20),
	field("C", "checkbox", 30),
	field("D", "date_signed", 40),
	field("E", "full_name", 50),
	field("F", "text", 60, false),
];

const signature: FieldValue = {
	fieldId: "A",
	signature: { kind: "typed", text: "Ava", font: "script-1" },
};

describe("progress", () => {
	it("counts only required fields the signer has to act on", () => {
		expect(requiredFields(fields).map((item) => item.id)).toEqual([
			"A",
			"B",
			"C",
		]);
		const none = progressOf(fields, []);
		expect(none).toMatchObject({ total: 3, done: 0, left: 3, complete: false });
		expect(none.currentId).toBe("A");
		expect(progressLabel(none)).toBe("3 fields left");
	});

	it("moves the current field to the first one still empty", () => {
		const some = progressOf(fields, [
			signature,
			{ fieldId: "C", checked: true },
		]);
		expect(some.done).toBe(2);
		expect(some.currentId).toBe("B");
		expect(some.segments).toEqual([true, false, true]);
		expect(progressLabel(some)).toBe("1 field left");
		expect(progressAlt(some)).toBe("1 field left. 2 of 3 done.");
	});

	it("is complete once every required field is filled", () => {
		const all = progressOf(fields, [
			signature,
			{ fieldId: "B", text: "TW-1042" },
			{ fieldId: "C", checked: true },
		]);
		expect(all.complete).toBe(true);
		expect(all.currentId).toBeNull();
		expect(progressLabel(all)).toBe("All fields done");
	});

	it("does not count a blank text field or an unticked box", () => {
		const progress = progressOf(fields, [
			signature,
			{ fieldId: "B", text: "   " },
			{ fieldId: "C", checked: false },
		]);
		expect(progress.done).toBe(1);
	});

	it("labels each field To do, Next or Done", () => {
		const progress = progressOf(fields, [signature]);
		const at = (id: string) =>
			fields.find((item) => item.id === id) as FieldInput;
		expect(fieldState(at("A"), progress, [signature])).toBe("done");
		expect(fieldState(at("B"), progress, [signature])).toBe("next");
		expect(fieldState(at("C"), progress, [signature])).toBe("todo");
	});
});

function memory() {
	const data = new Map<string, string>();
	return {
		getItem: (key: string) => data.get(key) ?? null,
		setItem: (key: string, value: string) => void data.set(key, value),
		removeItem: (key: string) => void data.delete(key),
		data,
	};
}

describe("kept entries", () => {
	it("round-trips by document and signer, never by token", () => {
		const store = memory();
		saveEntries("DOC", "s1", [signature], store);
		expect([...store.data.keys()]).toEqual(["digisign.entries.DOC.s1"]);
		expect(loadEntries("DOC", "s1", fields, store)).toEqual([signature]);
		expect(loadEntries("DOC", "s2", fields, store)).toEqual([]);
	});

	it("drops entries for fields that no longer exist, and bad data", () => {
		const store = memory();
		saveEntries(
			"DOC",
			"s1",
			[signature, { fieldId: "GONE", text: "x" }],
			store,
		);
		expect(loadEntries("DOC", "s1", fields, store)).toEqual([signature]);
		store.setItem("digisign.entries.DOC.s1", "not json");
		expect(loadEntries("DOC", "s1", fields, store)).toEqual([]);
	});

	it("is cleared after a signature", () => {
		const store = memory();
		saveEntries("DOC", "s1", [signature], store);
		clearEntries("DOC", "s1", store);
		expect(loadEntries("DOC", "s1", fields, store)).toEqual([]);
	});

	it("never stores consent", () => {
		const store = memory();
		saveEntries("DOC", "s1", [signature], store);
		expect(JSON.stringify([...store.data.values()])).not.toContain("consent");
	});
});

describe("idempotency key", () => {
	it("reuses the key for the same request and changes it for a different one", () => {
		let n = 0;
		const make = () => `key-${++n}`;
		const first = keyFor(null, "a", make);
		expect(keyFor(first, "a", make).key).toBe(first.key);
		expect(keyFor(first, "b", make).key).not.toBe(first.key);
	});
});
