import type {
	SaveLayoutInput,
	SubmitSignatureInput,
	UploadInit,
} from "#/core/contracts/index.ts";
import {
	saveLayoutInputSchema,
	uploadInitSchema,
} from "#/core/contracts/index.ts";
import { sha256Hex } from "#/core/hash.ts";
import { ulid } from "#/core/ulid.ts";
import { type EditorSigner, SIGNER_COLORS } from "#/features/editor/reducer.ts";
import type { SigningContext } from "#/features/sign/session.ts";
import { readUpload } from "#/pdf/load.ts";
import {
	createDraftFn,
	getDraftFn,
	initUploadFn,
	publishFn,
	reissueInviteFn,
	savePreparationFn,
} from "#/server/documents.ts";
import {
	declineSignatureFn,
	getSigningContextFn,
	submitSignatureFn,
} from "#/server/signing.ts";

const STORAGE_KEY = "digisign.prepare.v1";

export type Draft = {
	fileName: string;
	bytes: Uint8Array | null;
	upload: UploadInit | null;
	signers: EditorSigner[];
	layout: SaveLayoutInput | null;
};

type StoredDraft = {
	fileName: string;
	fileBase64: string | null;
	upload: UploadInit;
	signers: EditorSigner[];
	layout: SaveLayoutInput;
};

let draft: Draft = emptyDraft();
let cachedBase64: string | null = null;
let hydrated = false;

export function getDraft(): Draft {
	return draft;
}

export function defaultSigner(): EditorSigner {
	return {
		id: ulid(),
		name: "Signer 1",
		email: "",
		color: SIGNER_COLORS[0],
	};
}

export function hydrateDraft(): Draft {
	if (hydrated) return draft;
	hydrated = true;
	if (typeof sessionStorage === "undefined") return draft;
	const raw = sessionStorage.getItem(STORAGE_KEY);
	if (!raw) return draft;
	try {
		const parsed = JSON.parse(raw) as StoredDraft;
		const upload = uploadInitSchema.safeParse(parsed.upload);
		const layout = saveLayoutInputSchema.safeParse(parsed.layout);
		if (!upload.success || !layout.success) return draft;
		const signers = Array.isArray(parsed.signers)
			? parsed.signers.filter(isSigner)
			: [];
		cachedBase64 =
			typeof parsed.fileBase64 === "string" ? parsed.fileBase64 : null;
		draft = {
			fileName:
				typeof parsed.fileName === "string" ? parsed.fileName : "Document",
			bytes: cachedBase64 ? base64ToBytes(cachedBase64) : null,
			upload: upload.data,
			signers: (signers.length > 0 ? signers : [defaultSigner()]).map((signer) => ({
				...signer,
				email: signer.email ?? "",
				color: currentSignerColor(signer.color),
			})),
			layout: layout.data,
		};
	} catch {
		draft = emptyDraft();
	}
	return draft;
}

export async function initUpload(file: {
	name: string;
	bytes: Uint8Array;
}): Promise<UploadInit> {
	const upload = await readUpload(file.bytes);
	const title = (file.name || "Document").replace(/\.pdf$/i, "") || "Document";
	const created = await createDraftFn({
		data: { id: upload.documentId, title },
	});
	if ("error" in created) throw new Error(created.error);
	const recorded = await initUploadFn({ data: upload });
	if ("error" in recorded) throw new Error(recorded.error);
	const copy = new ArrayBuffer(file.bytes.byteLength);
	new Uint8Array(copy).set(file.bytes);
	const response = await fetch(`/files/documents/${upload.documentId}/source`, {
		method: "PUT",
		headers: { "content-type": "application/pdf" },
		body: new Blob([copy], { type: "application/pdf" }),
	});
	if (!response.ok) {
		const payload = (await response.json().catch(() => null)) as {
			error?: string;
		} | null;
		throw new Error(payload?.error ?? "The PDF could not be stored.");
	}
	draft = {
		fileName: title,
		bytes: file.bytes,
		upload,
		signers: (draft.signers.length > 0 ? draft.signers : [defaultSigner()]).map(
			(signer) => ({ ...signer, email: signer.email ?? "" }),
		),
		layout: {
			documentId: upload.documentId,
			layoutVersion: 0,
			fields: [],
		},
	};
	return upload;
}

export async function savePreparation(input: {
	documentId: string;
	layoutVersion: number;
	signers: readonly EditorSigner[];
	fields: SaveLayoutInput["fields"];
}): Promise<{ layoutVersion: number } | { error: string }> {
	const result = await savePreparationFn({
		data: {
			documentId: input.documentId,
			layoutVersion: input.layoutVersion,
			signers: input.signers.map((signer) => ({
				id: signer.id,
				name: signer.name,
				email: signer.email,
			})),
			fields: input.fields.map((field) => ({ ...field })),
		},
	});
	if ("error" in result) return result;
	if (draft.layout && draft.layout.documentId === input.documentId) {
		draft = {
			...draft,
			layout: { ...draft.layout, layoutVersion: result.layoutVersion },
			signers: input.signers.map((signer) => ({ ...signer })),
		};
	}
	return result;
}

export async function loadServerDraft(documentId: string) {
	return getDraftFn({ data: { documentId } });
}

export async function publishDocument(
	documentId: string,
): Promise<{ documentId: string; status: "in_progress" } | { error: string }> {
	return publishFn({ data: { documentId } });
}

export async function reissueInvite(
	signerId: string,
): Promise<{ ok: true } | { error: string }> {
	return reissueInviteFn({ data: { signerId } });
}

export async function getSigningContext(): Promise<
	SigningContext | { error: string }
> {
	const result = await getSigningContextFn();
	if ("error" in result) return result;
	const response = await fetch(`/files/documents/${result.upload.documentId}/source`);
	if (!response.ok) return { error: "The PDF could not be loaded." };
	const bytes = new Uint8Array(await response.arrayBuffer());
	const digest = await sha256Hex(bytes);
	if (digest !== result.upload.sha256) {
		return { error: "This file no longer matches the document that was prepared." };
	}
	const signers = result.signers.map((signer, index) => ({
		...signer,
		color: SIGNER_COLORS[index % SIGNER_COLORS.length] ?? SIGNER_COLORS[0],
	}));
	draft = {
		fileName: result.fileName,
		bytes,
		upload: result.upload,
		signers,
		layout: result.layout,
	};
	const signer = signers[result.signerIndex] ?? signers[0];
	if (!signer) return { error: "This document has no signer." };
	return {
		status: result.status,
		declineReason: result.declineReason,
		signer,
		signerIndex: result.signerIndex,
		signerCount: result.signerCount,
		fields: result.fields,
		records: result.records,
		stateHash: result.stateHash,
		upload: result.upload,
		layout: result.layout,
		fileName: result.fileName,
	};
}

export async function submitSignature(
	body: SubmitSignatureInput,
): Promise<SigningContext | { error: string }> {
	const result = await submitSignatureFn({ data: body });
	if ("error" in result) return result;
	return getSigningContext();
}

export async function declineSignature(
	reason: string,
): Promise<SigningContext | { error: string }> {
	const result = await declineSignatureFn({ data: { reason } });
	if ("error" in result) return result;
	return getSigningContext();
}

export function saveSigners(signers: readonly EditorSigner[]): void {
	draft = { ...draft, signers: signers.map((signer) => ({ ...signer })) };
	persist();
}

export function saveLayout(layout: SaveLayoutInput): void {
	draft = {
		...draft,
		layout: { ...layout, fields: layout.fields.map((field) => ({ ...field })) },
	};
	persist();
}

function emptyDraft(): Draft {
	return {
		fileName: "",
		bytes: null,
		upload: null,
		signers: [],
		layout: null,
	};
}

const retiredSignerColors: Record<string, string> = {
	"#C4622D": SIGNER_COLORS[0],
	"#E24B2A": SIGNER_COLORS[0],
	"#B23A48": SIGNER_COLORS[0],
	"#2F6B4F": SIGNER_COLORS[1],
	"#2F5BD6": SIGNER_COLORS[1],
};

function currentSignerColor(color: string): string {
	return retiredSignerColors[color] ?? color;
}

function isSigner(value: unknown): value is EditorSigner {
	if (!value || typeof value !== "object") return false;
	const signer = value as EditorSigner;
	return (
		typeof signer.id === "string" &&
		typeof signer.name === "string" &&
		typeof signer.color === "string" &&
		(signer.email === undefined || typeof signer.email === "string")
	);
}

function persist(): void {
	if (typeof sessionStorage === "undefined") return;
	if (!draft.upload || !draft.layout) return;
	if (draft.bytes && cachedBase64 === null) {
		try {
			cachedBase64 = bytesToBase64(draft.bytes);
		} catch {
			cachedBase64 = null;
		}
	}
	const stored: StoredDraft = {
		fileName: draft.fileName,
		fileBase64: cachedBase64,
		upload: draft.upload,
		signers: draft.signers,
		layout: draft.layout,
	};
	try {
		sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
	} catch {
		stored.fileBase64 = null;
		cachedBase64 = null;
		try {
			sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
		} catch {
			// The tab cannot keep this draft. The in-memory copy still works.
		}
	}
}

function bytesToBase64(bytes: Uint8Array): string {
	const chunk = 0x8000;
	let binary = "";
	for (let index = 0; index < bytes.length; index += chunk) {
		binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
	}
	return btoa(binary);
}

function base64ToBytes(packed: string): Uint8Array {
	const binary = atob(packed);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}
	return bytes;
}
