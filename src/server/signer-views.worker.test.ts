import { env } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { INVITE_REASON_MESSAGE } from '#/core/invite-reason.ts';
import { voidDocument } from '#/server/domain/documents.ts';
import { reissueSignerLink } from '#/server/domain/invite.ts';
import {
  declineSignature,
  exchangeSignerToken,
  getSigningContext,
  peekInvite,
  submitSignature,
} from '#/server/domain/signing.ts';
import type { QueueEnvelope } from '#/server/engine/events.ts';
import { publishOutbox } from '#/server/engine/outbox.ts';
import { runSweeper } from '#/server/engine/sweeper.ts';
import { InviteLinkError } from '#/server/errors.ts';
import { setMailer } from '#/server/mail/index.ts';
import { createMemoryMailer } from '#/server/mail/memory.ts';
import {
  type Built,
  buildPublished,
  captureQueue,
  DEV_OWNER_ID,
  migrate,
  ORIGIN,
  pump,
  tokenFor,
} from '#/server/test-support.ts';

let sent: QueueEnvelope[];
let mail: ReturnType<typeof createMemoryMailer>;

beforeAll(async () => {
  await migrate();
  await env.DB.prepare(
    'INSERT OR IGNORE INTO user (id, name, email) VALUES (?, ?, ?)',
  )
    .bind(DEV_OWNER_ID, 'Olivia Owner', 'olivia@example.com')
    .run();
});

beforeEach(() => {
  mail = createMemoryMailer();
  setMailer(mail);
  sent = captureQueue();
});

async function count(query: string, ...binds: unknown[]): Promise<number> {
  const row = await env.DB.prepare(query)
    .bind(...binds)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** Publishes the document and delivers the first invite. */
async function invite(built: Built): Promise<void> {
  await publishOutbox({ documentId: built.documentId });
  await pump(sent);
}

async function next(built: Built): Promise<void> {
  await publishOutbox({ documentId: built.documentId });
  await pump(sent);
}

function tokenOf(built: Built, index: number): string {
  return tokenFor(mail.messages, built.signers[index]?.email ?? '');
}

/** Opens the link and keeps the session, the way the signer's browser keeps its cookie. */
async function open(built: Built, index: number) {
  const exchanged = await exchangeSignerToken({ token: tokenOf(built, index) });
  return exchanged.sessionId;
}

async function sign(built: Built, index: number, sessionId: string) {
  const view = await getSigningContext({ sessionId });
  if (view.kind !== 'ready') throw new Error(`Not ready: ${view.kind}`);
  const signer = built.signers[index];
  if (!signer) throw new Error('No such signer.');
  return submitSignature({
    sessionId,
    body: {
      idempotencyKey: crypto.randomUUID(),
      stateHash: view.stateHash,
      consent: true,
      values: [
        {
          fieldId: signer.fieldId,
          signature: { kind: 'typed', text: signer.name, font: 'script-1' },
        },
      ],
    },
    ip: '203.0.113.9',
    userAgent: 'test',
    origin: ORIGIN,
  });
}

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('It did not reject.');
}

describe('signing context kinds', () => {
  it('ready: an invited signer gets the document, their fields and who sent it', async () => {
    const built = await buildPublished(2);
    await invite(built);
    const view = await getSigningContext({ sessionId: await open(built, 0) });
    expect(view.kind).toBe('ready');
    if (view.kind !== 'ready') return;
    expect(view.title).toBe('Lease');
    expect(view.sender).toEqual({
      name: 'Olivia Owner',
      email: 'olivia@example.com',
    });
    expect(view.you).toMatchObject({ name: 'Signer 1', order: 1 });
    expect(view.count).toBe(2);
    expect(view.others).toEqual([
      { order: 2, name: 'Signer 2', status: 'pending' },
    ]);
    expect(view.fields).toHaveLength(1);
    expect(typeof view.serverNow).toBe('number');
    expect(view.dateSigned.text).toMatch(/^\d{1,2}(st|nd|rd|th) \w{3}, \d{4}$/);
  });

  it('signed-waiting: a middle signer who just signed gets a result, not an error', async () => {
    const built = await buildPublished(3);
    await invite(built);
    const session = await open(built, 0);
    const result = await sign(built, 0, session);
    expect(result.status).toBe('signed');
    const view = await getSigningContext({ sessionId: session });
    expect(view.kind).toBe('signed-waiting');
    if (view.kind !== 'signed-waiting') return;
    expect(view.nextSignerName).toBe('Signer 2');
    expect(view.count).toBe(3);
    expect(typeof view.signedAt).toBe('number');
  });

  it('completed: the last signer gets the finished document with every record', async () => {
    const built = await buildPublished(2);
    await invite(built);
    const first = await open(built, 0);
    await sign(built, 0, first);
    await next(built);
    await pump(sent);
    const second = await open(built, 1);
    const result = await sign(built, 1, second);
    expect(result.status).toBe('completed');
    const view = await getSigningContext({ sessionId: second });
    expect(view.kind).toBe('completed');
    if (view.kind !== 'completed') return;
    expect(view.records.map((record) => record.name)).toEqual([
      'Signer 1',
      'Signer 2',
    ]);
    expect(view.records.map((record) => record.order)).toEqual([1, 2]);
    // An earlier signer's session sees the completed document too.
    expect((await getSigningContext({ sessionId: first })).kind).toBe(
      'completed',
    );
  });

  it('declined-by-you and stopped: the decliner and the others get different results', async () => {
    const built = await buildPublished(2);
    await invite(built);
    const first = await open(built, 0);
    await sign(built, 0, first);
    await next(built);
    await pump(sent);
    const second = await open(built, 1);
    await declineSignature({
      sessionId: second,
      reason: 'Wrong terms',
      origin: ORIGIN,
    });
    const own = await getSigningContext({ sessionId: second });
    expect(own.kind).toBe('declined-by-you');
    if (own.kind !== 'declined-by-you') return;
    expect(own.reason).toBe('Wrong terms');
    expect(typeof own.declinedAt).toBe('number');
    const other = await getSigningContext({ sessionId: first });
    expect(other.kind).toBe('stopped');
    expect(JSON.stringify(other)).not.toContain('Wrong terms');
  });

  it('voided: a cancelled document', async () => {
    const built = await buildPublished(2);
    await invite(built);
    const session = await open(built, 0);
    await voidDocument({ ownerId: DEV_OWNER_ID, documentId: built.documentId });
    expect((await getSigningContext({ sessionId: session })).kind).toBe(
      'voided',
    );
  });

  it('expired: a signer who already signed sees the expired document', async () => {
    const built = await buildPublished(2);
    await invite(built);
    const first = await open(built, 0);
    await sign(built, 0, first);
    await next(built);
    await pump(sent);
    await env.DB.prepare('UPDATE documents SET expires_at = 1 WHERE id = ?')
      .bind(built.documentId)
      .run();
    await runSweeper(Date.now());
    expect((await getSigningContext({ sessionId: first })).kind).toBe(
      'expired',
    );
  });

  it('a missing or lapsed session is still an error', async () => {
    const built = await buildPublished(1);
    await invite(built);
    await expect(getSigningContext({ sessionId: 'nope' })).rejects.toThrow(
      'Open your invite link again',
    );
    const session = await open(built, 0);
    await env.DB.prepare('UPDATE signer_sessions SET expires_at = 1').run();
    await expect(getSigningContext({ sessionId: session })).rejects.toThrow(
      'Open your invite link again',
    );
  });
});

describe('submitting', () => {
  it('returns when it was signed, and the same result for the same key', async () => {
    const built = await buildPublished(2);
    await invite(built);
    const session = await open(built, 0);
    const view = await getSigningContext({ sessionId: session });
    if (view.kind !== 'ready') throw new Error('Not ready.');
    const signer = built.signers[0];
    if (!signer) throw new Error('No signer.');
    const body = {
      idempotencyKey: crypto.randomUUID(),
      stateHash: view.stateHash,
      consent: true as const,
      values: [
        {
          fieldId: signer.fieldId,
          signature: {
            kind: 'typed' as const,
            text: 'Ava',
            font: 'script-1' as const,
          },
        },
      ],
    };
    const meta = { ip: '203.0.113.9', userAgent: 'test', origin: ORIGIN };
    const first = await submitSignature({ sessionId: session, body, ...meta });
    expect(first.status).toBe('signed');
    expect(typeof first.signedAt).toBe('number');
    const again = await submitSignature({ sessionId: session, body, ...meta });
    expect(again).toEqual(first);
    expect(
      await count(
        'SELECT count(*) AS n FROM audit_events WHERE document_id = ? AND type = ?',
        built.documentId,
        'signer.signed',
      ),
    ).toBe(1);
    await expect(
      submitSignature({
        sessionId: session,
        body: { ...body, values: [] },
        ...meta,
      }),
    ).rejects.toThrow('already sent with different details');
  });

  it('a declined document needs a reason', async () => {
    const built = await buildPublished(1);
    await invite(built);
    const session = await open(built, 0);
    await expect(
      declineSignature({ sessionId: session, reason: '   ', origin: ORIGIN }),
    ).rejects.toThrow('Say why you are declining.');
  });
});

describe('invite lookup', () => {
  it('ready: names the document, the sender, the signer and the expiry', async () => {
    const built = await buildPublished(3);
    await invite(built);
    const peek = await peekInvite({ token: tokenOf(built, 0) });
    expect(peek.reason).toBe('ready');
    if (peek.reason !== 'ready') return;
    expect(peek).toMatchObject({
      title: 'Lease',
      senderName: 'Olivia Owner',
      senderEmail: 'olivia@example.com',
      signerName: 'Signer 1',
      signerEmail: 'signer1@example.com',
      order: 1,
      count: 3,
      nextSignerName: 'Signer 2',
      requiredFieldCount: 1,
    });
    const document = await env.DB.prepare(
      'SELECT expires_at AS e FROM documents WHERE id = ?',
    )
      .bind(built.documentId)
      .first<{ e: number }>();
    const token = await env.DB.prepare(
      'SELECT min(expires_at) AS e FROM signer_tokens WHERE signer_id = ?',
    )
      .bind(built.signers[0]?.id)
      .first<{ e: number }>();
    expect(peek.expiresAt).toBe(Math.min(document?.e ?? 0, token?.e ?? 0));
  });

  it('does not count the date and the name, which fill themselves in', async () => {
    const built = await buildPublished(1, { autoFields: true });
    await invite(built);
    const peek = await peekInvite({ token: tokenOf(built, 0) });
    if (peek.reason !== 'ready') throw new Error('Not ready.');
    expect(peek.requiredFieldCount).toBe(1);
  });

  it('the effective expiry is the earlier of the link and the document', async () => {
    const built = await buildPublished(1);
    await invite(built);
    const soon = Date.now() + 60_000;
    await env.DB.prepare('UPDATE documents SET expires_at = ? WHERE id = ?')
      .bind(soon, built.documentId)
      .run();
    const peek = await peekInvite({ token: tokenOf(built, 0) });
    if (peek.reason !== 'ready') throw new Error('Not ready.');
    expect(peek.expiresAt).toBe(soon);
  });

  it('an unknown token returns only its reason', async () => {
    expect(await peekInvite({ token: 'x'.repeat(43) })).toEqual({
      reason: 'invalid',
    });
    expect(await peekInvite({ token: 'short' })).toEqual({ reason: 'invalid' });
  });

  it('replaced: an older link after a new one was sent', async () => {
    const built = await buildPublished(1);
    await invite(built);
    const old = tokenOf(built, 0);
    await reissueSignerLink({
      signerId: built.signers[0]?.id ?? '',
      origin: ORIGIN,
      template: 'invite',
      ownerId: DEV_OWNER_ID,
    });
    const peek = await peekInvite({ token: old });
    expect(peek.reason).toBe('replaced');
    expect(peek).toMatchObject({ title: 'Lease', senderName: 'Olivia Owner' });
  });

  it('expired: the link has lapsed, or the document has', async () => {
    const built = await buildPublished(1);
    await invite(built);
    const token = tokenOf(built, 0);
    await env.DB.prepare('UPDATE signer_tokens SET expires_at = 1').run();
    expect((await peekInvite({ token })).reason).toBe('expired');
    await env.DB.prepare('UPDATE signer_tokens SET expires_at = ?')
      .bind(Date.now() + 100_000)
      .run();
    await env.DB.prepare('UPDATE documents SET expires_at = 1 WHERE id = ?')
      .bind(built.documentId)
      .run();
    expect((await peekInvite({ token })).reason).toBe('expired');
  });

  it('cancelled: the sender voided the document', async () => {
    const built = await buildPublished(1);
    await invite(built);
    const token = tokenOf(built, 0);
    await voidDocument({ ownerId: DEV_OWNER_ID, documentId: built.documentId });
    expect((await peekInvite({ token })).reason).toBe('cancelled');
  });

  it('signed: the signer already signed', async () => {
    const built = await buildPublished(2);
    await invite(built);
    const token = tokenOf(built, 0);
    await sign(built, 0, await open(built, 0));
    expect((await peekInvite({ token })).reason).toBe('signed');
  });

  it('stopped: another signer declined, and byYou marks the decliner', async () => {
    const built = await buildPublished(2);
    await invite(built);
    const first = tokenOf(built, 0);
    await sign(built, 0, await open(built, 0));
    await next(built);
    await pump(sent);
    const secondToken = tokenOf(built, 1);
    await declineSignature({
      sessionId: await open(built, 1),
      reason: 'No',
      origin: ORIGIN,
    });
    const other = await peekInvite({ token: first });
    expect(other.reason).toBe('stopped');
    expect(other).toMatchObject({ byYou: false });
    const own = await peekInvite({ token: secondToken });
    expect(own.reason).toBe('stopped');
    expect(own).toMatchObject({ byYou: true });
  });

  it('has no side effects', async () => {
    const built = await buildPublished(2);
    await invite(built);
    const token = tokenOf(built, 0);
    const snapshot = async () => ({
      sessions: await count('SELECT count(*) AS n FROM signer_sessions'),
      audit: await count(
        'SELECT count(*) AS n FROM audit_events WHERE document_id = ?',
        built.documentId,
      ),
      revoked: await count(
        'SELECT count(*) AS n FROM signer_tokens WHERE revoked_at IS NOT NULL',
      ),
      viewed: await count(
        'SELECT count(*) AS n FROM signers WHERE first_viewed_at IS NOT NULL',
      ),
      versions: await count('SELECT sum(version) AS n FROM signers'),
      outbox: await count('SELECT count(*) AS n FROM outbox'),
    });
    const before = await snapshot();
    for (let round = 0; round < 3; round += 1) await peekInvite({ token });
    await peekInvite({ token: 'x'.repeat(43) });
    expect(await snapshot()).toEqual(before);
    // The link still works afterwards, so nothing was used up.
    expect(await open(built, 0)).toBeTruthy();
  });

  it('the exchange fails with the same reasons', async () => {
    const built = await buildPublished(2);
    await invite(built);
    const old = tokenOf(built, 0);
    await reissueSignerLink({
      signerId: built.signers[0]?.id ?? '',
      origin: ORIGIN,
      template: 'invite',
      ownerId: DEV_OWNER_ID,
    });
    const replaced = await rejection(exchangeSignerToken({ token: old }));
    expect(replaced).toBeInstanceOf(InviteLinkError);
    expect((replaced as InviteLinkError).reason).toBe('replaced');
    expect((replaced as InviteLinkError).message).toBe(
      INVITE_REASON_MESSAGE.replaced,
    );
    const unknown = await rejection(
      exchangeSignerToken({ token: 'x'.repeat(43) }),
    );
    expect((unknown as InviteLinkError).reason).toBe('invalid');
    expect((unknown as InviteLinkError).message).toBe(
      'This link is no longer valid.',
    );
  });
});

describe('privacy of signer responses', () => {
  it("never carries another signer's email, or anyone's IP address", async () => {
    const built = await buildPublished(3);
    await invite(built);
    const seen: { index: number; text: string }[] = [];
    const record = async (index: number, sessionId: string) => {
      seen.push({
        index,
        text: JSON.stringify(await getSigningContext({ sessionId })),
      });
    };
    const first = await open(built, 0);
    await record(0, first);
    seen.push({
      index: 0,
      text: JSON.stringify(await peekInvite({ token: tokenOf(built, 0) })),
    });
    await sign(built, 0, first);
    await record(0, first);
    await next(built);
    await pump(sent);
    const second = await open(built, 1);
    await record(1, second);
    await sign(built, 1, second);
    await record(1, second);
    await next(built);
    await pump(sent);
    const third = await open(built, 2);
    await sign(built, 2, third);
    await record(2, third);
    await record(0, first);
    expect(seen.length).toBeGreaterThanOrEqual(7);
    for (const { index, text } of seen) {
      built.signers.forEach((signer, other) => {
        if (other !== index) expect(text).not.toContain(signer.email);
      });
      expect(text).not.toContain('203.0.113.9');
    }
  });
});

describe('the declined notice', () => {
  it('tells the sender why, and tells nobody else', async () => {
    const built = await buildPublished(3);
    await invite(built);
    await sign(built, 0, await open(built, 0));
    await next(built);
    await pump(sent);
    await declineSignature({
      sessionId: await open(built, 1),
      reason: 'The rent is wrong',
      origin: ORIGIN,
    });
    await publishOutbox({ documentId: built.documentId });
    await pump(sent);
    const declined = mail.messages.filter((message) =>
      message.subject.includes('declined'),
    );
    const toOwner = declined.find(
      (message) => message.to === 'olivia@example.com',
    );
    const toSigner = declined.find(
      (message) => message.to === built.signers[0]?.email,
    );
    expect(toOwner?.text).toContain('Reason: The rent is wrong');
    expect(toOwner?.html).toContain('The rent is wrong');
    expect(toOwner?.text).toContain('Signer 2 declined to sign');
    expect(toSigner?.text).not.toContain('The rent is wrong');
    expect(toSigner?.html).not.toContain('The rent is wrong');
    expect(toSigner?.text).toContain('Nobody else will be asked to sign it.');
    expect(
      declined.some((message) => message.to === built.signers[1]?.email),
    ).toBe(false);
  });
});
