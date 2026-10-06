import { expect, it } from "vitest";

import {
	checkRows,
	decideOutcome,
	type FileResult,
	type FoundRecord,
	fileResultFromRender,
} from "#/features/verify/outcome.ts";
import type { VerifyRecord } from "#/server/domain/verify.ts";

function record(overrides: Partial<FoundRecord["checks"]> = {}): FoundRecord {
	return {
		found: true,
		documentId: "ABCDEFGHIJK",
		checks: {
			signature: true,
			manifestSha256: true,
			sourceSha256: true,
			auditChain: true,
			sourceStored: true,
			...overrides,
		},
	} as FoundRecord;
}

const none: FileResult = { kind: "none" };

it("maps a genuine record and a matching file to valid", () => {
	expect(decideOutcome(record(), { kind: "compared", matches: true })).toBe(
		"valid",
	);
});

it("maps differing hashes to modified", () => {
	expect(decideOutcome(record(), { kind: "compared", matches: false })).toBe(
		"modified",
	);
});

it("maps a file without a manifest to not-comparable", () => {
	expect(decideOutcome(record(), { kind: "no-manifest" })).toBe(
		"not-comparable",
	);
});

it("maps an id-only check to record-only", () => {
	expect(decideOutcome(record(), none)).toBe("record-only");
});

it("maps found:false to not-found, whatever the file", () => {
	const missing: VerifyRecord = { found: false };
	expect(decideOutcome(missing, none)).toBe("not-found");
	expect(decideOutcome(missing, { kind: "no-manifest" })).toBe("not-found");
});

it.each([
	"signature",
	"manifestSha256",
	"sourceSha256",
	"auditChain",
	"sourceStored",
] as const)("maps a false %s check to failed-checks", (name) => {
	expect(decideOutcome(record({ [name]: false }), none)).toBe("failed-checks");
	expect(
		decideOutcome(record({ [name]: false }), {
			kind: "compared",
			matches: true,
		}),
	).toBe("failed-checks");
});

it("maps an unreachable server to incomplete", () => {
	expect(decideOutcome(null, none)).toBe("incomplete");
});

it("maps a fetch or render error to incomplete", () => {
	expect(decideOutcome(record(), { kind: "error" })).toBe("incomplete");
});

it("treats a stored original that does not match the manifest as failed-checks, not a retry", () => {
	const file = fileResultFromRender({ kind: "mismatch" }, "aa");
	expect(file).toEqual({ kind: "original-mismatch" });
	expect(decideOutcome(record(), file)).toBe("failed-checks");
});

it("turns render results into file results", () => {
	expect(fileResultFromRender({ kind: "error" }, "aa")).toEqual({
		kind: "error",
	});
	expect(fileResultFromRender({ kind: "ok", sha256: "aa" }, "aa")).toEqual({
		kind: "compared",
		matches: true,
	});
	expect(fileResultFromRender({ kind: "ok", sha256: "bb" }, "aa")).toEqual({
		kind: "compared",
		matches: false,
	});
});

it("marks 'Original document on record' failed when the stored original mismatches", () => {
	const rows = checkRows(record(), { kind: "original-mismatch" });
	expect(rows.status.original).toBe("failed");
	expect(rows.status.file).toBe("not-checked");
	expect(rows.fileSkip).toBe("record-failed");
});

it("combines sourceSha256 and sourceStored in one row", () => {
	expect(checkRows(record({ sourceStored: false }), none).status.original).toBe(
		"failed",
	);
	expect(checkRows(record({ sourceSha256: false }), none).status.original).toBe(
		"failed",
	);
});

it("explains why the file row was not checked", () => {
	expect(checkRows(record(), none).fileSkip).toBe("no-file");
	expect(checkRows(record(), { kind: "no-manifest" }).fileSkip).toBe(
		"no-manifest",
	);
	expect(checkRows(record(), { kind: "error" }).fileSkip).toBe("unfinished");
	expect(checkRows(record({ auditChain: false }), none).fileSkip).toBe(
		"record-failed",
	);
});

it("fills the file row when the file was compared", () => {
	expect(
		checkRows(record(), { kind: "compared", matches: true }).status.file,
	).toBe("passed");
	expect(
		checkRows(record(), { kind: "compared", matches: false }).status.file,
	).toBe("failed");
});
