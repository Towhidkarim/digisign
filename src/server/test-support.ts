import { env } from "cloudflare:workers";
import type { FieldInput, PageGeometryInput } from "#/core/contracts/index.ts";
import { ptToMicro } from "#/core/coords.ts";
import { sha256Hex } from "#/core/hash.ts";
import { ulid } from "#/core/ulid.ts";
import {
	createDraft,
	initUpload,
	publish,
	saveLayout,
	saveSigners,
} from "#/server/domain/documents.ts";
import {
	exchangeSignerToken,
	getSigningContext,
	submitSignature,
} from "#/server/domain/signing.ts";
import { putDocumentSource } from "#/server/domain/source.ts";
import type { QueueEnvelope } from "#/server/engine/events.ts";
import { processEvent } from "#/server/engine/handlers.ts";
import { publishOutbox, setQueueSender } from "#/server/engine/outbox.ts";
import type { MailMessage } from "#/server/mail/mailer.ts";
import signingSql from "../../migrations/0000_signing.sql?raw";
import guardsSql from "../../migrations/0001_guards.sql?raw";
import engineSql from "../../migrations/0002_engine.sql?raw";
import authSql from "../../migrations/0003_auth.sql?raw";

export const ORIGIN = "https://digisign.test";

/** A fixed creator id for tests. Runtime code takes the owner from the session. */
export const DEV_OWNER_ID = "01HZDEV0000000000000000001";

const letter: PageGeometryInput = {
	mediaBox: [0, 0, 612, 792],
	cropBox: [0, 0, 612, 792],
	rotate: 0,
};

/** Applies the checked-in migrations once per test file. */
export async function migrate(): Promise<void> {
	const existing = await env.DB.prepare(
		"SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'documents'",
	).first();
	if (existing) return;
	for (const file of [signingSql, guardsSql, engineSql, authSql]) {
		for (const statement of file.split("--> statement-breakpoint")) {
			const sql = statement.trim();
			if (sql) await env.DB.prepare(sql).run();
		}
	}
}

/** What the queue would carry. Nothing is delivered until `pump` runs the handlers. */
export function captureQueue() {
	const sent: QueueEnvelope[] = [];
	setQueueSender(async (messages) => {
		for (const message of messages) sent.push(message.body);
	});
	return sent;
}

export type Pumped = { count: number; durations: number[] };

/** Delivers captured messages to the handlers until the queue is empty. */
export async function pump(
	sent: QueueEnvelope[],
	now?: number,
): Promise<Pumped> {
	const result: Pumped = { count: 0, durations: [] };
	while (sent.length > 0) {
		const envelope = sent.shift();
		if (!envelope) break;
		const start = performance.now();
		await processEvent(envelope, now);
		result.durations.push(performance.now() - start);
		result.count += 1;
	}
	return result;
}

export type Built = {
	documentId: string;
	signers: { id: string; name: string; email: string; fieldId: string }[];
};

/** A published document with `count` signers, each with one signature field. */
export async function buildPublished(
	count: number,
	options: { autoFields?: boolean } = {},
): Promise<Built> {
	const bytes = new TextEncoder().encode(`%PDF-1.4\nengine ${ulid()}`);
	const documentId = ulid();
	await createDraft({ id: documentId, title: "Lease", ownerId: DEV_OWNER_ID });
	await initUpload({
		ownerId: DEV_OWNER_ID,
		upload: {
			documentId,
			sha256: await sha256Hex(bytes),
			sizeBytes: bytes.byteLength,
			pageCount: 1,
			geometry: [letter],
		},
	});
	const copy = new ArrayBuffer(bytes.byteLength);
	new Uint8Array(copy).set(bytes);
	const stored = await putDocumentSource({
		documentId,
		ownerId: DEV_OWNER_ID,
		body: new Blob([copy]).stream(),
		contentLength: bytes.byteLength,
	});
	if (stored.uploadStatus !== "uploaded")
		throw new Error("The test PDF was rejected.");
	const people = Array.from({ length: count }, (_, index) => ({
		id: ulid(),
		name: `Signer ${index + 1}`,
		email: `signer${index + 1}@example.com`,
	}));
	await saveSigners({
		ownerId: DEV_OWNER_ID,
		documentId,
		layoutVersion: 0,
		signers: people,
	});
	const fields = people.map((person, index) =>
		signatureField(person.id, index),
	);
	const first = people[0];
	if (options.autoFields && first) {
		// The date and the name fill themselves in; the first signer gets one of each.
		for (const [offset, kind] of (
			["date_signed", "full_name"] as const
		).entries()) {
			fields.push({
				...signatureField(first.id, count + offset + 1),
				kind,
			});
		}
	}
	await saveLayout({
		ownerId: DEV_OWNER_ID,
		layout: { documentId, layoutVersion: 1, fields },
	});
	await publish({ ownerId: DEV_OWNER_ID, documentId, origin: ORIGIN });
	return {
		documentId,
		signers: people.map((person, index) => ({
			...person,
			fieldId: fields[index]?.id ?? "",
		})),
	};
}

function signatureField(signerId: string, index: number): FieldInput {
	return {
		id: ulid(),
		signerId,
		pageIndex: 0,
		kind: "signature",
		x: 10_000,
		y: 10_000 + index * 80_000,
		w: ptToMicro(120, 612),
		h: ptToMicro(36, 792),
		required: true,
	};
}

/** The magic-link token in the newest message sent to this address. */
export function tokenFor(messages: MailMessage[], email: string): string {
	const found = [...messages]
		.reverse()
		.find(
			(message) =>
				message.to === email && /\/s\/[A-Za-z0-9_-]+/.test(message.text),
		);
	const token = found?.text.match(/\/s\/([A-Za-z0-9_-]+)/)?.[1];
	if (!token) throw new Error(`No magic link was mailed to ${email}.`);
	return token;
}

/** Opens the magic link and signs, the way the signer's browser would. */
export async function signWithToken(
	built: Built,
	signerIndex: number,
	token: string,
): Promise<{ status: "signed" | "completed" }> {
	const signer = built.signers[signerIndex];
	if (!signer) throw new Error("No such signer.");
	const exchanged = await exchangeSignerToken({ token });
	const view = await getSigningContext({ sessionId: exchanged.sessionId });
	if (view.kind !== "ready") throw new Error("The signer is not waiting.");
	return submitSignature({
		sessionId: exchanged.sessionId,
		body: {
			idempotencyKey: crypto.randomUUID(),
			stateHash: view.stateHash,
			consent: true,
			values: [
				{
					fieldId: signer.fieldId,
					signature: { kind: "typed", text: signer.name, font: "script-1" },
				},
			],
		},
		ip: "127.0.0.1",
		userAgent: "vitest",
		origin: ORIGIN,
	});
}

/** The request wrappers publish right after commit. Tests do the same. */
export async function publishNow(now?: number): Promise<number> {
	return publishOutbox({ now });
}
