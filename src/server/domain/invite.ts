import { and, asc, eq, isNull, sql } from "drizzle-orm";

import { sha256Hex } from "#/core/hash.ts";
import { ulid } from "#/core/ulid.ts";
import { commitOrReplay, guardedBatch } from "#/db/guarded-batch.ts";
import { getDb } from "#/db/index.ts";
import { documents, signers, signerTokens } from "#/db/schema/index.ts";
import { insertAudit, planAudit } from "#/server/domain/audit.ts";
import {
	randomSecret,
	readSignerLastOpId,
	secretHash,
	tokenExpiry,
} from "#/server/domain/secrets.ts";
import { outboxInsert } from "#/server/engine/events.ts";
import { AppError } from "#/server/errors.ts";

export type InviteResult =
	| { invited: false }
	| { invited: true; token: string; signerId: string; outboxId: string };

/**
 * Moves the next waiting signer to `invited` and writes a new magic-link token.
 * The mail itself is an outbox row (`send_email`) that commits in the same batch.
 * The caller publishes it to the queue once this returns.
 */
export async function inviteNextSigner(input: {
	documentId: string;
	origin: string;
	now?: number;
}): Promise<InviteResult> {
	const now = input.now ?? Date.now();
	const db = getDb();
	const [document] = await db
		.select()
		.from(documents)
		.where(eq(documents.id, input.documentId))
		.limit(1);
	if (!document || document.status !== "in_progress") return { invited: false };
	const people = await db
		.select()
		.from(signers)
		.where(eq(signers.documentId, input.documentId))
		.orderBy(asc(signers.signingOrder));
	const next = people.find((signer) => signer.status !== "signed");
	if (!next || next.status !== "pending") return { invited: false };
	const blocked = people.some(
		(signer) =>
			signer.signingOrder < next.signingOrder && signer.status !== "signed",
	);
	if (blocked) return { invited: false };
	const token = randomSecret();
	const tokenHash = await secretHash(token);
	const opId = ulid();
	const outboxId = ulid();
	const audit = await planAudit({
		documentId: input.documentId,
		type: "signer.invited",
		actorType: "system",
		actorId: next.id,
		occurredAt: now,
		payload: {
			signerId: next.id,
			order: next.signingOrder,
			emailSha256: await sha256Hex(next.email),
		},
	});
	const result = await commitOrReplay({
		opId,
		readLastOpId: () => readSignerLastOpId(next.id),
		run: () =>
			guardedBatch({
				cas: [
					db
						.update(signers)
						.set({
							status: "invited",
							invitedAt: now,
							version: sql`${signers.version} + 1`,
							lastOpId: opId,
						})
						.where(
							and(
								eq(signers.id, next.id),
								eq(signers.status, "pending"),
								eq(signers.version, next.version),
							),
						),
				],
				effects: [
					db.insert(signerTokens).values({
						tokenHash,
						signerId: next.id,
						expiresAt: tokenExpiry(now),
						createdAt: now,
					}),
					insertAudit(audit),
					outboxInsert({
						id: outboxId,
						type: "send_email",
						documentId: input.documentId,
						payload: {
							template: "invite",
							to: next.email,
							name: next.name,
							title: document.title,
							signerId: next.id,
							token,
							origin: input.origin,
						},
						now,
					}),
				],
			}),
	});
	if (!result.ok) return { invited: false };
	return { invited: true, token, signerId: next.id, outboxId };
}

/**
 * Replaces the magic link of the signer who is currently invited.
 * The old token stops working. Used for "send link again" (owner) and the reminder (system).
 */
export async function reissueSignerLink(input: {
	signerId: string;
	origin: string;
	template: "invite" | "reminder";
	ownerId?: string;
	now?: number;
}): Promise<{ token: string; outboxId: string }> {
	const now = input.now ?? Date.now();
	const db = getDb();
	const [signer] = await db
		.select()
		.from(signers)
		.where(eq(signers.id, input.signerId))
		.limit(1);
	if (!signer || signer.status !== "invited") {
		throw new AppError(409, "That signer is not waiting on a link.");
	}
	const [document] = await db
		.select()
		.from(documents)
		.where(
			input.ownerId
				? and(
						eq(documents.id, signer.documentId),
						eq(documents.ownerId, input.ownerId),
					)
				: eq(documents.id, signer.documentId),
		)
		.limit(1);
	if (!document) throw new AppError(404, "This document was not found.");
	if (document.status !== "in_progress") {
		throw new AppError(409, "That signer is not waiting on a link.");
	}
	const token = randomSecret();
	const tokenHash = await secretHash(token);
	const opId = ulid();
	const outboxId = ulid();
	const byOwner = input.ownerId != null;
	const audit = await planAudit({
		documentId: document.id,
		type: "signer.invited",
		actorType: byOwner ? "owner" : "system",
		actorId: input.ownerId ?? signer.id,
		occurredAt: now,
		payload: {
			signerId: signer.id,
			order: signer.signingOrder,
			emailSha256: await sha256Hex(signer.email),
			reissue: true,
			reminder: input.template === "reminder",
		},
	});
	const result = await commitOrReplay({
		opId,
		readLastOpId: () => readSignerLastOpId(signer.id),
		run: () =>
			guardedBatch({
				cas: [
					db
						.update(signers)
						.set({
							version: sql`${signers.version} + 1`,
							lastOpId: opId,
						})
						.where(
							and(
								eq(signers.id, signer.id),
								eq(signers.status, "invited"),
								eq(signers.version, signer.version),
							),
						),
				],
				effects: [
					db
						.update(signerTokens)
						.set({ revokedAt: now })
						.where(
							and(
								eq(signerTokens.signerId, signer.id),
								isNull(signerTokens.revokedAt),
							),
						),
					db.insert(signerTokens).values({
						tokenHash,
						signerId: signer.id,
						expiresAt: tokenExpiry(now),
						createdAt: now,
					}),
					insertAudit(audit),
					outboxInsert({
						id: outboxId,
						type: "send_email",
						documentId: document.id,
						payload: {
							template: input.template,
							to: signer.email,
							name: signer.name,
							title: document.title,
							signerId: signer.id,
							token,
							origin: input.origin,
						},
						now,
					}),
				],
			}),
	});
	if (!result.ok) {
		throw new AppError(409, "This document was updated. Reload and try again.");
	}
	return { token, outboxId };
}

export async function reissueInvite(input: {
	ownerId: string;
	signerId: string;
	origin: string;
	now?: number;
}): Promise<{ ok: true; documentId: string }> {
	const [signer] = await getDb()
		.select({ documentId: signers.documentId })
		.from(signers)
		.where(eq(signers.id, input.signerId))
		.limit(1);
	await reissueSignerLink({ ...input, template: "invite" });
	return { ok: true, documentId: signer?.documentId ?? "" };
}
