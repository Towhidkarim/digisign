import { and, asc, eq, isNull, sql } from "drizzle-orm";

import { canonicalJson } from "#/core/canonical-json.ts";
import { sha256Hex } from "#/core/hash.ts";
import { ulid } from "#/core/ulid.ts";
import { getDb } from "#/db/index.ts";
import { commitOrReplay, guardedBatch } from "#/db/guarded-batch.ts";
import { documents, outbox, signers, signerTokens } from "#/db/schema/index.ts";
import { insertAudit, planAudit } from "#/server/domain/audit.ts";
import { randomSecret, readSignerLastOpId, secretHash, tokenExpiry } from "#/server/domain/secrets.ts";
import { AppError } from "#/server/errors.ts";
import type { Mailer, MailMessage } from "#/server/mail/mailer.ts";
import { getMailer } from "#/server/mail/console.ts";

export async function inviteNextSigner(input: {
	documentId: string;
	origin: string;
	mailer?: Mailer;
	now?: number;
}): Promise<{ invited: boolean }> {
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
		(signer) => signer.signingOrder < next.signingOrder && signer.status !== "signed",
	);
	if (blocked) return { invited: false };
	const token = randomSecret();
	const tokenHash = await secretHash(token);
	const opId = ulid();
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
				],
			}),
	});
	if (!result.ok) return { invited: false };
	const mailer = input.mailer ?? getMailer();
	await mailer.send(
		inviteMessage({
			to: next.email,
			name: next.name,
			title: document.title,
			url: `${input.origin}/s/${token}`,
		}),
	);
	return { invited: true };
}

export async function reissueInvite(input: {
	ownerId: string;
	signerId: string;
	origin: string;
	mailer?: Mailer;
	now?: number;
}): Promise<{ ok: true }> {
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
		.where(and(eq(documents.id, signer.documentId), eq(documents.ownerId, input.ownerId)))
		.limit(1);
	if (!document) throw new AppError(404, "This document was not found.");
	const token = randomSecret();
	const tokenHash = await secretHash(token);
	const opId = ulid();
	const audit = await planAudit({
		documentId: document.id,
		type: "signer.invited",
		actorType: "owner",
		actorId: input.ownerId,
		occurredAt: now,
		payload: {
			signerId: signer.id,
			order: signer.signingOrder,
			emailSha256: await sha256Hex(signer.email),
			reissue: true,
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
							and(eq(signerTokens.signerId, signer.id), isNull(signerTokens.revokedAt)),
						),
					db.insert(signerTokens).values({
						tokenHash,
						signerId: signer.id,
						expiresAt: tokenExpiry(now),
						createdAt: now,
					}),
					insertAudit(audit),
					db.insert(outbox).values({
						id: ulid(),
						topic: "document",
						type: "send_email",
						documentId: document.id,
						payloadJson: canonicalJson({ signerId: signer.id, reissue: true }),
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
	const mailer = input.mailer ?? getMailer();
	await mailer.send(
		inviteMessage({
			to: signer.email,
			name: signer.name,
			title: document.title,
			url: `${input.origin}/s/${token}`,
		}),
	);
	return { ok: true };
}

function inviteMessage(input: {
	to: string;
	name: string;
	title: string;
	url: string;
}): MailMessage {
	const name = input.name || "Signer";
	return {
		to: input.to,
		subject: `Please sign ${input.title}`,
		text: `${name}, please sign "${input.title}".\n\nSigner: ${name}\nDocument: ${input.title}\n\n${input.url}`,
		html: `<p>${escapeHtml(name)}, please sign <strong>${escapeHtml(input.title)}</strong>.</p><p><a href="${escapeHtml(input.url)}">${escapeHtml(input.url)}</a></p>`,
	};
}

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}
