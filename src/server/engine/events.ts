import { z } from 'zod';

import { canonicalJson } from '#/core/canonical-json.ts';
import { ulid } from '#/core/ulid.ts';
import { getDb } from '#/db/index.ts';
import { outbox } from '#/db/schema/index.ts';
import { EMAIL_TEMPLATES } from '#/server/mail/templates.ts';

export const EVENT_TYPES = [
  'dispatch_next',
  'send_email',
  'notify_parties',
  'anchor_manifest',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

/** What travels on the queue: ids only, well under 1 KB. */
export const envelopeSchema = z.strictObject({
  v: z.literal(1),
  eventId: z.string().min(1).max(200),
  type: z.enum(EVENT_TYPES),
  documentId: z.string().min(1).max(64),
  subjectId: z.string().max(64).optional(),
  occurredAt: z.number().int(),
});

export type QueueEnvelope = z.infer<typeof envelopeSchema>;

export const dispatchPayloadSchema = z.object({
  documentId: z.string(),
  origin: z.string().optional(),
});

export const notifyPayloadSchema = z.object({
  status: z.enum(['completed', 'declined', 'voided', 'expired', 'reminder']),
  signerId: z.string().optional(),
  origin: z.string().optional(),
});

export const sendEmailPayloadSchema = z.object({
  template: z.enum(EMAIL_TEMPLATES),
  to: z.string().optional(),
  name: z.string().optional(),
  title: z.string().optional(),
  signerId: z.string().optional(),
  /** Raw magic-link token. Removed from the row once the mail is sent. */
  token: z.string().optional(),
  origin: z.string().optional(),
  actor: z.string().optional(),
  /** The decliner's reason. Written only on the owner's declined notice. */
  reason: z.string().optional(),
});

export type SendEmailPayload = z.infer<typeof sendEmailPayloadSchema>;
export type NotifyPayload = z.infer<typeof notifyPayloadSchema>;

export function parsePayload<T>(
  schema: z.ZodType<T>,
  payloadJson: string,
): T | null {
  try {
    const parsed = schema.safeParse(JSON.parse(payloadJson));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** An outbox insert. It commits in the same batch as the state change that needs it. */
export function outboxInsert(input: {
  id?: string;
  type: EventType;
  documentId: string;
  payload: Record<string, unknown>;
  now: number;
}) {
  return getDb()
    .insert(outbox)
    .values({
      id: input.id ?? ulid(),
      topic: 'document',
      type: input.type,
      documentId: input.documentId,
      payloadJson: canonicalJson(input.payload),
      status: 'pending',
      attempts: 0,
      availableAt: input.now,
      createdAt: input.now,
    });
}
