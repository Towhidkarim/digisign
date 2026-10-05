import { env } from "cloudflare:workers";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { canonicalJson } from "#/core/canonical-json.ts";
import {
	type FieldInput,
	type FieldValue,
	type PageGeometryInput,
	pageGeometrySchema,
	type SaveLayoutInput,
	type SubmitSignatureInput,
	saveLayoutInputSchema,
} from "#/core/contracts/index.ts";
import { sha256Hex } from "#/core/hash.ts";
import { limits } from "#/core/limits.ts";
import { ulid } from "#/core/ulid.ts";
import { commitOrReplay, guardedBatch } from "#/db/guarded-batch.ts";
import { getDb } from "#/db/index.ts";
import {
	blobIntents,
	documents,
	idempotencyKeys,
	signerSessions,
	signers,
	signerTokens,
} from "#/db/schema/index.ts";
import type { SignerRecord } from "#/features/sign/session.ts";
import { signingStateHash } from "#/features/sign/state-hash.ts";
import { formatSignedAt } from "#/features/sign/values.ts";
import { insertAudit, planAudit } from "#/server/domain/audit.ts";
import {
	evidenceKey,
	manifestSigner,
	type ServerManifest,
	type StoredEvidence,
	sealEvidence,
	signManifest,
} from "#/server/domain/evidence.ts";
import {
	nextIdle,
	randomSecret,
	readLastOpId,
	secretHash,
	sessionWindow,
} from "#/server/domain/secrets.ts";
import { outboxInsert } from "#/server/engine/events.ts";
import { AppError } from "#/server/errors.ts";

export const SIGNER_COOKIE = "digisign_signer";

const geometryList = z.array(pageGeometrySchema);

export type SigningView = {
	status: "signing" | "declined" | "completed";
	declineReason: string | null;
	fileName: string;
	signer: { id: string; name: string; email: string };
	signers: { id: string; name: string; email: string }[];
	signerIndex: number;
	signerCount: number;
	fields: FieldInput[];
	records: SignerRecord[];
	stateHash: string;
	upload: {
		documentId: string;
		sha256: string;
		sizeBytes: number;
		pageCount: number;
		geometry: PageGeometryInput[];
	};
	layout: SaveLayoutInput;
};

export async function exchangeSignerToken(input: {
	token: string;
	now?: number;
}): Promise<{ sessionId: string }> {
	const now = input.now ?? Date.now();
	const tokenHash = await secretHash(input.token);
	const db = getDb();
	const [tokenRow] = await db
		.select()
		.from(signerTokens)
		.where(eq(signerTokens.tokenHash, tokenHash))
		.limit(1);
	if (!tokenRow || tokenRow.revokedAt != null || tokenRow.expiresAt <= now) {
		throw new AppError(401, "This link is no longer valid.");
	}
	const [signer] = await db
		.select()
		.from(signers)
		.where(eq(signers.id, tokenRow.signerId))
		.limit(1);
	const [document] = signer
		? await db
				.select()
				.from(documents)
				.where(eq(documents.id, signer.documentId))
				.limit(1)
		: [];
	if (
		!signer ||
		signer.status !== "invited" ||
		!document ||
		document.status !== "in_progress"
	) {
		throw new AppError(401, "This link is no longer valid.");
	}
	const sessionId = randomSecret();
	const window = sessionWindow(now);
	await db.insert(signerSessions).values({
		sessionHash: await secretHash(sessionId),
		signerId: signer.id,
		expiresAt: window.expiresAt,
		idleExpiresAt: window.idleExpiresAt,
		createdAt: now,
	});
	return { sessionId };
}

export async function getSigningContext(input: {
	sessionId: string;
	now?: number;
}): Promise<SigningView> {
	const now = input.now ?? Date.now();
	const loaded = await openSession(input.sessionId, now);
	let signer = loaded.signer;
	if (signer.status === "invited" && signer.firstViewedAt == null) {
		signer = await markViewed(signer, now);
	}
	return buildView(loaded.document, signer, now);
}

export async function submitSignature(input: {
	sessionId: string;
	body: SubmitSignatureInput;
	ip: string;
	userAgent: string;
	origin: string;
	now?: number;
}): Promise<{ status: "signed" | "completed" }> {
	const now = input.now ?? Date.now();
	const encoded = canonicalJson(input.body);
	if (encoded.length > limits.requestBodyBytes) {
		throw new AppError(413, "This signature is too large.");
	}
	const requestSha256 = await sha256Hex(encoded);
	const loaded = await openSession(input.sessionId, now);
	const actorKey = `signer:${loaded.signer.id}`;
	const replay = await replayIdempotency(
		actorKey,
		input.body.idempotencyKey,
		requestSha256,
	);
	if (replay) return replay;
	if (
		loaded.document.status !== "in_progress" ||
		loaded.signer.status !== "invited"
	) {
		throw new AppError(409, "This document is not waiting for your signature.");
	}
	const people = await getDb()
		.select()
		.from(signers)
		.where(eq(signers.documentId, loaded.document.id))
		.orderBy(asc(signers.signingOrder));
	const layout = readLayout(
		loaded.document.id,
		loaded.document.layoutJson,
		loaded.document.layoutVersion,
	);
	const geometry = readGeometry(loaded.document.geometryJson);
	const mine = layout.fields.filter(
		(field) => field.signerId === loaded.signer.id,
	);
	if (
		mine.some(
			(field) => field.required && !answerReady(field, input.body.values),
		)
	) {
		throw new AppError(422, "Complete the required fields first.");
	}
	const prior = people.filter(
		(person) => person.status === "signed" && person.evidenceSha256,
	);
	const stateHash = await signingStateHash({
		sourceSha256: loaded.document.sourceSha256 ?? "",
		geometry,
		layout,
		priorEvidenceSha256: prior.map((person) => person.evidenceSha256 ?? ""),
	});
	if (stateHash !== input.body.stateHash) {
		throw new AppError(
			409,
			"This document changed. Reload the page and sign it again.",
		);
	}
	const values = completeValues(
		mine,
		input.body.values,
		loaded.signer.name,
		now,
	);
	const sealed = await sealEvidence({
		documentId: loaded.document.id,
		signerId: loaded.signer.id,
		signedAt: now,
		values,
		privateEvidence: {
			email: loaded.signer.email,
			ip: input.ip || "unknown",
			userAgent: input.userAgent.slice(0, 512),
			consentAt: now,
			invitedAt: loaded.signer.invitedAt,
			firstViewedAt: loaded.signer.firstViewedAt,
		},
	});
	const key = evidenceKey(loaded.document.id, loaded.signer.id, sealed.sha256);
	await getDb()
		.insert(blobIntents)
		.values({ r2Key: key, documentId: loaded.document.id, createdAt: now })
		.onConflictDoNothing();
	const stored = await env.STORAGE.put(key, sealed.canonical, {
		sha256: sealed.sha256,
		httpMetadata: { contentType: "application/json" },
	});
	if (!stored) throw new AppError(502, "The signature could not be stored.");
	const last = people.every(
		(person) => person.id === loaded.signer.id || person.status === "signed",
	);
	const opId = ulid();
	const signedAudit = await planAudit({
		documentId: loaded.document.id,
		type: "signer.signed",
		actorType: "signer",
		actorId: loaded.signer.id,
		occurredAt: now,
		payload: {
			signerId: loaded.signer.id,
			evidenceSha256: sealed.sha256,
			stateHash,
		},
	});
	let manifest: { json: string; sha256: string } | null = null;
	let completedAudit: Awaited<ReturnType<typeof planAudit>> | null = null;
	if (last) {
		const built = await buildCompletedManifest({
			document: loaded.document,
			people,
			current: sealed.evidence,
			layout,
			geometry,
			head: { seq: signedAudit.seq, hash: signedAudit.hash },
		});
		manifest = built;
		completedAudit = await planAudit({
			documentId: loaded.document.id,
			type: "document.completed",
			actorType: "system",
			actorId: loaded.signer.id,
			occurredAt: now,
			payload: { manifestSha256: built.sha256 },
			prev: { seq: signedAudit.seq, hash: signedAudit.hash },
		});
	}
	const response = {
		status: last ? ("completed" as const) : ("signed" as const),
	};
	const db = getDb();
	const result = await commitOrReplay({
		opId,
		readLastOpId: () => readLastOpId(loaded.document.id),
		run: () =>
			guardedBatch({
				cas: [
					db
						.update(signers)
						.set({
							status: "signed",
							signedAt: now,
							evidenceR2Key: key,
							evidenceSha256: sealed.sha256,
							consentAt: now,
							clientIp: input.ip || "unknown",
							userAgent: input.userAgent.slice(0, 512),
							version: sql`${signers.version} + 1`,
							lastOpId: opId,
						})
						.where(
							and(
								eq(signers.id, loaded.signer.id),
								eq(signers.status, "invited"),
								eq(signers.version, loaded.signer.version),
							),
						),
					db
						.update(documents)
						.set(
							manifest
								? {
										status: "completed",
										manifestJson: manifest.json,
										manifestSha256: manifest.sha256,
										completedAt: now,
										version: sql`${documents.version} + 1`,
										lastOpId: opId,
										updatedAt: now,
									}
								: {
										version: sql`${documents.version} + 1`,
										lastOpId: opId,
										updatedAt: now,
									},
						)
						.where(
							and(
								eq(documents.id, loaded.document.id),
								eq(documents.status, "in_progress"),
								eq(documents.version, loaded.document.version),
							),
						),
				],
				effects: [
					insertAudit(signedAudit),
					...(completedAudit ? [insertAudit(completedAudit)] : []),
					outboxInsert({
						type: last ? "anchor_manifest" : "dispatch_next",
						documentId: loaded.document.id,
						payload: last
							? { manifestSha256: manifest?.sha256 }
							: { documentId: loaded.document.id, origin: input.origin },
						now,
					}),
					...(last
						? [
								outboxInsert({
									type: "notify_parties",
									documentId: loaded.document.id,
									payload: { status: "completed", origin: input.origin },
									now,
								}),
							]
						: []),
					db.insert(idempotencyKeys).values({
						actorKey,
						key: input.body.idempotencyKey,
						requestSha256,
						responseJson: canonicalJson(response),
						createdAt: now,
					}),
				],
			}),
	});
	if (!result.ok) {
		throw new AppError(
			409,
			"This document changed. Reload the page and sign it again.",
		);
	}
	return response;
}

export async function declineSignature(input: {
	sessionId: string;
	reason: string;
	origin?: string;
	now?: number;
}): Promise<{ status: "declined" }> {
	const now = input.now ?? Date.now();
	const reason = input.reason.trim();
	if (!reason) throw new AppError(422, "Say why you are declining.");
	const loaded = await openSession(input.sessionId, now);
	if (
		loaded.document.status !== "in_progress" ||
		loaded.signer.status !== "invited"
	) {
		throw new AppError(409, "This document is not waiting for your signature.");
	}
	const opId = ulid();
	const signerAudit = await planAudit({
		documentId: loaded.document.id,
		type: "signer.declined",
		actorType: "signer",
		actorId: loaded.signer.id,
		occurredAt: now,
		payload: {
			signerId: loaded.signer.id,
			reasonSha256: await sha256Hex(reason),
		},
	});
	const documentAudit = await planAudit({
		documentId: loaded.document.id,
		type: "document.declined",
		actorType: "signer",
		actorId: loaded.signer.id,
		occurredAt: now,
		payload: { documentId: loaded.document.id },
		prev: { seq: signerAudit.seq, hash: signerAudit.hash },
	});
	const db = getDb();
	const result = await commitOrReplay({
		opId,
		readLastOpId: () => readLastOpId(loaded.document.id),
		run: () =>
			guardedBatch({
				cas: [
					db
						.update(signers)
						.set({
							status: "declined",
							declineReason: reason.slice(0, 500),
							version: sql`${signers.version} + 1`,
							lastOpId: opId,
						})
						.where(
							and(
								eq(signers.id, loaded.signer.id),
								eq(signers.status, "invited"),
								eq(signers.version, loaded.signer.version),
							),
						),
					db
						.update(documents)
						.set({
							status: "declined",
							version: sql`${documents.version} + 1`,
							lastOpId: opId,
							updatedAt: now,
						})
						.where(
							and(
								eq(documents.id, loaded.document.id),
								eq(documents.status, "in_progress"),
								eq(documents.version, loaded.document.version),
							),
						),
				],
				effects: [
					insertAudit(signerAudit),
					insertAudit(documentAudit),
					outboxInsert({
						type: "notify_parties",
						documentId: loaded.document.id,
						payload: { status: "declined", origin: input.origin },
						now,
					}),
				],
			}),
	});
	if (!result.ok) {
		throw new AppError(
			409,
			"This document changed. Reload the page and sign it again.",
		);
	}
	return { status: "declined" };
}

async function openSession(sessionId: string, now: number) {
	const sessionHash = await secretHash(sessionId);
	const db = getDb();
	const [session] = await db
		.select()
		.from(signerSessions)
		.where(eq(signerSessions.sessionHash, sessionHash))
		.limit(1);
	if (!session || session.expiresAt <= now || session.idleExpiresAt <= now) {
		throw new AppError(401, "Open your invite link again to keep signing.");
	}
	await db
		.update(signerSessions)
		.set({ idleExpiresAt: nextIdle(now, session.expiresAt) })
		.where(eq(signerSessions.sessionHash, sessionHash));
	const [signer] = await db
		.select()
		.from(signers)
		.where(eq(signers.id, session.signerId))
		.limit(1);
	if (!signer)
		throw new AppError(401, "Open your invite link again to keep signing.");
	const [document] = await db
		.select()
		.from(documents)
		.where(eq(documents.id, signer.documentId))
		.limit(1);
	if (!document)
		throw new AppError(401, "Open your invite link again to keep signing.");
	return { signer, document };
}

async function markViewed(
	signer: typeof signers.$inferSelect,
	now: number,
): Promise<typeof signers.$inferSelect> {
	const opId = ulid();
	const audit = await planAudit({
		documentId: signer.documentId,
		type: "signer.viewed",
		actorType: "signer",
		actorId: signer.id,
		occurredAt: now,
		payload: { signerId: signer.id },
	});
	const db = getDb();
	await commitOrReplay({
		opId,
		readLastOpId: async () => {
			const [row] = await db
				.select({ lastOpId: signers.lastOpId })
				.from(signers)
				.where(eq(signers.id, signer.id))
				.limit(1);
			return row?.lastOpId ?? null;
		},
		run: () =>
			guardedBatch({
				cas: [
					db
						.update(signers)
						.set({
							firstViewedAt: now,
							version: sql`${signers.version} + 1`,
							lastOpId: opId,
						})
						.where(
							and(
								eq(signers.id, signer.id),
								eq(signers.version, signer.version),
								isNull(signers.firstViewedAt),
							),
						),
				],
				effects: [insertAudit(audit)],
			}),
	});
	const [fresh] = await db
		.select()
		.from(signers)
		.where(eq(signers.id, signer.id))
		.limit(1);
	return fresh ?? signer;
}

async function buildView(
	document: typeof documents.$inferSelect,
	signer: typeof signers.$inferSelect,
	_now: number,
): Promise<SigningView> {
	const people = await getDb()
		.select()
		.from(signers)
		.where(eq(signers.documentId, document.id))
		.orderBy(asc(signers.signingOrder));
	const layout = readLayout(
		document.id,
		document.layoutJson,
		document.layoutVersion,
	);
	const geometry = readGeometry(document.geometryJson);
	const records: SignerRecord[] = [];
	for (const person of people) {
		if (person.status !== "signed" || !person.evidenceR2Key) continue;
		const evidence = await readEvidence(person.evidenceR2Key);
		if (!evidence) continue;
		records.push({
			signerId: person.id,
			signedAt: evidence.signedAt,
			values: evidence.values,
			valuesSha256: evidence.valuesSha256,
			privateEvidenceSha256: evidence.privateEvidenceSha256,
		});
	}
	const priorHashes = people
		.filter((person) => person.status === "signed" && person.evidenceSha256)
		.map((person) => person.evidenceSha256 ?? "");
	const stateHash = await signingStateHash({
		sourceSha256: document.sourceSha256 ?? "",
		geometry,
		layout,
		priorEvidenceSha256:
			document.status === "completed" ? priorHashes.slice(0, -1) : priorHashes,
	});
	const status =
		document.status === "completed"
			? "completed"
			: document.status === "declined" || signer.status === "declined"
				? "declined"
				: "signing";
	if (status === "signing" && signer.status !== "invited") {
		throw new AppError(409, "This document is not waiting for your signature.");
	}
	const signerIndex = Math.max(
		0,
		people.findIndex((person) => person.id === signer.id),
	);
	return {
		status,
		declineReason: signer.declineReason,
		fileName: document.title,
		signer: { id: signer.id, name: signer.name, email: signer.email },
		signers: people.map((person) => ({
			id: person.id,
			name: person.name,
			email: person.email,
		})),
		signerIndex,
		signerCount: people.length,
		fields: layout.fields.filter((field) => field.signerId === signer.id),
		records:
			status === "signing"
				? records.filter((record) => record.signerId !== signer.id)
				: records,
		stateHash,
		upload: {
			documentId: document.id,
			sha256: document.sourceSha256 ?? "",
			sizeBytes: document.sourceSize ?? 0,
			pageCount: document.pageCount,
			geometry,
		},
		layout,
	};
}

async function buildCompletedManifest(input: {
	document: typeof documents.$inferSelect;
	people: (typeof signers.$inferSelect)[];
	current: StoredEvidence;
	layout: SaveLayoutInput;
	geometry: PageGeometryInput[];
	head: { seq: number; hash: string };
}): Promise<{ json: string; sha256: string }> {
	const manifestSigners = [];
	for (const person of input.people) {
		const evidence =
			person.id === input.current.signerId
				? input.current
				: person.evidenceR2Key
					? await readEvidence(person.evidenceR2Key)
					: null;
		if (!evidence) continue;
		manifestSigners.push(
			manifestSigner({
				order: person.signingOrder,
				signerId: person.id,
				name: person.name,
				signedAt: evidence.signedAt,
				values: evidence.values,
				valuesSha256: evidence.valuesSha256,
				privateEvidenceSha256: evidence.privateEvidenceSha256,
			}),
		);
	}
	const manifest: ServerManifest = {
		v: 1,
		documentId: input.document.id,
		title: input.document.title,
		source: {
			sha256: input.document.sourceSha256 ?? "",
			size: input.document.sourceSize ?? 0,
		},
		geometrySha256:
			input.document.geometrySha256 ??
			(await sha256Hex(canonicalJson(input.geometry))),
		layoutSha256:
			input.document.layoutSha256 ??
			(await sha256Hex(canonicalJson(input.layout))),
		geometry: input.geometry,
		layout: input.layout,
		signers: manifestSigners,
		completedAt: input.current.signedAt,
		audit: { headSeq: input.head.seq, headHash: input.head.hash },
		renderer: { name: "digisign-render", version: "1.0.0" },
	};
	const signed = await signManifest(manifest);
	return { json: signed.envelopeJson, sha256: signed.sha256 };
}

async function readEvidence(key: string): Promise<StoredEvidence | null> {
	const object = await env.STORAGE.get(key);
	if (!object) return null;
	return JSON.parse(await object.text()) as StoredEvidence;
}

async function replayIdempotency(
	actorKey: string,
	key: string,
	requestSha256: string,
): Promise<{ status: "signed" | "completed" } | null> {
	const [row] = await getDb()
		.select()
		.from(idempotencyKeys)
		.where(
			and(eq(idempotencyKeys.actorKey, actorKey), eq(idempotencyKeys.key, key)),
		)
		.limit(1);
	if (!row) return null;
	if (row.requestSha256 !== requestSha256) {
		throw new AppError(
			422,
			"This request was already sent with different details.",
		);
	}
	return JSON.parse(row.responseJson) as { status: "signed" | "completed" };
}

function readGeometry(geometryJson: string | null): PageGeometryInput[] {
	const parsed = geometryList.safeParse(
		geometryJson ? JSON.parse(geometryJson) : null,
	);
	if (!parsed.success)
		throw new AppError(409, "This document is not ready to sign.");
	return parsed.data;
}

function readLayout(
	documentId: string,
	layoutJson: string | null,
	layoutVersion: number,
): SaveLayoutInput {
	if (!layoutJson) return { documentId, layoutVersion, fields: [] };
	const parsed = saveLayoutInputSchema.safeParse(JSON.parse(layoutJson));
	if (!parsed.success) return { documentId, layoutVersion, fields: [] };
	return parsed.data;
}

function answerReady(
	field: FieldInput,
	values: readonly FieldValue[],
): boolean {
	if (field.kind === "date_signed" || field.kind === "full_name") return true;
	const value = values.find((item) => item.fieldId === field.id);
	if (!value) return false;
	if (field.kind === "signature" || field.kind === "initials")
		return value.signature !== undefined;
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
		if (field.kind === "date_signed")
			return [{ fieldId: field.id, text: formatSignedAt(signedAt) }];
		if (field.kind === "full_name")
			return [{ fieldId: field.id, text: signerName || "Signer" }];
		if (!given) return [];
		if (field.kind === "checkbox")
			return [{ fieldId: field.id, checked: given.checked === true }];
		if (field.kind === "text") {
			const text = (given.text ?? "").trim();
			return text ? [{ fieldId: field.id, text }] : [];
		}
		return given.signature
			? [{ fieldId: field.id, signature: given.signature }]
			: [];
	});
}
