import { env } from "cloudflare:workers";
import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";

import { getDb } from "#/db/index.ts";
import { outbox } from "#/db/schema/index.ts";
import {
	EVENT_TYPES,
	type EventType,
	type QueueEnvelope,
} from "#/server/engine/events.ts";

const MAX_PER_CALL = 20;

export type QueueSender = (
	messages: { body: QueueEnvelope }[],
) => Promise<void>;

let sender: QueueSender | null = null;

/** Tests capture what would go on the queue instead of delivering it. */
export function setQueueSender(next: QueueSender | null): void {
	sender = next;
}

function subjectOf(payloadJson: string): string | undefined {
	try {
		const parsed = JSON.parse(payloadJson) as { signerId?: unknown };
		return typeof parsed.signerId === "string" ? parsed.signerId : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Sends pending outbox rows to `ds-events`, then marks them published.
 * The request path calls this right after its batch commits (fast path).
 * The cron calls it for rows that were missed (slow path, `olderThanMs`).
 * A crash between send and mark means the row is sent again. Consumers dedupe.
 */
export async function publishOutbox(
	input: {
		documentId?: string;
		ids?: string[];
		limit?: number;
		olderThanMs?: number;
		now?: number;
	} = {},
): Promise<number> {
	const now = input.now ?? Date.now();
	const db = getDb();
	const conditions = [
		eq(outbox.status, "pending"),
		lte(outbox.availableAt, now),
	];
	if (input.documentId)
		conditions.push(eq(outbox.documentId, input.documentId));
	if (input.ids) {
		if (input.ids.length === 0) return 0;
		conditions.push(inArray(outbox.id, input.ids));
	}
	if (input.olderThanMs != null) {
		conditions.push(lte(outbox.createdAt, now - input.olderThanMs));
	}
	const rows = await db
		.select()
		.from(outbox)
		.where(and(...conditions))
		.orderBy(asc(outbox.createdAt))
		.limit(Math.min(input.limit ?? MAX_PER_CALL, MAX_PER_CALL));
	const sendable = rows.filter((row) =>
		(EVENT_TYPES as readonly string[]).includes(row.type),
	);
	if (sendable.length === 0) return 0;
	const messages = sendable.map((row) => {
		const body: QueueEnvelope = {
			v: 1,
			eventId: row.id,
			type: row.type as EventType,
			documentId: row.documentId,
			subjectId: subjectOf(row.payloadJson),
			occurredAt: row.createdAt,
		};
		return { body };
	});
	const ids = sendable.map((row) => row.id);
	try {
		await (sender ?? ((batch) => env.Q_EVENTS.sendBatch(batch)))(messages);
	} catch (error) {
		await db
			.update(outbox)
			.set({ attempts: sql`${outbox.attempts} + 1` })
			.where(inArray(outbox.id, ids));
		throw error;
	}
	await db
		.update(outbox)
		.set({
			status: "published",
			publishedAt: now,
			attempts: sql`${outbox.attempts} + 1`,
		})
		.where(and(inArray(outbox.id, ids), eq(outbox.status, "pending")));
	return ids.length;
}

/** For request handlers: a failed publish must not fail the request. The cron retries it. */
export async function publishOutboxQuietly(documentId?: string): Promise<void> {
	try {
		await publishOutbox({ documentId });
	} catch (error) {
		console.error("outbox publish failed; the cron will retry", error);
	}
}
