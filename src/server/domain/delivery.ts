import { desc, eq, inArray } from 'drizzle-orm';

import { getDb } from '#/db/index.ts';
import { emailDeliveries, inbox, outbox } from '#/db/schema/index.ts';
import { sendEmailPayloadSchema } from '#/server/engine/events.ts';

/**
 * A queued job that is still not done after this long is treated as stuck. The queue retries for
 * about five minutes before giving up, so this only matters if the give-up step itself was lost.
 */
export const STUCK_MS = 15 * 60 * 1000;

export type JobState = 'working' | 'done' | 'failed';
export type InviteEmailState = 'sending' | 'sent' | 'failed';

export type Job = { id: string; createdAt: number };

/** What the database says about jobs: which finished, which mails were sent, which gave up. */
export type JobFacts = {
  processed: ReadonlySet<string>;
  sent: ReadonlySet<string>;
  failed: ReadonlySet<string>;
};

export function jobState(job: Job, facts: JobFacts, now: number): JobState {
  if (facts.sent.has(job.id)) return 'done';
  if (facts.failed.has(job.id)) return 'failed';
  if (facts.processed.has(job.id)) return 'done';
  return now - job.createdAt > STUCK_MS ? 'failed' : 'working';
}

export function inviteEmailState(state: JobState): InviteEmailState {
  if (state === 'done') return 'sent';
  return state === 'failed' ? 'failed' : 'sending';
}

export type DeliveryState = {
  /** True while a queued job for the document has not finished. */
  busy: boolean;
  /** For each signer: the state of their latest invite or reminder mail, if any. */
  inviteEmail: ReadonlyMap<string, InviteEmailState>;
};

type OutboxRow = {
  id: string;
  type: string;
  payloadJson: string;
  createdAt: number;
};

/** Pure part of `readDeliveryState`, so the rules can be tested without a database. */
export function deliveryState(
  rows: readonly OutboxRow[],
  facts: JobFacts,
  now: number,
): DeliveryState {
  let busy = false;
  const latest = new Map<string, { job: OutboxRow; at: number }>();
  for (const row of rows) {
    if (jobState(row, facts, now) === 'working') busy = true;
    if (row.type !== 'send_email') continue;
    const payload = parseMail(row.payloadJson);
    if (!payload?.signerId) continue;
    if (payload.template !== 'invite' && payload.template !== 'reminder') {
      continue;
    }
    const seen = latest.get(payload.signerId);
    if (!seen || row.createdAt >= seen.at) {
      latest.set(payload.signerId, { job: row, at: row.createdAt });
    }
  }
  const inviteEmail = new Map<string, InviteEmailState>();
  for (const [signerId, { job }] of latest) {
    inviteEmail.set(signerId, inviteEmailState(jobState(job, facts, now)));
  }
  return { busy, inviteEmail };
}

function parseMail(json: string) {
  try {
    const parsed = sendEmailPayloadSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Reads the queue's progress for one document. */
export async function readDeliveryState(
  documentId: string,
  now: number = Date.now(),
): Promise<DeliveryState> {
  const db = getDb();
  const rows = await db
    .select({
      id: outbox.id,
      type: outbox.type,
      payloadJson: outbox.payloadJson,
      createdAt: outbox.createdAt,
    })
    .from(outbox)
    .where(eq(outbox.documentId, documentId))
    .orderBy(desc(outbox.createdAt))
    .limit(80);
  if (rows.length === 0) return { busy: false, inviteEmail: new Map() };
  const ids = rows.map((row) => row.id);
  const [processed, deliveries] = await Promise.all([
    db
      .select({ eventId: inbox.eventId })
      .from(inbox)
      .where(inArray(inbox.eventId, ids)),
    db
      .select({
        eventId: emailDeliveries.eventId,
        status: emailDeliveries.status,
      })
      .from(emailDeliveries)
      .where(inArray(emailDeliveries.eventId, ids)),
  ]);
  return deliveryState(
    rows,
    {
      processed: new Set(processed.map((row) => row.eventId)),
      sent: new Set(
        deliveries.filter((row) => row.status === 'sent').map((r) => r.eventId),
      ),
      failed: new Set(
        deliveries
          .filter((row) => row.status === 'failed')
          .map((row) => row.eventId),
      ),
    },
    now,
  );
}
