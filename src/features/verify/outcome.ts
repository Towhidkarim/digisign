import type { LocalManifest } from "#/features/sign/manifest.ts";
import type { VerifyRecord } from "#/server/domain/verify.ts";

/** What the page tells the person. One of these always describes a finished check. */
export type Outcome =
	| "valid"
	| "modified"
	| "not-comparable"
	| "record-only"
	| "not-found"
	| "failed-checks"
	| "incomplete";

export type FoundRecord = Extract<VerifyRecord, { found: true }>;

/** What happened when the person's file was compared with the original DigiSign produced. */
export type FileResult =
	/** No file was given (an id-only check). */
	| { kind: "none" }
	/** A file was given but it has no embedded DigiSign manifest. */
	| { kind: "no-manifest" }
	/** The file was compared with a re-created copy of the original. */
	| { kind: "compared"; matches: boolean }
	/** The stored original was fetched but does not match the signed manifest. */
	| { kind: "original-mismatch" }
	/** The original could not be fetched or re-created. */
	| { kind: "error" };

/** The result of fetching and re-rendering the original, before it is compared with the file. */
export type Rendered =
	| { kind: "ok"; sha256: string }
	| { kind: "mismatch" }
	| { kind: "error" };

export function fileResultFromRender(
	rendered: Rendered,
	droppedSha256: string,
): FileResult {
	if (rendered.kind === "mismatch") return { kind: "original-mismatch" };
	if (rendered.kind === "error") return { kind: "error" };
	return { kind: "compared", matches: rendered.sha256 === droppedSha256 };
}

export function recordIsGenuine(record: VerifyRecord): record is FoundRecord {
	if (!record.found) return false;
	const { checks } = record;
	return (
		checks.signature &&
		checks.manifestSha256 &&
		checks.sourceSha256 &&
		checks.auditChain &&
		checks.sourceStored
	);
}

/**
 * Maps the server response and the file result to one outcome. `record` is null when the
 * server could not be reached.
 */
export function decideOutcome(
	record: VerifyRecord | null,
	file: FileResult,
): Outcome {
	if (!record) return "incomplete";
	if (!record.found) return "not-found";
	if (!recordIsGenuine(record)) return "failed-checks";
	switch (file.kind) {
		case "original-mismatch":
			return "failed-checks";
		case "error":
			return "incomplete";
		case "none":
			return "record-only";
		case "no-manifest":
			return "not-comparable";
		case "compared":
			return file.matches ? "valid" : "modified";
	}
}

export type RowKey = "signature" | "record" | "original" | "history" | "file";
export type RowStatus = "passed" | "failed" | "not-checked";
/** Why the file row was not checked. */
export type FileSkip =
	| "no-file"
	| "no-manifest"
	| "unfinished"
	| "record-failed";

export type CheckRows = {
	status: Record<RowKey, RowStatus>;
	fileSkip: FileSkip | null;
};

/** The five rows of "What we checked". Only meaningful when the server found a record. */
export function checkRows(record: FoundRecord, file: FileResult): CheckRows {
	const { checks } = record;
	const originalMismatch = file.kind === "original-mismatch";
	const status: Record<RowKey, RowStatus> = {
		signature: checks.signature ? "passed" : "failed",
		record: checks.manifestSha256 ? "passed" : "failed",
		original:
			checks.sourceSha256 && checks.sourceStored && !originalMismatch
				? "passed"
				: "failed",
		history: checks.auditChain ? "passed" : "failed",
		file: "not-checked",
	};
	const recordFailed = Object.values(status).some(
		(value) => value === "failed",
	);
	let fileSkip: FileSkip | null = null;
	if (recordFailed) fileSkip = "record-failed";
	else if (file.kind === "none") fileSkip = "no-file";
	else if (file.kind === "no-manifest") fileSkip = "no-manifest";
	else if (file.kind === "error") fileSkip = "unfinished";
	else if (file.kind === "compared") {
		status.file = file.matches ? "passed" : "failed";
	}
	return { status, fileSkip };
}

/** The manifest shape the browser renderer embeds, taken from the signed server manifest. */
export function toLocalManifest(record: FoundRecord): LocalManifest {
	const manifest = record.manifest;
	return {
		v: 1,
		documentId: manifest.documentId,
		title: manifest.title,
		source: manifest.source,
		geometrySha256: manifest.geometrySha256,
		layoutSha256: manifest.layoutSha256,
		geometry: manifest.geometry,
		layout: manifest.layout,
		signers: manifest.signers,
		completedAt: manifest.completedAt,
	};
}

const FOOTER =
	/DigiSign · ([0-9A-Za-z]{10,40}) · [0-9a-f]{12} · (\S+?)\/v\/[0-9A-Za-z]+/;

/** Reads the document id and verify origin from a page footer. */
export function parseFooter(
	text: string,
): { documentId: string; origin: string } | null {
	const match = FOOTER.exec(text);
	if (!match?.[1] || !match[2]) return null;
	return { documentId: match[1], origin: match[2] };
}
