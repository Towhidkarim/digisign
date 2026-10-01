import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { canonicalJson } from "#/core/canonical-json.ts";
import {
	fieldInputSchema,
	saveLayoutInputSchema,
	ulidSchema,
	uploadInitSchema,
	type FieldInput,
	type SaveLayoutInput,
} from "#/core/contracts/index.ts";
import { sha256Hex } from "#/core/hash.ts";
import { limits } from "#/core/limits.ts";
import { ulid } from "#/core/ulid.ts";
import { getDb } from "#/db/index.ts";
import { commitOrReplay, guardedBatch } from "#/db/guarded-batch.ts";
import { documents, outbox, signers } from "#/db/schema/index.ts";
import { insertAudit, planAudit } from "#/server/domain/audit.ts";
import { publishBlocker } from "#/server/domain/publish-rules.ts";
import { readLastOpId } from "#/server/domain/secrets.ts";
import { AppError } from "#/server/errors.ts";

const signerDraftSchema = z.strictObject({
	id: ulidSchema,
	name: z.string().max(80),
	email: z.string().max(200),
});

export const createDraftInputSchema = z.strictObject({
	id: ulidSchema,
	title: z.string().trim().min(1).max(200),
});

export const saveSignersInputSchema = z.strictObject({
	documentId: ulidSchema,
	layoutVersion: z.number().int().nonnegative(),
	signers: z.array(signerDraftSchema).min(1).max(limits.signersPerDocument),
});

export const savePreparationInputSchema = saveSignersInputSchema.extend({
	fields: z.array(fieldInputSchema).max(limits.fieldsPerDocument),
});

const documentIdSchema = z.strictObject({ documentId: ulidSchema });

export { documentIdSchema, uploadInitSchema };

const DAY_MS = 24 * 60 * 60 * 1000;

type SignerDraft = z.infer<typeof signerDraftSchema>;

export async function createDraft(input: {
	id: string;
	title: string;
	ownerId: string;
	now?: number;
}): Promise<{ documentId: string }> {
	const now = input.now ?? Date.now();
	const opId = ulid();
	const audit = await planAudit({
		documentId: input.id,
		type: "document.created",
		actorType: "owner",
		actorId: input.ownerId,
		occurredAt: now,
		payload: { title: input.title },
		prev: null,
	});
	const db = getDb();
	try {
		await db.batch([
			db.insert(documents).values({
				id: input.id,
				ownerId: input.ownerId,
				title: input.title,
				status: "draft",
				uploadStatus: "pending",
				pageCount: 0,
				layoutVersion: 0,
				version: 0,
				lastOpId: opId,
				createdAt: now,
				updatedAt: now,
			}),
			insertAudit(audit),
		]);
	} catch (error) {
		const message = error instanceof Error ? error.message : "";
		if (message.includes("UNIQUE")) {
			throw new AppError(409, "This document already exists.");
		}
		throw error;
	}
	return { documentId: input.id };
}

export async function getDraft(documentId: string, ownerId: string) {
	const db = getDb();
	const [document] = await db
		.select()
		.from(documents)
		.where(and(eq(documents.id, documentId), eq(documents.ownerId, ownerId)))
		.limit(1);
	if (!document) throw new AppError(404, "This document was not found.");
	const rows = await db
		.select()
		.from(signers)
		.where(eq(signers.documentId, documentId))
		.orderBy(asc(signers.signingOrder));
	return {
		document,
		signers: rows,
		layout: readLayout(document.id, document.layoutJson, document.layoutVersion),
	};
}

export async function initUpload(input: {
	ownerId: string;
	upload: z.infer<typeof uploadInitSchema>;
	now?: number;
}): Promise<void> {
	const now = input.now ?? Date.now();
	const current = await ownedDraft(input.upload.documentId, input.ownerId);
	const geometryJson = canonicalJson(input.upload.geometry);
	const geometrySha256 = await sha256Hex(geometryJson);
	const opId = ulid();
	const result = await commitOrReplay({
		opId,
		readLastOpId: () => readLastOpId(input.upload.documentId),
		run: () =>
			guardedBatch({
				cas: [
					getDb()
						.update(documents)
						.set({
							sourceSha256: input.upload.sha256,
							sourceSize: input.upload.sizeBytes,
							pageCount: input.upload.pageCount,
							geometryJson,
							geometrySha256,
							uploadStatus: "pending",
							version: sql`${documents.version} + 1`,
							lastOpId: opId,
							updatedAt: now,
						})
						.where(
							and(
								eq(documents.id, input.upload.documentId),
								eq(documents.ownerId, input.ownerId),
								eq(documents.status, "draft"),
								eq(documents.version, current.version),
							),
						),
				],
			}),
	});
	if (!result.ok) {
		throw new AppError(409, "This document was updated. Reload and try again.");
	}
}

export async function saveSigners(input: {
	ownerId: string;
	documentId: string;
	layoutVersion: number;
	signers: readonly SignerDraft[];
	now?: number;
}): Promise<{ layoutVersion: number }> {
	const now = input.now ?? Date.now();
	const current = await ownedDraft(input.documentId, input.ownerId);
	if (current.layoutVersion !== input.layoutVersion) {
		throw new AppError(409, "This document was updated. Reload and try again.");
	}
	const opId = ulid();
	const result = await commitDraft({
		opId,
		readLastOpId: () => readLastOpId(input.documentId),
		run: () =>
			guardedBatch({
				cas: [
					bumpDraft(input.documentId, input.ownerId, input.layoutVersion, opId, now, null),
				],
				effects: signerWrites(input.documentId, input.signers),
			}),
	});
	if (!result.ok) {
		throw new AppError(409, "This document was updated. Reload and try again.");
	}
	return { layoutVersion: input.layoutVersion + 1 };
}

export async function saveLayout(input: {
	ownerId: string;
	layout: SaveLayoutInput;
	now?: number;
}): Promise<{ layoutVersion: number }> {
	const now = input.now ?? Date.now();
	const current = await ownedDraft(input.layout.documentId, input.ownerId);
	if (current.layoutVersion !== input.layout.layoutVersion) {
		throw new AppError(409, "This document was updated. Reload and try again.");
	}
	const stored = readLayout(current.id, current.layoutJson, current.layoutVersion);
	if (sameFields(stored.fields, input.layout.fields)) {
		return { layoutVersion: current.layoutVersion };
	}
	const nextLayout: SaveLayoutInput = {
		documentId: input.layout.documentId,
		layoutVersion: input.layout.layoutVersion + 1,
		fields: input.layout.fields.map((field) => ({ ...field })),
	};
	const layoutJson = canonicalJson(nextLayout);
	const layoutSha256 = await sha256Hex(layoutJson);
	const opId = ulid();
	const result = await commitOrReplay({
		opId,
		readLastOpId: () => readLastOpId(input.layout.documentId),
		run: () =>
			guardedBatch({
				cas: [
					bumpDraft(
						input.layout.documentId,
						input.ownerId,
						input.layout.layoutVersion,
						opId,
						now,
						{ layoutJson, layoutSha256 },
					),
				],
			}),
	});
	if (!result.ok) {
		throw new AppError(409, "This document was updated. Reload and try again.");
	}
	return { layoutVersion: nextLayout.layoutVersion };
}

export async function savePreparation(input: {
	ownerId: string;
	documentId: string;
	layoutVersion: number;
	signers: readonly SignerDraft[];
	fields: readonly FieldInput[];
	now?: number;
}): Promise<{ layoutVersion: number }> {
	const now = input.now ?? Date.now();
	const current = await ownedDraft(input.documentId, input.ownerId);
	if (current.layoutVersion !== input.layoutVersion) {
		throw new AppError(409, "This document was updated. Reload and try again.");
	}
	const storedSigners = await getDb()
		.select()
		.from(signers)
		.where(eq(signers.documentId, input.documentId))
		.orderBy(asc(signers.signingOrder));
	const storedLayout = readLayout(current.id, current.layoutJson, current.layoutVersion);
	if (
		sameSigners(storedSigners, input.signers) &&
		sameFields(storedLayout.fields, input.fields)
	) {
		return { layoutVersion: current.layoutVersion };
	}
	const nextLayout: SaveLayoutInput = {
		documentId: input.documentId,
		layoutVersion: input.layoutVersion + 1,
		fields: input.fields.map((field) => ({ ...field })),
	};
	const layoutJson = canonicalJson(nextLayout);
	const layoutSha256 = await sha256Hex(layoutJson);
	const opId = ulid();
	const result = await commitDraft({
		opId,
		readLastOpId: () => readLastOpId(input.documentId),
		run: () =>
			guardedBatch({
				cas: [
					bumpDraft(input.documentId, input.ownerId, input.layoutVersion, opId, now, {
						layoutJson,
						layoutSha256,
					}),
				],
				effects: signerWrites(input.documentId, input.signers),
			}),
	});
	if (!result.ok) {
		throw new AppError(409, "This document was updated. Reload and try again.");
	}
	return { layoutVersion: nextLayout.layoutVersion };
}

export async function publish(input: {
	ownerId: string;
	documentId: string;
	now?: number;
}): Promise<{ documentId: string; status: "in_progress" }> {
	const now = input.now ?? Date.now();
	const current = await ownedDraft(input.documentId, input.ownerId);
	const people = await getDb()
		.select()
		.from(signers)
		.where(eq(signers.documentId, input.documentId))
		.orderBy(asc(signers.signingOrder));
	const layout = readLayout(current.id, current.layoutJson, current.layoutVersion);
	const blocker = publishBlocker({
		uploadStatus: current.uploadStatus,
		pageCount: current.pageCount,
		geometryJson: current.geometryJson,
		signers: people,
		fields: layout.fields,
	});
	if (blocker) throw new AppError(422, blocker);
	const layoutSha = current.layoutSha256 ?? (await sha256Hex(canonicalJson(layout)));
	const opId = ulid();
	const audit = await planAudit({
		documentId: input.documentId,
		type: "document.published",
		actorType: "owner",
		actorId: input.ownerId,
		occurredAt: now,
		payload: {
			sourceSha256: current.sourceSha256,
			geometrySha256: current.geometrySha256,
			layoutSha256: layoutSha,
		},
	});
	const outboxId = ulid();
	const result = await commitOrReplay({
		opId,
		readLastOpId: () => readLastOpId(input.documentId),
		run: () =>
			guardedBatch({
				cas: [
					getDb()
						.update(documents)
						.set({
							status: "in_progress",
							expiresAt: now + 30 * DAY_MS,
							version: sql`${documents.version} + 1`,
							lastOpId: opId,
							updatedAt: now,
						})
						.where(
							and(
								eq(documents.id, input.documentId),
								eq(documents.ownerId, input.ownerId),
								eq(documents.status, "draft"),
								eq(documents.version, current.version),
							),
						),
				],
				effects: [
					insertAudit(audit),
					getDb()
						.insert(outbox)
						.values({
							id: outboxId,
							topic: "document",
							type: "dispatch_next",
							documentId: input.documentId,
							payloadJson: canonicalJson({ documentId: input.documentId }),
							status: "pending",
							attempts: 0,
							availableAt: now,
							createdAt: now,
						}),
				],
			}),
	});
	if (!result.ok) {
		throw new AppError(409, "This document was updated. Reload and try again.");
	}
	return { documentId: input.documentId, status: "in_progress" };
}

export async function voidDocument(input: {
	ownerId: string;
	documentId: string;
	now?: number;
}): Promise<{ documentId: string; status: "voided" }> {
	const now = input.now ?? Date.now();
	const [current] = await getDb()
		.select()
		.from(documents)
		.where(and(eq(documents.id, input.documentId), eq(documents.ownerId, input.ownerId)))
		.limit(1);
	if (!current) throw new AppError(404, "This document was not found.");
	if (current.status !== "in_progress") {
		throw new AppError(409, "Only a document that is out for signature can be voided.");
	}
	const opId = ulid();
	const audit = await planAudit({
		documentId: input.documentId,
		type: "document.voided",
		actorType: "owner",
		actorId: input.ownerId,
		occurredAt: now,
		payload: { documentId: input.documentId },
	});
	const result = await commitOrReplay({
		opId,
		readLastOpId: () => readLastOpId(input.documentId),
		run: () =>
			guardedBatch({
				cas: [
					getDb()
						.update(documents)
						.set({
							status: "voided",
							version: sql`${documents.version} + 1`,
							lastOpId: opId,
							updatedAt: now,
						})
						.where(
							and(
								eq(documents.id, input.documentId),
								eq(documents.ownerId, input.ownerId),
								eq(documents.status, "in_progress"),
								eq(documents.version, current.version),
							),
						),
				],
				effects: [
					getDb()
						.update(signers)
						.set({
							status: "voided",
							version: sql`${signers.version} + 1`,
							lastOpId: opId,
						})
						.where(
							and(
								eq(signers.documentId, input.documentId),
								inArray(signers.status, ["pending", "invited"]),
							),
						),
					insertAudit(audit),
					getDb()
						.insert(outbox)
						.values({
							id: ulid(),
							topic: "document",
							type: "notify_parties",
							documentId: input.documentId,
							payloadJson: canonicalJson({ status: "voided" }),
							status: "pending",
							attempts: 0,
							availableAt: now,
							createdAt: now,
						}),
				],
			}),
	});
	if (!result.ok) {
		throw new AppError(409, "This document was updated. Reload and try again.");
	}
	return { documentId: input.documentId, status: "voided" };
}

async function ownedDraft(documentId: string, ownerId: string) {
	const [current] = await getDb()
		.select()
		.from(documents)
		.where(and(eq(documents.id, documentId), eq(documents.ownerId, ownerId)))
		.limit(1);
	if (!current) throw new AppError(404, "This document was not found.");
	if (current.status !== "draft") {
		throw new AppError(409, "This document can no longer be edited.");
	}
	return current;
}

async function commitDraft(
	input: Parameters<typeof commitOrReplay>[0],
): Promise<Awaited<ReturnType<typeof commitOrReplay>>> {
	try {
		return await commitOrReplay(input);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (message.includes("signers_email_uq")) {
			throw new AppError(422, "Each signer needs a different email address.");
		}
		if (
			message.includes("UNIQUE constraint failed: signers.id") ||
			message.includes("signers.document_id")
		) {
			return { ok: false, reason: "conflict" };
		}
		throw error;
	}
}

function bumpDraft(
	documentId: string,
	ownerId: string,
	layoutVersion: number,
	opId: string,
	now: number,
	layout: { layoutJson: string; layoutSha256: string } | null,
) {
	const db = getDb();
	const where = and(
		eq(documents.id, documentId),
		eq(documents.ownerId, ownerId),
		eq(documents.status, "draft"),
		eq(documents.layoutVersion, layoutVersion),
	);
	if (layout) {
		return db
			.update(documents)
			.set({
				layoutJson: layout.layoutJson,
				layoutSha256: layout.layoutSha256,
				layoutVersion: sql`${documents.layoutVersion} + 1`,
				version: sql`${documents.version} + 1`,
				lastOpId: opId,
				updatedAt: now,
			})
			.where(where);
	}
	return db
		.update(documents)
		.set({
			layoutVersion: sql`${documents.layoutVersion} + 1`,
			version: sql`${documents.version} + 1`,
			lastOpId: opId,
			updatedAt: now,
		})
		.where(where);
}

function signerWrites(documentId: string, people: readonly SignerDraft[]) {
	const db = getDb();
	return [
		db.delete(signers).where(eq(signers.documentId, documentId)),
		db.insert(signers).values(
			people.map((signer, index) => ({
				id: signer.id,
				documentId,
				signingOrder: index + 1,
				email: signer.email.trim().toLowerCase(),
				name: signer.name.trim(),
				status: "pending" as const,
				version: 0,
			})),
		),
	];
}

function readLayout(
	documentId: string,
	layoutJson: string | null,
	layoutVersion: number,
): SaveLayoutInput {
	if (!layoutJson) {
		return { documentId, layoutVersion, fields: [] };
	}
	const parsed = saveLayoutInputSchema.safeParse(JSON.parse(layoutJson));
	if (!parsed.success) return { documentId, layoutVersion, fields: [] };
	return parsed.data;
}

function sameFields(left: readonly FieldInput[], right: readonly FieldInput[]): boolean {
	return canonicalJson(left) === canonicalJson(right);
}

function sameSigners(
	stored: readonly { id: string; name: string; email: string; signingOrder: number }[],
	incoming: readonly SignerDraft[],
): boolean {
	if (stored.length !== incoming.length) return false;
	return stored.every((signer, index) => {
		const next = incoming[index];
		return (
			next !== undefined &&
			signer.id === next.id &&
			signer.name === next.name.trim() &&
			signer.email === next.email.trim().toLowerCase() &&
			signer.signingOrder === index + 1
		);
	});
}
