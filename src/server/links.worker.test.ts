import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { FieldInput, PageGeometryInput } from '#/core/contracts/index.ts';
import { signatureInputSchema } from '#/core/contracts/index.ts';
import { ptToMicro } from '#/core/coords.ts';
import { sha256Hex } from '#/core/hash.ts';
import { ulid } from '#/core/ulid.ts';
import { getDb } from '#/db/index.ts';
import { signers } from '#/db/schema/index.ts';
import {
  createDraft,
  initUpload,
  listOwnedDocuments,
  publish,
  saveLayout,
  saveSigners,
  saveSignersInputSchema,
} from '#/server/domain/documents.ts';
import { reissueInvite, startOwnSigning } from '#/server/domain/invite.ts';
import {
  deleteSavedSignature,
  readSavedSignature,
  writeSavedSignature,
} from '#/server/domain/saved-signature.ts';
import {
  exchangeSignerToken,
  getSigningContext,
  submitSignature,
} from '#/server/domain/signing.ts';
import { putDocumentSource } from '#/server/domain/source.ts';
import type { QueueEnvelope } from '#/server/engine/events.ts';
import { publishOutbox } from '#/server/engine/outbox.ts';
import { setMailer } from '#/server/mail/index.ts';
import { createMemoryMailer } from '#/server/mail/memory.ts';
import {
  captureQueue,
  DEV_OWNER_ID,
  migrate,
  ORIGIN,
  pump,
  tokenFor,
} from '#/server/test-support.ts';

const letter: PageGeometryInput = {
  mediaBox: [0, 0, 612, 792],
  cropBox: [0, 0, 612, 792],
  rotate: 0,
};

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

type Person = { id: string; name: string; email: string; self?: boolean };

/** An uploaded draft with one signature field per person. Not published. */
async function draftWith(people: Person[]) {
  const bytes = new TextEncoder().encode(`%PDF-1.4\nlinks ${ulid()}`);
  const documentId = ulid();
  await createDraft({ id: documentId, title: 'Lease', ownerId: DEV_OWNER_ID });
  await initUpload({
    ownerId: DEV_OWNER_ID,
    upload: {
      documentId,
      sha256: await sha256Hex(bytes),
      sizeBytes: bytes.byteLength,
      pageCount: 1,
      geometry: [letter],
    },
  });
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  await putDocumentSource({
    documentId,
    ownerId: DEV_OWNER_ID,
    body: new Blob([copy]).stream(),
    contentLength: bytes.byteLength,
  });
  await saveSigners({
    ownerId: DEV_OWNER_ID,
    documentId,
    layoutVersion: 0,
    signers: people,
  });
  const fields: FieldInput[] = people.map((person, index) => ({
    id: ulid(),
    signerId: person.id,
    pageIndex: 0,
    kind: 'signature',
    x: 10_000,
    y: 10_000 + index * 80_000,
    w: ptToMicro(120, 612),
    h: ptToMicro(36, 792),
    required: true,
  }));
  await saveLayout({
    ownerId: DEV_OWNER_ID,
    layout: { documentId, layoutVersion: 1, fields },
  });
  return { documentId, fields };
}

async function dispatch(documentId: string) {
  await publishOutbox({ documentId });
  await pump(sent);
}

async function signWith(
  token: string,
  fieldId: string,
  name: string,
): Promise<void> {
  const exchanged = await exchangeSignerToken({ token });
  const view = await getSigningContext({ sessionId: exchanged.sessionId });
  if (view.kind !== 'ready') throw new Error(`Not ready: ${view.kind}`);
  await submitSignature({
    sessionId: exchanged.sessionId,
    body: {
      idempotencyKey: crypto.randomUUID(),
      stateHash: view.stateHash,
      consent: true,
      values: [
        { fieldId, signature: { kind: 'typed', text: name, font: 'script-1' } },
      ],
    },
    ip: '203.0.113.9',
    userAgent: 'test',
    origin: ORIGIN,
  });
}

describe('sending by link', () => {
  it('lets a signer have no email, and publishes it either way', async () => {
    const people = [{ id: ulid(), name: 'Ana', email: '' }];
    const { documentId } = await draftWith(people);
    await publish({ ownerId: DEV_OWNER_ID, documentId, origin: ORIGIN });
    await dispatch(documentId);
    expect(mail.messages).toHaveLength(0);
  });

  it('mails nobody, and the owner can mint a link that signs', async () => {
    const people = [
      { id: ulid(), name: 'Ana', email: '' },
      { id: ulid(), name: 'Ben', email: 'ben@example.com' },
    ];
    const { documentId, fields } = await draftWith(people);
    await publish({
      ownerId: DEV_OWNER_ID,
      documentId,
      origin: ORIGIN,
      delivery: 'link',
    });
    await dispatch(documentId);
    expect(mail.messages).toHaveLength(0);
    const first = people[0];
    if (!first) throw new Error('no signer');
    const issued = await reissueInvite({
      ownerId: DEV_OWNER_ID,
      signerId: first.id,
      origin: ORIGIN,
    });
    await dispatch(documentId);
    expect(mail.messages).toHaveLength(0);
    await signWith(issued.token, fields[0]?.id ?? '', 'Ana');
    await dispatch(documentId);
    // The next signer is invited too, still without mail, even though Ben has an address.
    expect(mail.messages).toHaveLength(0);
    const [ben] = await getDb()
      .select()
      .from(signers)
      .where(eq(signers.id, people[1]?.id ?? ''));
    expect(ben?.status).toBe('invited');
  });
});

describe('signing your own document', () => {
  it('lets the owner be a signer with no address, tracks it, and signs without mail', async () => {
    const me = { id: ulid(), name: 'Olivia Owner', email: '', self: true };
    const client = { id: ulid(), name: 'Client', email: 'client@example.com' };
    const { documentId, fields } = await draftWith([me, client]);
    await publish({ ownerId: DEV_OWNER_ID, documentId, origin: ORIGIN });
    await dispatch(documentId);
    expect(mail.messages).toHaveLength(0);

    const listed = (await listOwnedDocuments(DEV_OWNER_ID)).find(
      (item) => item.id === documentId,
    );
    expect(listed?.youToSign).toBe(me.id);

    await expect(
      startOwnSigning({
        ownerId: DEV_OWNER_ID,
        signerId: client.id,
        origin: ORIGIN,
      }),
    ).rejects.toThrow(/not you/);

    const started = await startOwnSigning({
      ownerId: DEV_OWNER_ID,
      signerId: me.id,
      origin: ORIGIN,
    });
    await dispatch(documentId);
    expect(mail.messages).toHaveLength(0);
    await signWith(started.token, fields[0]?.id ?? '', 'Olivia');

    await dispatch(documentId);
    const after = (await listOwnedDocuments(DEV_OWNER_ID)).find(
      (item) => item.id === documentId,
    );
    expect(after?.youToSign).toBeNull();
    // The client, not the owner, is mailed next.
    expect(tokenFor(mail.messages, 'client@example.com')).toBeTruthy();
  });

  it('allows only one signer to be you', () => {
    const base = { documentId: ulid(), layoutVersion: 0 };
    const mine = (self: boolean) => ({
      id: ulid(),
      name: 'Me',
      email: '',
      self,
    });
    expect(
      saveSignersInputSchema.safeParse({
        ...base,
        signers: [mine(true), mine(false)],
      }).success,
    ).toBe(true);
    expect(
      saveSignersInputSchema.safeParse({
        ...base,
        signers: [mine(true), mine(true)],
      }).success,
    ).toBe(false);
  });
});

// A real 1 x 1 PNG.
const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function stamp(overrides: Record<string, unknown> = {}) {
  const bytes = Uint8Array.from(atob(PNG_1X1), (c) => c.charCodeAt(0));
  return {
    kind: 'image' as const,
    mime: 'image/png' as const,
    w: 1,
    h: 1,
    data: PNG_1X1,
    sha256: await sha256Hex(bytes),
    ...overrides,
  };
}

describe('image signatures', () => {
  it('only accepts a PNG, and nothing else in the data', async () => {
    expect(signatureInputSchema.safeParse(await stamp()).success).toBe(true);
    expect(
      signatureInputSchema.safeParse(await stamp({ data: 'AAAA' })).success,
    ).toBe(false);
    expect(
      signatureInputSchema.safeParse(await stamp({ w: 100_000 })).success,
    ).toBe(false);
  });

  async function trySign(signature: unknown) {
    const people = [{ id: ulid(), name: 'Ana', email: 'ana@example.com' }];
    const { documentId, fields } = await draftWith(people);
    await publish({ ownerId: DEV_OWNER_ID, documentId, origin: ORIGIN });
    await dispatch(documentId);
    const mail_ = tokenFor(mail.messages, 'ana@example.com');
    const exchanged = await exchangeSignerToken({ token: mail_ ?? '' });
    const view = await getSigningContext({ sessionId: exchanged.sessionId });
    if (view.kind !== 'ready') throw new Error(`Not ready: ${view.kind}`);
    return {
      documentId,
      result: submitSignature({
        sessionId: exchanged.sessionId,
        body: {
          idempotencyKey: crypto.randomUUID(),
          stateHash: view.stateHash,
          consent: true,
          values: [
            {
              fieldId: fields[0]?.id ?? '',
              signature: signature as never,
            },
          ],
        },
        ip: '203.0.113.9',
        userAgent: 'test',
        origin: ORIGIN,
      }),
    };
  }

  it('signs with a stamp image and completes', async () => {
    const { result } = await trySign(await stamp());
    expect((await result).status).toBe('completed');
  });

  it('rejects an image whose hash or size does not match its bytes', async () => {
    const wrongHash = await trySign(await stamp({ sha256: 'ab'.repeat(32) }));
    await expect(wrongHash.result).rejects.toThrow(/image/i);
    const wrongSize = await trySign(await stamp({ w: 2 }));
    await expect(wrongSize.result).rejects.toThrow(/image/i);
  });
});

describe('a signature kept on the account', () => {
  it('keeps one per user, replaces it, and forgets it', async () => {
    expect(await readSavedSignature(DEV_OWNER_ID)).toBeNull();
    await writeSavedSignature({
      userId: DEV_OWNER_ID,
      signature: { kind: 'typed', text: 'Olivia', font: 'script-1' },
    });
    expect((await readSavedSignature(DEV_OWNER_ID))?.kind).toBe('typed');
    await writeSavedSignature({
      userId: DEV_OWNER_ID,
      signature: await stamp(),
    });
    expect((await readSavedSignature(DEV_OWNER_ID))?.kind).toBe('image');
    // Another user sees nothing of it.
    expect(await readSavedSignature(ulid())).toBeNull();
    await deleteSavedSignature(DEV_OWNER_ID);
    expect(await readSavedSignature(DEV_OWNER_ID)).toBeNull();
  });
});
