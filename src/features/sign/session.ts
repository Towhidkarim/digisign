import { canonicalJson } from "#/core/canonical-json.ts";
import type {
	FieldInput,
	FieldValue,
	PageGeometryInput,
	SaveLayoutInput,
	SubmitSignatureInput,
	UploadInit,
} from "#/core/contracts/index.ts";
import { submitSignatureInputSchema } from "#/core/contracts/index.ts";
import { sha256Hex } from "#/core/hash.ts";
import type { EditorSigner } from "#/features/editor/reducer.ts";
import { evidenceHash, signingStateHash } from "#/features/sign/state-hash.ts";
import { formatSignedAt } from "#/features/sign/values.ts";

const STORAGE_KEY = "digisign.sign.v1";

export type SignerRecord = {
	signerId: string;
	/** Set by the signing view so the signed PDF can name each signer without their id or email. */
	order?: number;
	name?: string;
	signedAt: number;
	values: FieldValue[];
	valuesSha256: string;
	privateEvidenceSha256: string;
};

export type SigningSession = {
	documentId: string;
	status: "signing" | "declined" | "completed";
	declineReason: string | null;
	records: SignerRecord[];
	idempotency: Record<string, string>;
};

export type SigningContext = {
	status: SigningSession["status"];
	declineReason: string | null;
	signer: EditorSigner;
	signerIndex: number;
	signerCount: number;
	fields: FieldInput[];
	records: SignerRecord[];
	stateHash: string;
	upload: UploadInit;
	layout: SaveLayoutInput;
	fileName: string;
	/** What the "Date signed" field previews. Absent for the local rehearsal session. */
	dateSigned?: { text: string; reliable: boolean };
};

/** A signer who is no longer waiting: signed, declined, or the document stopped. */
export type RestingContext = {
	status: "resting";
	title: string;
	you: { name: string; email: string; order: number };
	count: number;
	view:
		| {
				kind: "signed-waiting";
				signedAt: number;
				nextSignerName: string | null;
		  }
		| {
				kind: "declined-by-you";
				reason: string | null;
				declinedAt: number | null;
		  }
		| { kind: "stopped" }
		| { kind: "voided" }
		| { kind: "expired" };
};

let session: SigningSession | null = null;

export function resetSigning(documentId: string): void {
	session = {
		documentId,
		status: "signing",
		declineReason: null,
		records: [],
		idempotency: {},
	};
	persistSession();
}

export function clearSigning(): void {
	session = null;
	if (typeof sessionStorage !== "undefined") {
		sessionStorage.removeItem(STORAGE_KEY);
	}
}

export function currentSigning(): SigningSession | null {
	return session;
}

export function hydrateSigning(documentId: string): void {
	if (session?.documentId === documentId) return;
	if (typeof sessionStorage === "undefined") {
		session = null;
		return;
	}
	const raw = sessionStorage.getItem(STORAGE_KEY);
	if (!raw) {
		session = null;
		return;
	}
	try {
		const parsed = JSON.parse(raw) as SigningSession;
		session =
			parsed.documentId === documentId && Array.isArray(parsed.records)
				? parsed
				: null;
	} catch {
		session = null;
	}
}

export async function openSigningContext(input: {
	fileName: string;
	bytes: Uint8Array;
	upload: UploadInit;
	signers: readonly EditorSigner[];
	layout: SaveLayoutInput;
}): Promise<SigningContext | { error: string }> {
	const digest = await sha256Hex(input.bytes);
	if (digest !== input.upload.sha256) {
		return {
			error: "This file no longer matches the document that was prepared.",
		};
	}
	hydrateSigning(input.upload.documentId);
	if (!session || session.documentId !== input.upload.documentId) {
		resetSigning(input.upload.documentId);
	}
	if (!session) {
		return { error: "The signing session could not be opened." };
	}
	if (session.status === "declined") {
		return declinedContext(input, session);
	}
	const nextIndex = session.records.length;
	if (nextIndex >= input.signers.length || session.status === "completed") {
		session = { ...session, status: "completed" };
		persistSession();
		const last = input.signers[input.signers.length - 1];
		if (!last) return { error: "Add a signer before starting." };
		return {
			...(await contextFor(input, session, last, input.signers.length - 1)),
			status: "completed",
		};
	}
	const signer = input.signers[nextIndex];
	if (!signer) return { error: "Add a signer before starting." };
	return contextFor(input, session, signer, nextIndex);
}

export async function submitSignature(
	input: {
		fileName: string;
		upload: UploadInit;
		signers: readonly EditorSigner[];
		layout: SaveLayoutInput;
		geometry: readonly PageGeometryInput[];
	},
	body: SubmitSignatureInput,
): Promise<SigningContext | { error: string }> {
	const parsed = submitSignatureInputSchema.safeParse(body);
	if (!parsed.success) return { error: "The signature could not be accepted." };
	hydrateSigning(input.upload.documentId);
	if (!session)
		return { error: "This document is not waiting for a signature." };
	if (session.idempotency[parsed.data.idempotencyKey]) {
		return openSigningContext({
			fileName: input.fileName,
			bytes: await bytesOfCurrent(),
			upload: input.upload,
			signers: input.signers,
			layout: input.layout,
		});
	}
	if (session.status !== "signing") {
		return { error: "This document is not waiting for a signature." };
	}
	const signer = input.signers[session.records.length];
	if (!signer) return { error: "Everyone has already signed." };
	const expected = await signingStateHash({
		sourceSha256: input.upload.sha256,
		geometry: input.geometry,
		layout: input.layout,
		priorEvidenceSha256: session.records.map((record) => record.valuesSha256),
	});
	if (expected !== parsed.data.stateHash) {
		return {
			error: "This document changed. Reload the page and sign it again.",
		};
	}
	const fields = input.layout.fields.filter(
		(field) => field.signerId === signer.id,
	);
	const missing = fields.find(
		(field) => field.required && !answerReady(field, parsed.data.values),
	);
	if (missing) return { error: "Complete the required fields first." };
	const signedAt = Date.now();
	const values = completeValues(
		fields,
		parsed.data.values,
		signer.name,
		signedAt,
	);
	const record: SignerRecord = {
		signerId: signer.id,
		signedAt,
		values,
		valuesSha256: await evidenceHash(values),
		privateEvidenceSha256: await evidenceHash({ name: signer.name }),
	};
	session = {
		...session,
		records: [...session.records, record],
		status:
			session.records.length + 1 >= input.signers.length
				? "completed"
				: "signing",
		idempotency: { ...session.idempotency, [parsed.data.idempotencyKey]: "ok" },
	};
	persistSession();
	return openSigningContext({
		fileName: input.fileName,
		bytes: await bytesOfCurrent(),
		upload: input.upload,
		signers: input.signers,
		layout: input.layout,
	});
}

export async function declineSignature(
	input: {
		fileName: string;
		upload: UploadInit;
		signers: readonly EditorSigner[];
		layout: SaveLayoutInput;
	},
	reason: string,
): Promise<SigningContext | { error: string }> {
	const trimmed = reason.trim();
	if (!trimmed) return { error: "Say why you are declining." };
	hydrateSigning(input.upload.documentId);
	if (!session || session.status !== "signing") {
		return { error: "This document is not waiting for a signature." };
	}
	session = { ...session, status: "declined", declineReason: trimmed };
	persistSession();
	return openSigningContext({
		fileName: input.fileName,
		bytes: await bytesOfCurrent(),
		upload: input.upload,
		signers: input.signers,
		layout: input.layout,
	});
}

async function bytesOfCurrent(): Promise<Uint8Array> {
	const { getDraft } = await import("#/features/editor/draft.ts");
	return getDraft().bytes ?? new Uint8Array();
}

function declinedContext(
	input: {
		fileName: string;
		upload: UploadInit;
		signers: readonly EditorSigner[];
		layout: SaveLayoutInput;
	},
	current: SigningSession,
): SigningContext {
	const signer = input.signers[current.records.length] ?? input.signers[0];
	if (!signer) {
		throw new Error("Add a signer before starting.");
	}
	return {
		status: "declined",
		declineReason: current.declineReason,
		signer,
		signerIndex: Math.min(current.records.length, input.signers.length - 1),
		signerCount: input.signers.length,
		fields: [],
		records: current.records,
		stateHash: "",
		upload: input.upload,
		layout: input.layout,
		fileName: input.fileName,
	};
}

async function contextFor(
	input: {
		fileName: string;
		upload: UploadInit;
		signers: readonly EditorSigner[];
		layout: SaveLayoutInput;
	},
	current: SigningSession,
	signer: EditorSigner,
	signerIndex: number,
): Promise<SigningContext> {
	const stateHash = await signingStateHash({
		sourceSha256: input.upload.sha256,
		geometry: input.upload.geometry,
		layout: input.layout,
		priorEvidenceSha256: current.records.map((record) => record.valuesSha256),
	});
	return {
		status: current.status,
		declineReason: current.declineReason,
		signer,
		signerIndex,
		signerCount: input.signers.length,
		fields: input.layout.fields.filter((field) => field.signerId === signer.id),
		records: current.records,
		stateHash,
		upload: input.upload,
		layout: input.layout,
		fileName: input.fileName,
	};
}

function answerReady(
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

function completeValues(
	fields: readonly FieldInput[],
	values: readonly FieldValue[],
	signerName: string,
	signedAt: number,
): FieldValue[] {
	return fields.flatMap((field): FieldValue[] => {
		const given = values.find((item) => item.fieldId === field.id);
		if (field.kind === "date_signed") {
			return [{ fieldId: field.id, text: formatSignedAt(signedAt) }];
		}
		if (field.kind === "full_name") {
			return [{ fieldId: field.id, text: signerName || "Signer" }];
		}
		if (!given) return [];
		if (field.kind === "checkbox") {
			return [{ fieldId: field.id, checked: given.checked === true }];
		}
		if (field.kind === "text") {
			const text = (given.text ?? "").trim();
			return text ? [{ fieldId: field.id, text }] : [];
		}
		return given.signature
			? [{ fieldId: field.id, signature: given.signature }]
			: [];
	});
}

function persistSession(): void {
	if (typeof sessionStorage === "undefined" || !session) return;
	sessionStorage.setItem(STORAGE_KEY, canonicalJson(session));
}
