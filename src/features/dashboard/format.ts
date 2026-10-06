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

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function startOfDay(ms: number): number {
	const date = new Date(ms);
	return new Date(
		date.getFullYear(),
		date.getMonth(),
		date.getDate(),
	).getTime();
}

/** Relative for the last 7 days, absolute after that. The full time goes in a tooltip. */
export function formatRelative(ms: number, now = Date.now()): string {
	const elapsed = now - ms;
	if (elapsed < MINUTE) return "Just now";
	if (elapsed < HOUR) {
		const minutes = Math.floor(elapsed / MINUTE);
		return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
	}
	const days = Math.round((startOfDay(now) - startOfDay(ms)) / 86_400_000);
	if (days === 0) {
		const hours = Math.floor(elapsed / HOUR);
		return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
	}
	if (days === 1) return "Yesterday";
	if (days < 7) return `${days} days ago`;
	return formatUpdated(ms);
}

function plural(count: number, word: string): string {
	return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/** The one line under a document title: who it is waiting on, or what happened. */
export function metaLine(document: OwnedDocument): string {
	const { status, signers, signed, waitingOn } = document;
	if (status === "in_progress") {
		return waitingOn
			? `Waiting on ${waitingOn}`
			: `${signed} of ${signers} signed`;
	}
	if (status === "draft") {
		return signers === 0
			? "No signers added yet"
			: `${plural(signers, "signer")} added, not sent`;
	}
	if (status === "completed") {
		if (signers === 1) return "Signed by 1 signer";
		return signers === 2
			? "Signed by both signers"
			: `Signed by all ${signers} signers`;
	}
	if (status === "declined") {
		return signers > 0
			? `Declined after ${signed} of ${signers} signed`
			: "Declined";
	}
	if (status === "expired") {
		return signers > 0
			? `Expired with ${signed} of ${signers} signed`
			: "Expired";
	}
	return "Voided";
}
