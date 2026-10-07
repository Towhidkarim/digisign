import { env } from 'cloudflare:workers';
import { and, asc, desc, eq, lt, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';

import { canonicalJson } from '#/core/canonical-json.ts';
import { ulid } from '#/core/ulid.ts';
import { getDb } from '#/db/index.ts';
import {
  auditEvents,
  documents,
  emailDeliveries,
  inbox,
  outbox,
  signers,
} from '#/db/schema/index.ts';
import { ownerContact } from '#/server/actor.ts';
import { inviteNextSigner, reissueSignerLink } from '#/server/domain/invite.ts';
import { PermanentEventError } from '#/server/engine/errors.ts';
import {
  dispatchPayloadSchema,
  notifyPayloadSchema,
  outboxInsert,
  parsePayload,
  type QueueEnvelope,
  sendEmailPayloadSchema,
} from '#/server/engine/events.ts';
import { publishOutbox } from '#/server/engine/outbox.ts';
import { isAppError } from '#/server/errors.ts';
import { appOrigin, getMailer } from '#/server/mail/index.ts';
import { MailError } from '#/server/mail/mailer.ts';
import { type EmailTemplate, renderEmail } from '#/server/mail/templates.ts';
import { signCanonical } from '#/server/manifest-key.ts';

/** How long a send_email claim holds before another attempt may take it. */
const CLAIM_MS = 60_000;

export type HandlerOutcome = 'done' | 'retry';

export async function processEvent(
  envelope: QueueEnvelope,
  now: number = Date.now(),
): Promise<HandlerOutcome> {
  if (await alreadyProcessed(envelope)) return 'done';
  switch (envelope.type) {
    case 'dispatch_next':
      return dispatchNext(envelope, now);
    case 'send_email':
      return sendEmail(envelope, now);
    case 'notify_parties':
      return notifyParties(envelope, now);
    case 'anchor_manifest':
      return anchorManifest(envelope, now);
  }
}

async function alreadyProcessed(envelope: QueueEnvelope): Promise<boolean> {
  const [row] = await getDb()
    .select({ eventId: inbox.eventId })
    .from(inbox)
    .where(
      and(
        eq(inbox.consumer, envelope.type),
        eq(inbox.eventId, envelope.eventId),
      ),
    )
    .limit(1);
  return row != null;
}

function inboxInsert(envelope: QueueEnvelope, now: number) {
  return getDb()
    .insert(inbox)
    .values({
      consumer: envelope.type,
      eventId: envelope.eventId,
      processedAt: now,
    })
    .onConflictDoNothing();
}

async function loadOutbox(eventId: string) {
  const [row] = await getDb()
    .select()
    .from(outbox)
    .where(eq(outbox.id, eventId))
    .limit(1);
  return row ?? null;
}

// dispatch_next: the next signer becomes `invited` and gets a send_email row.

async function dispatchNext(
  envelope: QueueEnvelope,
  now: number,
): Promise<HandlerOutcome> {
  const row = await loadOutbox(envelope.eventId);
  const payload = row
    ? parsePayload(dispatchPayloadSchema, row.payloadJson)
    : null;
  if (!row || !payload)
    throw new PermanentEventError('dispatch_next has no readable outbox row.');
  // Nothing to do when the previous signer has not committed yet, or the document is closed.
  // The commit that finishes a signer writes its own dispatch_next, and the cron covers a lost one.
  const result = await inviteNextSigner({
    documentId: envelope.documentId,
    origin: payload.origin ?? appOrigin(),
    now,
  });
  await inboxInsert(envelope, now);
  if (result.invited)
    await publishOutbox({ documentId: envelope.documentId, now });
  return 'done';
}

// send_email: claim, render, send, mark sent. At-least-once, with a provider idempotency key.

async function sendEmail(
  envelope: QueueEnvelope,
  now: number,
): Promise<HandlerOutcome> {
  const db = getDb();
  const row = await loadOutbox(envelope.eventId);
  const payload = row
    ? parsePayload(sendEmailPayloadSchema, row.payloadJson)
    : null;
  if (!row || !payload)
    throw new PermanentEventError('send_email has no readable outbox row.');
  const [delivered] = await db
    .select()
    .from(emailDeliveries)
    .where(eq(emailDeliveries.eventId, envelope.eventId))
    .limit(1);
  if (delivered?.status === 'sent' || delivered?.status === 'failed') {
    await inboxInsert(envelope, now);
    return 'done';
  }
  const to = payload.to;
  if (!to) throw new PermanentEventError('send_email has no recipient.');
  const carriesLink =
    payload.template === 'invite' || payload.template === 'reminder';
  if (carriesLink && !payload.token) {
    throw new PermanentEventError(
      'The magic link is no longer stored for this mail.',
    );
  }
  const claimed = await db
    .insert(emailDeliveries)
    .values({
      id: ulid(),
      eventId: envelope.eventId,
      toAddr: to,
      template: payload.template,
      status: 'claimed',
      claimedUntil: now + CLAIM_MS,
      attempts: 1,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [emailDeliveries.eventId, emailDeliveries.toAddr],
      set: {
        status: 'claimed',
        claimedUntil: now + CLAIM_MS,
        attempts: sql`${emailDeliveries.attempts} + 1`,
        updatedAt: now,
      },
      setWhere: and(
        eq(emailDeliveries.status, 'claimed'),
        lt(emailDeliveries.claimedUntil, now),
      ),
    })
    .returning({ id: emailDeliveries.id });
  if (claimed.length === 0) {
    const [current] = await db
      .select()
      .from(emailDeliveries)
      .where(eq(emailDeliveries.eventId, envelope.eventId))
      .limit(1);
    if (current?.status === 'claimed') return 'retry';
    await inboxInsert(envelope, now);
    return 'done';
  }
  const origin = payload.origin ?? appOrigin();
  const message = await renderEmail({
    template: payload.template,
    to,
    name: payload.name ?? '',
    title: payload.title ?? 'your document',
    url: payload.token ? `${origin}/s/${payload.token}` : undefined,
    verifyUrl: `${origin}/v/${envelope.documentId}`,
    actor: payload.actor,
    reason: payload.reason,
  });
  let providerMessageId: string | null = null;
  try {
    const receipt = await getMailer().send(message, {
      idempotencyKey: envelope.eventId,
    });
    providerMessageId = receipt.providerMessageId;
  } catch (error) {
    if (error instanceof MailError && error.kind === 'permanent') {
      await db.batch([
        db
          .update(emailDeliveries)
          .set({ status: 'failed', updatedAt: now })
          .where(
            and(
              eq(emailDeliveries.eventId, envelope.eventId),
              eq(emailDeliveries.toAddr, to),
            ),
          ),
        inboxInsert(envelope, now),
      ]);
      throw new PermanentEventError(error.message);
    }
    await db
      .update(emailDeliveries)
      .set({ claimedUntil: 0, updatedAt: now })
      .where(
        and(
          eq(emailDeliveries.eventId, envelope.eventId),
          eq(emailDeliveries.toAddr, to),
          eq(emailDeliveries.status, 'claimed'),
        ),
      );
    throw error;
  }
  await db.batch([
    db
      .update(emailDeliveries)
      .set({
        status: 'sent',
        providerMessageId,
        claimedUntil: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(emailDeliveries.eventId, envelope.eventId),
          eq(emailDeliveries.toAddr, to),
        ),
      ),
    // The raw magic-link token has done its job. Keep only what identifies the mail.
    db
      .update(outbox)
      .set({
        payloadJson: carriesLink
          ? canonicalJson({
              template: payload.template,
              signerId: payload.signerId,
            })
          : row.payloadJson,
      })
      .where(eq(outbox.id, envelope.eventId)),
    inboxInsert(envelope, now),
  ]);
  return 'done';
}

// notify_parties: one send_email row per recipient, or a fresh link for a reminder.

async function notifyParties(
  envelope: QueueEnvelope,
  now: number,
): Promise<HandlerOutcome> {
  const db = getDb();
  const row = await loadOutbox(envelope.eventId);
  const payload = row
    ? parsePayload(notifyPayloadSchema, row.payloadJson)
    : null;
  if (!row || !payload)
    throw new PermanentEventError('notify_parties has no readable outbox row.');
  const [document] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, envelope.documentId))
    .limit(1);
  const origin = payload.origin ?? appOrigin();
  if (!document) {
    await inboxInsert(envelope, now);
    return 'done';
  }
  if (payload.status === 'reminder') {
    if (payload.signerId && document.status === 'in_progress') {
      try {
        await reissueSignerLink({
          signerId: payload.signerId,
          origin,
          template: 'reminder',
          now,
        });
      } catch (error) {
        // The signer signed or the document closed in the meantime. Nothing to remind.
        if (!isAppError(error)) throw error;
      }
    }
    await inboxInsert(envelope, now);
    await publishOutbox({ documentId: envelope.documentId, now });
    return 'done';
  }
  if (document.status !== payload.status) {
    await inboxInsert(envelope, now);
    return 'done';
  }
  const people = await db
    .select()
    .from(signers)
    .where(eq(signers.documentId, document.id))
    .orderBy(asc(signers.signingOrder));
  const decliner = people.find((person) => person.status === 'declined');
  const template: EmailTemplate = payload.status;
  const recipients: { key: string; to: string; name: string }[] = [];
  const owner = await ownerContact(document.ownerId);
  if (owner)
    recipients.push({ key: 'owner', to: owner.email, name: owner.name });
  for (const person of people) {
    if (person.invitedAt == null || !person.email) continue;
    if (person.status === 'declined') continue;
    recipients.push({ key: person.id, to: person.email, name: person.name });
  }
  const inserts = recipients.map((recipient) =>
    outboxInsert({
      // Deterministic, so a repeated delivery of this event inserts nothing new.
      id: `${envelope.eventId}:${recipient.key}`,
      type: 'send_email',
      documentId: document.id,
      payload: {
        template,
        to: recipient.to,
        name: recipient.name,
        title: document.title,
        origin,
        actor: decliner?.name,
        // Only the sender is told why. Other signers get the notice without it.
        ...(recipient.key === 'owner' && decliner?.declineReason
          ? { reason: decliner.declineReason }
          : {}),
      },
      now,
    }).onConflictDoNothing(),
  );
  const statements: BatchItem<'sqlite'>[] = [
    ...inserts,
    inboxInsert(envelope, now),
  ];
  await db.batch(statements as [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]);
  await publishOutbox({ documentId: envelope.documentId, now });
  return 'done';
}

// anchor_manifest: copy the signed manifest and a signed audit checkpoint into locked prefixes.

export function manifestAnchorKey(
  documentId: string,
  manifestSha256: string,
): string {
  return `manifests/${documentId}/${manifestSha256}.json`;
}

export function checkpointKey(documentId: string, seq: number): string {
  return `anchors/${documentId}/${seq}.json`;
}

async function anchorManifest(
  envelope: QueueEnvelope,
  now: number,
): Promise<HandlerOutcome> {
  const db = getDb();
  const [document] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, envelope.documentId))
    .limit(1);
  if (
    !document ||
    document.status !== 'completed' ||
    !document.manifestJson ||
    !document.manifestSha256 ||
    document.anchoredAt != null
  ) {
    await inboxInsert(envelope, now);
    return 'done';
  }
  const [head] = await db
    .select({ seq: auditEvents.seq, hash: auditEvents.hash })
    .from(auditEvents)
    .where(eq(auditEvents.documentId, document.id))
    .orderBy(desc(auditEvents.seq))
    .limit(1);
  if (!head)
    throw new PermanentEventError('A completed document has no audit chain.');
  const manifestKey = manifestAnchorKey(document.id, document.manifestSha256);
  // Content-addressed: if the key exists it already holds these bytes. Never overwrite.
  if (!(await env.STORAGE.head(manifestKey))) {
    await env.STORAGE.put(manifestKey, document.manifestJson, {
      httpMetadata: { contentType: 'application/json' },
    });
  }
  const checkpoint = canonicalJson({
    v: 1,
    documentId: document.id,
    seq: head.seq,
    headHash: head.hash,
    manifestSha256: document.manifestSha256,
  });
  const signed = await signCanonical(checkpoint);
  const anchorKey = checkpointKey(document.id, head.seq);
  if (!(await env.STORAGE.head(anchorKey))) {
    await env.STORAGE.put(
      anchorKey,
      canonicalJson({
        checkpoint: JSON.parse(checkpoint),
        keyId: signed.keyId,
        sig: signed.sig,
      }),
      { httpMetadata: { contentType: 'application/json' } },
    );
  }
  await db.batch([
    db
      .update(documents)
      .set({ anchoredAt: now, manifestR2Key: manifestKey })
      .where(
        and(
          eq(documents.id, document.id),
          sql`${documents.anchoredAt} IS NULL`,
        ),
      ),
    inboxInsert(envelope, now),
  ]);
  return 'done';
}
