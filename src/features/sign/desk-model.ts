import type { FieldInput, FieldValue } from "#/core/contracts/index.ts";

/** A required field is done when the signer has given it something the server will accept. */
export function fieldFilled(
	field: FieldInput,
	values: readonly FieldValue[],
): boolean {
	if (field.kind === "date_signed" || field.kind === "full_name") return true;
	const value = values.find((item) => item.fieldId === field.id);
	if (!value) return false;
	if (field.kind === "signature" || field.kind === "initials") {
		return value.signature !== undefined;
	}
	if (field.kind === "checkbox") return value.checked === true;
	return (value.text ?? "").trim().length > 0;
}

/** Fields the signer has to act on, in reading order (page, then top to bottom, then left). */
export function requiredFields(fields: readonly FieldInput[]): FieldInput[] {
	return fields
		.filter(
			(field) =>
				field.required &&
				field.kind !== "date_signed" &&
				field.kind !== "full_name",
		)
		.sort(
			(left, right) =>
				left.pageIndex - right.pageIndex ||
				left.y - right.y ||
				left.x - right.x,
		);
}

export type Progress = {
	total: number;
	done: number;
	left: number;
	complete: boolean;
	/** The first required field that is still empty. */
	currentId: string | null;
	/** One entry per required field, for the segmented bar. */
	segments: boolean[];
};

export function progressOf(
	fields: readonly FieldInput[],
	values: readonly FieldValue[],
): Progress {
	const required = requiredFields(fields);
	const segments = required.map((field) => fieldFilled(field, values));
	const done = segments.filter(Boolean).length;
	const current = required.find((_, index) => !segments[index]);
	return {
		total: required.length,
		done,
		left: required.length - done,
		complete: done === required.length,
		currentId: current?.id ?? null,
		segments,
	};
}

export function progressLabel(progress: Progress): string {
	if (progress.complete) return "All fields done";
	return progress.left === 1 ? "1 field left" : `${progress.left} fields left`;
}

/** The text alternative for the progress bar. */
export function progressAlt(progress: Progress): string {
	return `${progressLabel(progress)}. ${progress.done} of ${progress.total} done.`;
}

/** The bar is split per field up to this many fields, then it is one continuous bar. */
export const SEGMENT_LIMIT = 8;

export type FieldState = "todo" | "next" | "done";

export function fieldState(
	field: FieldInput,
	progress: Progress,
	values: readonly FieldValue[],
): FieldState {
	if (fieldFilled(field, values)) return "done";
	return field.id === progress.currentId ? "next" : "todo";
}

const STORAGE_PREFIX = "digisign.entries";

function storageKey(documentId: string, signerId: string): string {
	return `${STORAGE_PREFIX}.${documentId}.${signerId}`;
}

/**
 * Entries the signer has made are kept for this tab only, keyed by document and signer (never
 * by the link token). Consent is not kept: it is given again each time.
 */
export function saveEntries(
	documentId: string,
	signerId: string,
	values: readonly FieldValue[],
	storage: Pick<Storage, "setItem" | "removeItem"> | null = safeStorage(),
): void {
	if (!storage) return;
	try {
		if (values.length === 0)
			storage.removeItem(storageKey(documentId, signerId));
		else {
			storage.setItem(
				storageKey(documentId, signerId),
				JSON.stringify({ v: 1, values }),
			);
		}
	} catch {
		// Storage full or blocked: the page still works, entries just won't survive a refresh.
	}
}

export function loadEntries(
	documentId: string,
	signerId: string,
	fields: readonly FieldInput[],
	storage: Pick<Storage, "getItem"> | null = safeStorage(),
): FieldValue[] {
	if (!storage) return [];
	try {
		const raw = storage.getItem(storageKey(documentId, signerId));
		if (!raw) return [];
		const parsed = JSON.parse(raw) as { v?: number; values?: unknown };
		if (parsed.v !== 1 || !Array.isArray(parsed.values)) return [];
		const ids = new Set(fields.map((field) => field.id));
		return (parsed.values as FieldValue[]).filter(
			(value) => typeof value?.fieldId === "string" && ids.has(value.fieldId),
		);
	} catch {
		return [];
	}
}

export function clearEntries(
	documentId: string,
	signerId: string,
	storage: Pick<Storage, "removeItem"> | null = safeStorage(),
): void {
	try {
		storage?.removeItem(storageKey(documentId, signerId));
	} catch {
		// Nothing to clear.
	}
}

function safeStorage(): Storage | null {
	try {
		return typeof sessionStorage === "undefined" ? null : sessionStorage;
	} catch {
		return null;
	}
}

/** The same key for the same request, so a retry after a dropped connection cannot sign twice. */
export function keyFor(
	current: { key: string; body: string } | null,
	body: string,
	make: () => string = () => crypto.randomUUID(),
): { key: string; body: string } {
	return current && current.body === body ? current : { key: make(), body };
}

/** Where the invite page leaves the link so a timed-out session can be re-opened. Never logged. */
export const INVITE_TOKEN_KEY = "digisign.invite";
