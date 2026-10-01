import type {
	SaveLayoutInput,
	SubmitSignatureInput,
	UploadInit,
} from "#/core/contracts/index.ts";
import {
	saveLayoutInputSchema,
	uploadInitSchema,
} from "#/core/contracts/index.ts";
import { ulid } from "#/core/ulid.ts";
import { type EditorSigner, SIGNER_COLORS } from "#/features/editor/reducer.ts";
import {
	declineSignature as declineStored,
	openSigningContext,
	resetSigning,
	type SigningContext,
	submitSignature as submitStored,
} from "#/features/sign/session.ts";
import { readUpload } from "#/pdf/load.ts";

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
			signers: (signers.length > 0 ? signers : [defaultSigner()]).map(
				(signer) => ({ ...signer, color: currentSignerColor(signer.color) }),
			),
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
	cachedBase64 = null;
	draft = {
		fileName: file.name || "Document",
		bytes: file.bytes,
		upload,
		signers: draft.signers.length > 0 ? draft.signers : [defaultSigner()],
		layout: {
			documentId: upload.documentId,
			layoutVersion: 0,
			fields: [],
		},
	};
	persist();
	resetSigning(upload.documentId);
	return upload;
}

export async function getSigningContext(): Promise<
	SigningContext | { error: string }
> {
	hydrateDraft();
	if (!draft.bytes || !draft.upload || !draft.layout) {
		return { error: "Choose a PDF on the prepare desk first." };
	}
	return openSigningContext({
		fileName: draft.fileName,
		bytes: draft.bytes,
		upload: draft.upload,
		signers: draft.signers,
		layout: draft.layout,
	});
}

export async function submitSignature(
	body: SubmitSignatureInput,
): Promise<SigningContext | { error: string }> {
	hydrateDraft();
	if (!draft.upload || !draft.layout) {
		return { error: "Choose a PDF on the prepare desk first." };
	}
	return submitStored(
		{
			fileName: draft.fileName,
			upload: draft.upload,
			signers: draft.signers,
			layout: draft.layout,
			geometry: draft.upload.geometry,
		},
		body,
	);
}

export async function declineSignature(
	reason: string,
): Promise<SigningContext | { error: string }> {
	hydrateDraft();
	if (!draft.upload || !draft.layout) {
		return { error: "Choose a PDF on the prepare desk first." };
	}
	return declineStored(
		{
			fileName: draft.fileName,
			upload: draft.upload,
			signers: draft.signers,
			layout: draft.layout,
		},
		reason,
	);
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
		typeof signer.color === "string"
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
