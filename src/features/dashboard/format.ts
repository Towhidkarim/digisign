import type { OwnedDocument } from "#/server/domain/documents.ts";

const STATUS_LABEL: Record<string, string> = {
	draft: "Draft",
	in_progress: "Out for signature",
	completed: "Completed",
	declined: "Declined",
	voided: "Voided",
	expired: "Expired",
};

const MONTHS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
];

export function statusLabel(status: string): string {
	return STATUS_LABEL[status] ?? status;
}

/** Status color from the existing ink, harbor, and red. Draft stays quiet. */
export function statusTone(status: string): string {
	if (status === "in_progress") return "text-primary";
	if (status === "completed") return "text-foreground";
	if (status === "declined" || status === "voided" || status === "expired") {
		return "text-destructive";
	}
	return "text-muted-foreground";
}

/** A stored filename reads as a document name. The stored title is unchanged. */
export function displayTitle(title: string): string {
	return title.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
}

export function formatUpdated(ms: number): string {
	const date = new Date(ms);
	const month = MONTHS[date.getMonth()] ?? "";
	return `${date.getDate()} ${month} ${date.getFullYear()}`;
}

export function formatWhen(ms: number): string {
	const date = new Date(ms);
	const hours = date.getHours();
	const minutes = String(date.getMinutes()).padStart(2, "0");
	const suffix = hours >= 12 ? "pm" : "am";
	const hour = hours % 12 || 12;
	return `${formatUpdated(ms)}, ${hour}:${minutes} ${suffix}`;
}

const EVENT_LABEL: Record<string, string> = {
	"document.created": "Created",
	"document.source_uploaded": "PDF stored",
	"document.published": "Sent for signature",
	"document.completed": "Completed",
	"document.voided": "Voided",
	"document.expired": "Expired",
	"document.declined": "Declined",
	"signer.invited": "Link sent",
	"signer.viewed": "Opened",
	"signer.signed": "Signed",
	"signer.declined": "Declined",
};

export function eventLabel(type: string, reissue: boolean): string {
	if (type === "signer.invited" && reissue) return "Link sent again";
	return EVENT_LABEL[type] ?? "Recorded";
}

const SIGNER_LABEL: Record<string, string> = {
	pending: "Not sent yet",
	invited: "Waiting",
	signed: "Signed",
	declined: "Declined",
	voided: "Voided",
};

export function signerLabel(status: string): string {
	return SIGNER_LABEL[status] ?? status;
}

export function signerTone(status: string): string {
	if (status === "invited") return statusTone("in_progress");
	if (status === "signed") return statusTone("completed");
	if (status === "declined" || status === "voided")
		return statusTone("declined");
	return statusTone("draft");
}

function countPhrase(count: number, word: string, plural = `${word}s`): string {
	if (count === 0) return "";
	return `${count} ${count === 1 ? word : plural}`;
}

/** One sentence of the counts that are above zero. Empty when there is nothing to say. */
export function countSentence(documents: readonly OwnedDocument[]): string {
	const count = (status: string) =>
		documents.filter((document) => document.status === status).length;
	return [
		countPhrase(count("draft"), "draft"),
		countPhrase(count("in_progress"), "out for signature", "out for signature"),
		countPhrase(count("completed"), "completed", "completed"),
		countPhrase(count("declined"), "declined", "declined"),
		countPhrase(count("voided"), "voided", "voided"),
		countPhrase(count("expired"), "expired", "expired"),
	]
		.filter((part) => part.length > 0)
		.join(", ");
}

const STILL_OPEN = new Set(["draft", "in_progress"]);

/** Unfinished documents first, then the rest. The list is already newest-first. */
export function deskPreview(
	documents: readonly OwnedDocument[],
	limit: number,
): OwnedDocument[] {
	const open = documents.filter((document) => STILL_OPEN.has(document.status));
	const settled = documents.filter(
		(document) => !STILL_OPEN.has(document.status),
	);
	return [...open, ...settled].slice(0, limit);
}

/** Who is holding it, how far signing has got, and when it expires. */
export function progressLine(document: OwnedDocument): string {
	return [
		document.waitingOn ? `Waiting on ${document.waitingOn}` : "",
		document.signers > 0
			? `${document.signed} of ${document.signers} signed`
			: "",
		document.expiresAt != null && document.status === "in_progress"
			? `Expires ${formatUpdated(document.expiresAt)}`
			: "",
	]
		.filter((part) => part.length > 0)
		.join(". ");
}
