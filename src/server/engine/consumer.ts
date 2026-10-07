import { z } from 'zod';
import { canonicalJson } from '#/core/canonical-json.ts';
import { ulid } from '#/core/ulid.ts';
import { getDb } from '#/db/index.ts';
import { insertProbe } from '#/db/probes.ts';
import { deadLetters } from '#/db/schema/index.ts';
import { backoffSeconds, PermanentEventError } from '#/server/engine/errors.ts';
import { envelopeSchema } from '#/server/engine/events.ts';
import { markEmailFailed, processEvent } from '#/server/engine/handlers.ts';

const probeSchema = z.object({ note: z.string() });

export async function recordDeadLetter(input: {
  queue: string;
  body: unknown;
  attempts: number;
  error: string;
  now?: number;
}): Promise<void> {
  let bodyJson: string;
  try {
    bodyJson = canonicalJson(input.body);
  } catch {
    bodyJson = JSON.stringify(String(input.body));
  }
  await getDb()
    .insert(deadLetters)
    .values({
      id: ulid(),
      queue: input.queue,
      bodyJson,
      attempts: input.attempts,
      error: input.error.slice(0, 500),
      createdAt: input.now ?? Date.now(),
    });
  console.error(`[dead-letter] ${input.queue}: ${input.error}`);
}

/** `ds-events`: one event at a time, acked only when its work is committed. */
export async function handleEventBatch(
  batch: MessageBatch<unknown>,
): Promise<void> {
  for (const message of batch.messages) {
    const parsed = envelopeSchema.safeParse(message.body);
    if (!parsed.success) {
      const probe = probeSchema.safeParse(message.body);
      if (probe.success) {
        // The /dev/foundations page sends a plain note to prove the queue works.
        await insertProbe('queue', probe.data.note);
      } else {
        await recordDeadLetter({
          queue: batch.queue,
          body: message.body,
          attempts: message.attempts,
          error: 'The message is not a valid event envelope.',
        });
      }
      message.ack();
      continue;
    }
    try {
      const outcome = await processEvent(parsed.data);
      if (outcome === 'retry') {
        message.retry({ delaySeconds: backoffSeconds(message.attempts) });
      } else {
        message.ack();
      }
    } catch (error) {
      if (error instanceof PermanentEventError) {
        await recordDeadLetter({
          queue: batch.queue,
          body: message.body,
          attempts: message.attempts,
          error: error.message,
        });
        message.ack();
        continue;
      }
      console.error(`[${parsed.data.type}] will retry`, error);
      message.retry({ delaySeconds: backoffSeconds(message.attempts) });
    }
  }
}

/** `ds-dlq`: messages that used up their retries. Keep them for replay. */
export async function handleDeadLetterBatch(
  batch: MessageBatch<unknown>,
): Promise<void> {
  for (const message of batch.messages) {
    const envelope = envelopeSchema.safeParse(message.body);
    if (envelope.success) await markEmailFailed(envelope.data, Date.now());
    await recordDeadLetter({
      queue: 'ds-events',
      body: message.body,
      attempts: message.attempts,
      error: 'The message used up its retries.',
    });
    message.ack();
  }
}
