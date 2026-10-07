import { describe, expect, it } from 'vitest';

import {
  deliveryState,
  type JobFacts,
  STUCK_MS,
} from '#/server/domain/delivery.ts';

const NOW = 10_000_000;
const none: JobFacts = {
  processed: new Set(),
  sent: new Set(),
  failed: new Set(),
};

function mail(id: string, signerId: string, createdAt = NOW - 1_000) {
  return {
    id,
    type: 'send_email',
    createdAt,
    payloadJson: JSON.stringify({
      template: 'invite',
      to: `${signerId}@example.com`,
      signerId,
      token: 'raw',
    }),
  };
}

describe('delivery state', () => {
  it('is busy and "sending" while a mail is queued', () => {
    const state = deliveryState([mail('e1', 's1')], none, NOW);
    expect(state.busy).toBe(true);
    expect(state.inviteEmail.get('s1')).toBe('sending');
  });

  it('is idle and "sent" once the mail is delivered', () => {
    const facts = { ...none, sent: new Set(['e1']) };
    const state = deliveryState([mail('e1', 's1')], facts, NOW);
    expect(state.busy).toBe(false);
    expect(state.inviteEmail.get('s1')).toBe('sent');
  });

  it('counts a processed job as done even after the delivery row says nothing', () => {
    const facts = { ...none, processed: new Set(['e1']) };
    expect(deliveryState([mail('e1', 's1')], facts, NOW).busy).toBe(false);
  });

  it('shows "failed" and is not busy once the mail gave up', () => {
    const facts = { ...none, failed: new Set(['e1']) };
    const state = deliveryState([mail('e1', 's1')], facts, NOW);
    expect(state.busy).toBe(false);
    expect(state.inviteEmail.get('s1')).toBe('failed');
  });

  it('treats a very old unfinished mail as failed, not as busy forever', () => {
    const old = mail('e1', 's1', NOW - STUCK_MS - 1);
    const state = deliveryState([old], none, NOW);
    expect(state.busy).toBe(false);
    expect(state.inviteEmail.get('s1')).toBe('failed');
  });

  it('judges each person by their latest mail', () => {
    const rows = [
      mail('old', 's1', NOW - 60_000),
      mail('new', 's1', NOW - 1_000),
    ];
    const facts = { ...none, failed: new Set(['old']) };
    expect(deliveryState(rows, facts, NOW).inviteEmail.get('s1')).toBe(
      'sending',
    );
  });

  it('is busy for other queued work such as the next invite or the anchor', () => {
    const rows = [
      { id: 'd1', type: 'dispatch_next', payloadJson: '{}', createdAt: NOW },
    ];
    const state = deliveryState(rows, none, NOW);
    expect(state.busy).toBe(true);
    expect(state.inviteEmail.size).toBe(0);
  });

  it('ignores mail that is not an invite or reminder', () => {
    const row = {
      ...mail('e1', 's1'),
      payloadJson: JSON.stringify({ template: 'completed', signerId: 's1' }),
    };
    expect(deliveryState([row], none, NOW).inviteEmail.size).toBe(0);
  });
});

describe('mail that used up its retries', () => {
  it('is recorded as failed, and a sent mail is left alone', async () => {
    const { eq } = await import('drizzle-orm');
    const { ulid } = await import('#/core/ulid.ts');
    const { getDb } = await import('#/db/index.ts');
    const { emailDeliveries, outbox } = await import('#/db/schema/index.ts');
    const { markEmailFailed } = await import('#/server/engine/handlers.ts');
    const { migrate } = await import('#/server/test-support.ts');
    await migrate();
    const db = getDb();
    const make = async (id: string) =>
      db.insert(outbox).values({
        id,
        topic: 'document',
        type: 'send_email',
        documentId: ulid(),
        payloadJson: JSON.stringify({
          template: 'invite',
          to: `${id}@example.com`,
          signerId: 's1',
        }),
        status: 'published',
        attempts: 1,
        availableAt: 1,
        createdAt: 1,
      });
    const lost = ulid();
    const delivered = ulid();
    await make(lost);
    await make(delivered);
    await db.insert(emailDeliveries).values({
      id: ulid(),
      eventId: delivered,
      toAddr: `${delivered}@example.com`,
      template: 'invite',
      status: 'sent',
      attempts: 1,
      updatedAt: 1,
    });
    for (const eventId of [lost, delivered]) {
      await markEmailFailed(
        {
          eventId,
          type: 'send_email',
          documentId: 'doc',
          topic: 'document',
        } as never,
        5,
      );
    }
    const status = async (eventId: string) =>
      (
        await db
          .select({ status: emailDeliveries.status })
          .from(emailDeliveries)
          .where(eq(emailDeliveries.eventId, eventId))
      )[0]?.status;
    expect(await status(lost)).toBe('failed');
    expect(await status(delivered)).toBe('sent');
  });
});
