import { env } from "cloudflare:workers";
import { and, asc, eq, inArray, lte, notExists, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import { getDb } from "#/db/index.ts";
import {
	blobIntents,
	documents,
	idempotencyKeys,
	inbox,
	outbox,
	signerSessions,
	signers,
} from "#/db/schema/index.ts";
import { expireDocument } from "#/server/domain/expiry.ts";
import { outboxInsert } from "#/server/engine/events.ts";
import { publishOutbox } from "#/server/engine/outbox.ts";
import { appOrigin } from "#/server/mail/index.ts";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const SWEEP = {
	/** A pending outbox row older than this is republished. */
	outboxMs: 30_000,
	/** A pending signer with nobody invited, this long after the last change. */
	stalledMs: 10 * MINUTE,
	/** A completed document that is still not anchored. */
	anchorMs: 10 * MINUTE,
	/** An invited signer who has not signed. */
	reminderMs: 3 * DAY,
	blobMs: DAY,
	idempotencyMs: DAY,
	inboxMs: 2 * DAY,
	/** Rows touched by one task in one run. */
	batch: 10,
} as const;

export type SweepReport = {
	idle: boolean;
	republished: number;
	redispatched: number;
	reanchored: number;
	expired: number;
	reminded: number;
	blobsCollected: number;
	purged: number;
};

type Gate = {
	outbox: number;
	stalled: number;
	anchor: number;
	expiry: number;
	reminder: number;
	blobs: number;
	purge: number;
};

/**
 * One combined read tells which tasks have work. Each flag is an EXISTS over an index,
 * so an idle minute costs one cheap query and sends no queue message.
 */
async function readGate(now: number): Promise<Gate> {
	const row = await getDb().get<Gate>(sql`
		SELECT
			EXISTS (SELECT 1 FROM outbox WHERE status = 'pending' AND available_at <= ${now} AND created_at <= ${now - SWEEP.outboxMs}) AS outbox,
			EXISTS (
				SELECT 1 FROM signers s JOIN documents d ON d.id = s.document_id
				WHERE s.status = 'pending' AND d.status = 'in_progress' AND d.updated_at <= ${now - SWEEP.stalledMs}
				AND NOT EXISTS (SELECT 1 FROM signers i WHERE i.document_id = s.document_id AND i.status = 'invited')
			) AS stalled,
			EXISTS (SELECT 1 FROM documents WHERE status = 'completed' AND anchored_at IS NULL AND completed_at <= ${now - SWEEP.anchorMs}) AS anchor,
			EXISTS (SELECT 1 FROM documents WHERE status = 'in_progress' AND expires_at <= ${now}) AS expiry,
			EXISTS (
				SELECT 1 FROM signers s
				WHERE s.status = 'invited' AND s.invited_at <= ${now - SWEEP.reminderMs}
				AND NOT EXISTS (SELECT 1 FROM outbox o WHERE o.id = 'reminder:' || s.id)
			) AS reminder,
			EXISTS (SELECT 1 FROM blob_intents WHERE created_at <= ${now - SWEEP.blobMs}) AS blobs,
			(
				EXISTS (SELECT 1 FROM idempotency_keys WHERE created_at <= ${now - SWEEP.idempotencyMs})
				OR EXISTS (SELECT 1 FROM inbox WHERE processed_at <= ${now - SWEEP.inboxMs})
				OR EXISTS (SELECT 1 FROM signer_sessions WHERE expires_at <= ${now})
			) AS purge
	`);
	return (
		row ?? {
			outbox: 0,
			stalled: 0,
			anchor: 0,
			expiry: 0,
			reminder: 0,
			blobs: 0,
			purge: 0,
		}
	);
}

export async function runSweeper(
	now: number = Date.now(),
): Promise<SweepReport> {
	const report: SweepReport = {
		idle: true,
		republished: 0,
		redispatched: 0,
		reanchored: 0,
		expired: 0,
		reminded: 0,
		blobsCollected: 0,
		purged: 0,
	};
	const gate = await readGate(now);
	if (!Object.values(gate).some(Boolean)) return report;
	report.idle = false;
	const fresh: string[] = [];
	const bucket = Math.floor(now / (10 * MINUTE));

	if (gate.stalled) {
		report.redispatched = await redispatchStalled(now, bucket, fresh);
	}
	if (gate.anchor) {
		report.reanchored = await reanchor(now, bucket, fresh);
	}
	if (gate.expiry) {
		report.expired = await expireDue(now);
	}
	if (gate.reminder) {
		report.reminded = await queueReminders(now, fresh);
	}
	if (gate.blobs) {
		report.blobsCollected = await collectBlobs(now);
	}
	if (gate.purge) {
		report.purged = await purgeOld(now);
	}
	if (gate.outbox) {
		report.republished = await publishOutbox({
			olderThanMs: SWEEP.outboxMs,
			limit: 20,
			now,
		});
	}
	// Rows this run just wrote (recovery, expiry notices, reminders) go out now.
	if (fresh.length > 0) await publishOutbox({ ids: fresh, now });
	return report;
}

/** A pending signer with nobody invited means a dispatch_next was lost. */
async function redispatchStalled(
	now: number,
	bucket: number,
	fresh: string[],
): Promise<number> {
	const db = getDb();
	const invited = alias(signers, "invited");
	const rows = await db
		.select({ documentId: signers.documentId })
		.from(signers)
		.innerJoin(documents, eq(documents.id, signers.documentId))
		.where(
			and(
				eq(signers.status, "pending"),
				eq(documents.status, "in_progress"),
				lte(documents.updatedAt, now - SWEEP.stalledMs),
				notExists(
					db
						.select({ one: sql`1` })
						.from(invited)
						.where(
							and(
								eq(invited.documentId, signers.documentId),
								eq(invited.status, "invited"),
							),
						),
				),
			),
		)
		.groupBy(signers.documentId)
		.limit(SWEEP.batch);
	for (const row of rows) {
		const id = `recover-dispatch:${row.documentId}:${bucket}`;
		await outboxInsert({
			id,
			type: "dispatch_next",
			documentId: row.documentId,
			payload: { documentId: row.documentId, origin: appOrigin() },
			now,
		}).onConflictDoNothing();
		fresh.push(id);
	}
	return rows.length;
}

/** A completed document without an anchor means anchor_manifest was lost. */
async function reanchor(
	now: number,
	bucket: number,
	fresh: string[],
): Promise<number> {
	const db = getDb();
	const rows = await db
		.select({ id: documents.id })
		.from(documents)
		.where(
			and(
				eq(documents.status, "completed"),
				sql`${documents.anchoredAt} IS NULL`,
				lte(documents.completedAt, now - SWEEP.anchorMs),
			),
		)
		.orderBy(asc(documents.completedAt))
		.limit(SWEEP.batch);
	for (const row of rows) {
		const id = `recover-anchor:${row.id}:${bucket}`;
		await outboxInsert({
			id,
			type: "anchor_manifest",
			documentId: row.id,
			payload: { documentId: row.id },
			now,
		}).onConflictDoNothing();
		fresh.push(id);
	}
	return rows.length;
}

async function expireDue(now: number): Promise<number> {
	const rows = await getDb()
		.select({ id: documents.id })
		.from(documents)
		.where(
			and(eq(documents.status, "in_progress"), lte(documents.expiresAt, now)),
		)
		.orderBy(asc(documents.expiresAt))
		.limit(SWEEP.batch);
	let closed = 0;
	for (const row of rows) {
		if (await expireDocument({ documentId: row.id, origin: appOrigin(), now }))
			closed += 1;
	}
	if (closed > 0) await publishOutbox({ now });
	return closed;
}

/** One reminder per signer, ever: the outbox id `reminder:<signerId>` can be inserted once. */
async function queueReminders(now: number, fresh: string[]): Promise<number> {
	const db = getDb();
	const rows = await db
		.select({ id: signers.id, documentId: signers.documentId })
		.from(signers)
		.where(
			and(
				eq(signers.status, "invited"),
				lte(signers.invitedAt, now - SWEEP.reminderMs),
				notExists(
					db
						.select({ one: sql`1` })
						.from(outbox)
						.where(eq(outbox.id, sql`'reminder:' || ${signers.id}`)),
				),
			),
		)
		.limit(SWEEP.batch);
	for (const row of rows) {
		const id = `reminder:${row.id}`;
		await outboxInsert({
			id,
			type: "notify_parties",
			documentId: row.documentId,
			payload: { status: "reminder", signerId: row.id, origin: appOrigin() },
			now,
		}).onConflictDoNothing();
		fresh.push(id);
	}
	return rows.length;
}

/**
 * An intent older than a day is settled. If nothing references the object it is an orphan
 * (the upload or signature batch never committed): delete the object, then the intent.
 */
async function collectBlobs(now: number): Promise<number> {
	const db = getDb();
	const stale = await db
		.select()
		.from(blobIntents)
		.where(lte(blobIntents.createdAt, now - SWEEP.blobMs))
		.orderBy(asc(blobIntents.createdAt))
		.limit(SWEEP.batch);
	for (const intent of stale) {
		const [source] = await db
			.select({ id: documents.id })
			.from(documents)
			.where(eq(documents.sourceR2Key, intent.r2Key))
			.limit(1);
		const [evidence] = source
			? []
			: await db
					.select({ id: signers.id })
					.from(signers)
					.where(eq(signers.evidenceR2Key, intent.r2Key))
					.limit(1);
		if (!source && !evidence) await env.STORAGE.delete(intent.r2Key);
		await db.delete(blobIntents).where(eq(blobIntents.r2Key, intent.r2Key));
	}
	return stale.length;
}

async function purgeOld(now: number): Promise<number> {
	const db = getDb();
	const keys = await db
		.delete(idempotencyKeys)
		.where(
			inArray(
				sql`rowid`,
				db
					.select({ rowid: sql<number>`rowid` })
					.from(idempotencyKeys)
					.where(lte(idempotencyKeys.createdAt, now - SWEEP.idempotencyMs))
					.limit(100),
			),
		)
		.returning({ key: idempotencyKeys.key });
	const seen = await db
		.delete(inbox)
		.where(
			inArray(
				sql`rowid`,
				db
					.select({ rowid: sql<number>`rowid` })
					.from(inbox)
					.where(lte(inbox.processedAt, now - SWEEP.inboxMs))
					.limit(100),
			),
		)
		.returning({ eventId: inbox.eventId });
	const sessions = await db
		.delete(signerSessions)
		.where(lte(signerSessions.expiresAt, now))
		.returning({ hash: signerSessions.sessionHash });
	return keys.length + seen.length + sessions.length;
}
