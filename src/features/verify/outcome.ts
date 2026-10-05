import type { LocalManifest } from "#/features/sign/manifest.ts";
import type { VerifyRecord } from "#/server/domain/verify.ts";

export type Outcome = "valid" | "modified" | "no-manifest" | "invalid";

export const outcomeText: Record<Outcome, { title: string; detail: string }> = {
	valid: {
		title: "Valid",
		detail: "This file matches the signed record exactly.",
	},
	modified: {
		title: "Records genuine, file modified",
		detail:
			"The signed record is genuine, but this file differs from the one DigiSign produced.",
	},
	"no-manifest": {
		title: "Record found, no embedded manifest",
		detail:
			"A genuine record exists for this document, but this file carries no DigiSign manifest, so it cannot be compared.",
	},
	invalid: {
		title: "Invalid",
		detail: "No genuine signed record backs this document.",
	},
};

export type FoundRecord = Extract<VerifyRecord, { found: true }>;

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

/** Decide the four-way result. `renderedSha256` is the hash of the file DigiSign would produce. */
export function classify(input: {
	record: VerifyRecord;
	embeddedManifest: boolean;
	droppedSha256: string;
	renderedSha256: string | null;
}): Outcome {
	if (!recordIsGenuine(input.record)) return "invalid";
	if (!input.embeddedManifest) return "no-manifest";
	return input.renderedSha256 !== null &&
		input.renderedSha256 === input.droppedSha256
		? "valid"
		: "modified";
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
