import { describe, expect, it } from "vitest";

import type { FieldInput } from "#/core/contracts/index.ts";
import { publishBlocker } from "#/server/domain/publish-rules.ts";
import {
	checkSigners,
	countIssues,
	isReady,
	SIGNER_MESSAGES,
} from "./signer-rules.ts";

function field(signerId: string, kind: FieldInput["kind"]): FieldInput {
	return {
		id: `${signerId}-${kind}`.padEnd(26, "0").toUpperCase(),
		signerId,
		pageIndex: 0,
		kind,
		x: 100_000,
		y: 100_000,
		w: 200_000,
		h: 60_000,
		required: true,
	};
}

const ada = { id: "a", name: "Ada", email: "ada@example.com" };
const bo = { id: "b", name: "Bo", email: "bo@example.com" };

describe("checkSigners", () => {
	it("passes a signer with a name, an email and a signature field", () => {
		const [check] = checkSigners([ada], [field("a", "signature")]);
		expect(check).toEqual({ name: false, email: null, signature: false });
		expect(check && isReady(check)).toBe(true);
	});

	it("accepts initials as the signing field", () => {
		const [check] = checkSigners([ada], [field("a", "initials")]);
		expect(check?.signature).toBe(false);
	});

	it("flags a blank or whitespace name", () => {
		const checks = checkSigners(
			[
				{ ...ada, name: "" },
				{ ...bo, name: "   " },
			],
			[field("a", "signature"), field("b", "signature")],
		);
		expect(checks.map((check) => check.name)).toEqual([true, true]);
	});

	it("flags a missing email and a badly formed one", () => {
		const checks = checkSigners(
			[
				{ ...ada, email: "" },
				{ ...bo, email: "bo@example" },
			],
			[field("a", "signature"), field("b", "signature")],
		);
		expect(checks.map((check) => check.email)).toEqual(["missing", "invalid"]);
	});

	it("flags every signer who shares an email, ignoring case and spaces", () => {
		const checks = checkSigners(
			[ada, { ...bo, email: "  ADA@Example.com " }, { ...bo, id: "c" }],
			[
				field("a", "signature"),
				field("b", "signature"),
				field("c", "signature"),
			],
		);
		expect(checks.map((check) => check.email)).toEqual([
			"duplicate",
			"duplicate",
			null,
		]);
	});

	it("does not call two empty emails duplicates", () => {
		const checks = checkSigners(
			[
				{ ...ada, email: "" },
				{ ...bo, email: "" },
			],
			[],
		);
		expect(checks.map((check) => check.email)).toEqual(["missing", "missing"]);
	});

	it.each([
		"text",
		"date_signed",
		"full_name",
		"checkbox",
	] as const)("does not count a %s field as a way to sign", (kind) => {
		const [check] = checkSigners([ada], [field("a", kind)]);
		expect(check?.signature).toBe(true);
	});

	it("only counts fields that belong to that signer", () => {
		const checks = checkSigners([ada, bo], [field("a", "signature")]);
		expect(checks.map((check) => check.signature)).toEqual([false, true]);
	});
});

describe("countIssues", () => {
	it("counts each failed rule on each signer once", () => {
		const checks = checkSigners(
			[ada, { id: "b", name: "", email: "" }],
			[field("a", "signature")],
		);
		// Bo: name, email, signature.
		expect(countIssues(checks)).toBe(3);
	});

	it("is zero when everything is ready", () => {
		const checks = checkSigners(
			[ada, bo],
			[field("a", "signature"), field("b", "initials")],
		);
		expect(countIssues(checks)).toBe(0);
	});
});

describe("agreement with the server's publish check", () => {
	const geometry = JSON.stringify([
		{ mediaBox: [0, 0, 612, 792], cropBox: [0, 0, 612, 792], rotate: 0 },
	]);
	const blocker = (
		signers: { id: string; name: string; email: string }[],
		fields: FieldInput[],
	) =>
		publishBlocker({
			uploadStatus: "uploaded",
			pageCount: 1,
			geometryJson: geometry,
			signers,
			fields,
		});

	it("uses the same messages", () => {
		expect(blocker([{ ...ada, name: " " }], [field("a", "signature")])).toBe(
			SIGNER_MESSAGES.name,
		);
		expect(
			blocker([{ ...ada, email: "nope" }], [field("a", "signature")]),
		).toBe(SIGNER_MESSAGES.email);
		expect(blocker([ada], [field("a", "text")])).toBe(
			SIGNER_MESSAGES.signature,
		);
	});

	it("agrees on what is ready", () => {
		const signers = [ada, bo];
		const fields = [field("a", "signature"), field("b", "signature")];
		expect(countIssues(checkSigners(signers, fields))).toBe(0);
		expect(blocker(signers, fields)).toBeNull();
	});
});
