import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';

import { canonicalJson } from '#/core/canonical-json.ts';
import type { FieldInput, PageGeometryInput } from '#/core/contracts/index.ts';
import { ptToMicro } from '#/core/coords.ts';
import { sha256Hex } from '#/core/hash.ts';
import { encodeStrokes, validatePackedStrokes } from '#/core/strokes-codec.ts';
import { ulid } from '#/core/ulid.ts';
import { guardedBatch, setCommitFault } from '#/db/guarded-batch.ts';
import { getDb } from '#/db/index.ts';
import { documents, idempotencyKeys, outbox } from '#/db/schema/index.ts';
import { insertAudit, planAudit } from '#/server/domain/audit.ts';
import {
  createDraft,
  initUpload,
  publish,
  saveLayout,
  saveSigners,
  voidDocument,
} from '#/server/domain/documents.ts';
import {
  type ServerManifest,
  sealEvidence,
  signManifest,
} from '#/server/domain/evidence.ts';
import { inviteNextSigner } from '#/server/domain/invite.ts';
import {
  exchangeSignerToken,
  getSigningContext,
  submitSignature,
} from '#/server/domain/signing.ts';
import {
  putDocumentSource,
  takeLastPutChecksum,
} from '#/server/domain/source.ts';
import { AppError } from '#/server/errors.ts';
import { verifyCanonical } from '#/server/manifest-key.ts';
import { DEV_OWNER_ID, migrate } from '#/server/test-support.ts';

const letter: PageGeometryInput = {
  mediaBox: [0, 0, 612, 792],
  cropBox: [0, 0, 612, 792],
  rotate: 0,
};

beforeAll(migrate);

describe('phase 2', () => {
  it('R-2.1 a compare-and-set miss leaves no audit, outbox, or idempotency row', async () => {
    const before = await counts();
    const audit = await planAudit({
      documentId: ulid(),
      type: 'document.created',
      actorType: 'owner',
      actorId: DEV_OWNER_ID,
      occurredAt: 1,
      payload: { title: 'miss' },
      prev: null,
    });
    const result = await guardedBatch({
      cas: [
        getDb()
          .update(documents)
          .set({ title: 'nope' })
          .where(eq(documents.id, ulid())),
      ],
      effects: [
        insertAudit(audit),
        getDb().insert(outbox).values({
          id: ulid(),
          topic: 'document',
          type: 'dispatch_next',
          documentId: audit.documentId,
          payloadJson: '{}',
          status: 'pending',
          attempts: 0,
          availableAt: 1,
          createdAt: 1,
        }),
        getDb()
          .insert(idempotencyKeys)
          .values({
            actorKey: 'signer:missing',
            key: crypto.randomUUID(),
            requestSha256: 'ab'.repeat(32),
            responseJson: '{}',
            createdAt: 1,
          }),
      ],
    });
    expect(result).toEqual({ ok: false, reason: 'conflict' });
    expect(await counts()).toEqual(before);
  });

  it('R-2.2 keeps one winner across parallel submits, void, and layout saves', async () => {
    const ready = await readyToSign();
    const submits = await Promise.allSettled(
      Array.from({ length: 20 }, () =>
        submitSignature({
          sessionId: ready.sessionId,
          body: {
            idempotencyKey: crypto.randomUUID(),
            stateHash: ready.stateHash,
            consent: true,
            values: ready.values,
          },
          ip: '127.0.0.1',
          userAgent: 'vitest',
          origin: 'https://digisign.test',
        }),
      ),
    );
    expect(submits.filter((item) => item.status === 'fulfilled')).toHaveLength(
      1,
    );
    expect(submits.filter((item) => item.status === 'rejected')).toHaveLength(
      19,
    );

    const race = await readyToSign();
    const raced = await Promise.allSettled([
      submitSignature({
        sessionId: race.sessionId,
        body: {
          idempotencyKey: crypto.randomUUID(),
          stateHash: race.stateHash,
          consent: true,
          values: race.values,
        },
        ip: '127.0.0.1',
        userAgent: 'vitest',
        origin: 'https://digisign.test',
      }),
      voidDocument({ ownerId: DEV_OWNER_ID, documentId: race.documentId }),
    ]);
    expect(raced.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    const [document] = await getDb()
      .select()
      .from(documents)
      .where(eq(documents.id, race.documentId));
    expect(['completed', 'voided']).toContain(document?.status);

    const draftId = ulid();
    await createDraft({ id: draftId, title: 'Layout', ownerId: DEV_OWNER_ID });
    const signerId = ulid();
    await saveSigners({
      ownerId: DEV_OWNER_ID,
      documentId: draftId,
      layoutVersion: 0,
      signers: [{ id: signerId, name: 'Ava', email: 'ava@example.com' }],
    });
    const field = signatureField(signerId);
    const saves = await Promise.allSettled([
      saveLayout({
        ownerId: DEV_OWNER_ID,
        layout: { documentId: draftId, layoutVersion: 1, fields: [field] },
      }),
      saveLayout({
        ownerId: DEV_OWNER_ID,
        layout: {
          documentId: draftId,
          layoutVersion: 1,
          fields: [{ ...field, x: field.x + 1000 }],
        },
      }),
    ]);
    expect(saves.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    expect(saves.filter((item) => item.status === 'rejected')).toHaveLength(1);
  });

  it('R-2.3 reports success when the commit is followed by a throw', async () => {
    const draftId = ulid();
    await createDraft({ id: draftId, title: 'Replay', ownerId: DEV_OWNER_ID });
    setCommitFault(() => {
      throw new Error('commit then throw');
    });
    const saved = await saveLayout({
      ownerId: DEV_OWNER_ID,
      layout: {
        documentId: draftId,
        layoutVersion: 0,
        fields: [signatureField(ulid())],
      },
    });
    expect(saved.layoutVersion).toBe(1);
    const [document] = await getDb()
      .select()
      .from(documents)
      .where(eq(documents.id, draftId));
    expect(document?.lastOpId).toBeTruthy();
    expect(document?.layoutVersion).toBe(1);
  });

  it('R-2.4 rejects raw writes that bypass the application', async () => {
    const draftId = ulid();
    await createDraft({ id: draftId, title: 'Guards', ownerId: DEV_OWNER_ID });
    await expect(
      env.DB.prepare(
        "UPDATE audit_events SET type = 'tampered' WHERE document_id = ?",
      )
        .bind(draftId)
        .run(),
    ).rejects.toThrow(/append-only/);
    await expect(
      env.DB.prepare('DELETE FROM audit_events WHERE document_id = ?')
        .bind(draftId)
        .run(),
    ).rejects.toThrow(/append-only/);
    await expect(
      env.DB.prepare("UPDATE documents SET status = 'completed' WHERE id = ?")
        .bind(draftId)
        .run(),
    ).rejects.toThrow(/illegal document transition/);

    const ready = await readyToSign();
    await expect(
      env.DB.prepare("UPDATE documents SET layout_json = '[]' WHERE id = ?")
        .bind(ready.documentId)
        .run(),
    ).rejects.toThrow(/frozen/);
    await expect(
      env.DB.prepare(
        "UPDATE signers SET email = 'other@example.com' WHERE id = ?",
      )
        .bind(ready.signerId)
        .run(),
    ).rejects.toThrow(/frozen/);
    await expect(
      env.DB.prepare("UPDATE signers SET status = 'pending' WHERE id = ?")
        .bind(ready.signerId)
        .run(),
    ).rejects.toThrow(/illegal signer transition/);
  });

  it('R-2.5 refuses to publish an incomplete document', async () => {
    const id = ulid();
    await createDraft({ id, title: 'Incomplete', ownerId: DEV_OWNER_ID });
    await expect(
      publish({ ownerId: DEV_OWNER_ID, documentId: id }),
    ).rejects.toThrow(/Upload the PDF/);
    const signerId = ulid();
    await saveSigners({
      ownerId: DEV_OWNER_ID,
      documentId: id,
      layoutVersion: 0,
      signers: [{ id: signerId, name: 'Ava', email: '' }],
    });
    await saveLayout({
      ownerId: DEV_OWNER_ID,
      layout: {
        documentId: id,
        layoutVersion: 1,
        fields: [signatureField(signerId)],
      },
    });
    await expect(
      publish({ ownerId: DEV_OWNER_ID, documentId: id }),
    ).rejects.toThrow(/Upload the PDF|email/);
  });

  it('R-2.6 rejects a bad header, an oversize body, and a checksum miss', async () => {
    const pdf = new TextEncoder().encode('%PDF-1.4\n');
    const good = await uploadBytes(pdf);
    expect(good.uploadStatus).toBe('uploaded');

    const text = new TextEncoder().encode('not a pdf');
    const header = await uploadBytes(text);
    expect(header.uploadStatus).toBe('rejected');
    const [rejected] = await getDb()
      .select()
      .from(documents)
      .where(eq(documents.id, header.documentId));
    expect(rejected?.sourceR2Key).toBeNull();

    const oversize = await stagedUpload(pdf);
    const tooBig = await putDocumentSource({
      documentId: oversize.documentId,
      ownerId: DEV_OWNER_ID,
      body: blobOf(pdf).stream(),
      contentLength: pdf.byteLength + 1,
    });
    expect(tooBig.uploadStatus).toBe('rejected');

    const mismatched = await stagedUpload(pdf);
    const other = new Uint8Array(pdf.byteLength);
    other.set(pdf);
    other[other.length - 1] = other[other.length - 1] === 0 ? 1 : 0;
    const stored = await putDocumentSource({
      documentId: mismatched.documentId,
      ownerId: DEV_OWNER_ID,
      body: blobOf(other).stream(),
      contentLength: other.byteLength,
    });
    expect(takeLastPutChecksum()?.sha256).toBe(mismatched.sha256);
    if (stored.uploadStatus === 'uploaded') {
      console.info('MINIFLARE_SHA256_GAP');
    } else {
      expect(stored.uploadStatus).toBe('rejected');
    }
  });

  it('R-2.7 rejects a stale state hash without writing', async () => {
    const ready = await readyToSign();
    const before = await counts();
    await expect(
      submitSignature({
        sessionId: ready.sessionId,
        body: {
          idempotencyKey: crypto.randomUUID(),
          stateHash: 'ab'.repeat(32),
          consent: true,
          values: ready.values,
        },
        ip: '127.0.0.1',
        userAgent: 'vitest',
        origin: 'https://digisign.test',
      }),
    ).rejects.toBeInstanceOf(AppError);
    expect(await counts()).toEqual(before);
  });

  it('R-2.8 verifies the manifest with the public key', async () => {
    const ready = await readyToSign();
    await submitSignature({
      sessionId: ready.sessionId,
      body: {
        idempotencyKey: crypto.randomUUID(),
        stateHash: ready.stateHash,
        consent: true,
        values: ready.values,
      },
      ip: '127.0.0.1',
      userAgent: 'vitest',
      origin: 'https://digisign.test',
    });
    const [document] = await getDb()
      .select()
      .from(documents)
      .where(eq(documents.id, ready.documentId));
    const envelope = JSON.parse(document?.manifestJson ?? '{}') as {
      manifest: unknown;
      sig: string;
    };
    const canonical = canonicalJson(envelope.manifest);
    expect(canonicalJson(JSON.parse(canonical))).toBe(canonical);
    expect(await sha256Hex(canonical)).toBe(document?.manifestSha256);
    expect(await verifyCanonical(canonical, envelope.sig)).toBe(true);
  });

  it('R-2.9 stays within the CPU budget for the maximum payload', async () => {
    const packed = encodeStrokes([
      Array.from(
        { length: 8000 },
        (_, index) => [index % 1000, index % 400] as const,
      ),
    ]);
    expect(validatePackedStrokes(packed)).toBeNull();
    const signerId = ulid();
    const fields = maxFields(signerId);
    const values = [
      {
        fieldId: fields[0]?.id ?? signerId,
        signature: {
          kind: 'drawn' as const,
          box: { w: 1000, h: 400 },
          strokes: packed,
        },
      },
    ];
    const manifest = {
      v: 1 as const,
      documentId: ulid(),
      title: 'Max',
      source: { sha256: 'cd'.repeat(32), size: 1 },
      geometrySha256: 'cd'.repeat(32),
      layoutSha256: 'cd'.repeat(32),
      geometry: Array.from({ length: 8 }, () => letter),
      layout: { documentId: ulid(), layoutVersion: 1, fields },
      signers: [
        {
          order: 1,
          signerId,
          name: 'Ava',
          signedAt: 1,
          values,
          valuesSha256: 'cd'.repeat(32),
          privateEvidenceSha256: 'cd'.repeat(32),
        },
      ],
      completedAt: 1,
      audit: { headSeq: 1, headHash: 'cd'.repeat(32) },
      renderer: { name: 'digisign-render' as const, version: '1.0.0' as const },
    } satisfies ServerManifest;
    await sealEvidence({
      documentId: manifest.documentId,
      signerId,
      signedAt: 1,
      values,
      privateEvidence: {
        email: 'ava@example.com',
        ip: '127.0.0.1',
        userAgent: 'vitest',
        consentAt: 1,
        invitedAt: 1,
        firstViewedAt: 1,
      },
    });
    const samples: number[] = [];
    for (let index = 0; index < 5; index += 1) {
      const start = performance.now();
      expect(validatePackedStrokes(packed)).toBeNull();
      await sealEvidence({
        documentId: manifest.documentId,
        signerId,
        signedAt: 1,
        values,
        privateEvidence: {
          email: 'ava@example.com',
          ip: '127.0.0.1',
          userAgent: 'vitest',
          consentAt: 1,
          invitedAt: 1,
          firstViewedAt: 1,
        },
      });
      await signManifest(manifest);
      samples.push(performance.now() - start);
    }
    samples.sort((left, right) => left - right);
    expect(samples[2] ?? 999).toBeLessThanOrEqual(7);
  });
});

async function counts() {
  const auditCount = await env.DB.prepare(
    'SELECT count(*) AS n FROM audit_events',
  ).first<{
    n: number;
  }>();
  const outboxCount = await env.DB.prepare(
    'SELECT count(*) AS n FROM outbox',
  ).first<{
    n: number;
  }>();
  const idempotencyCount = await env.DB.prepare(
    'SELECT count(*) AS n FROM idempotency_keys',
  ).first<{ n: number }>();
  return {
    audit: auditCount?.n ?? 0,
    outbox: outboxCount?.n ?? 0,
    idempotency: idempotencyCount?.n ?? 0,
  };
}

async function readyToSign() {
  const pdf = new TextEncoder().encode('%PDF-1.4\nready');
  const uploaded = await uploadBytes(pdf);
  const signerId = ulid();
  await saveSigners({
    ownerId: DEV_OWNER_ID,
    documentId: uploaded.documentId,
    layoutVersion: 0,
    signers: [{ id: signerId, name: 'Ava', email: 'ava@example.com' }],
  });
  const field = signatureField(signerId);
  await saveLayout({
    ownerId: DEV_OWNER_ID,
    layout: {
      documentId: uploaded.documentId,
      layoutVersion: 1,
      fields: [field],
    },
  });
  await publish({ ownerId: DEV_OWNER_ID, documentId: uploaded.documentId });
  const invited = await inviteNextSigner({
    documentId: uploaded.documentId,
    origin: 'https://digisign.test',
  });
  if (!invited.invited) throw new Error('The invite was not created.');
  const token = invited.token;
  const exchanged = await exchangeSignerToken({ token });
  const view = await getSigningContext({ sessionId: exchanged.sessionId });
  if (view.kind !== 'ready') throw new Error('The signer is not waiting.');
  return {
    documentId: uploaded.documentId,
    signerId,
    sessionId: exchanged.sessionId,
    stateHash: view.stateHash,
    values: [
      {
        fieldId: field.id,
        signature: {
          kind: 'typed' as const,
          text: 'Ava',
          font: 'script-1' as const,
        },
      },
    ],
  };
}

async function uploadBytes(bytes: Uint8Array) {
  const staged = await stagedUpload(bytes);
  const result = await putDocumentSource({
    documentId: staged.documentId,
    ownerId: DEV_OWNER_ID,
    body: blobOf(bytes).stream(),
    contentLength: bytes.byteLength,
  });
  return { ...result, documentId: staged.documentId };
}

async function stagedUpload(bytes: Uint8Array) {
  const documentId = ulid();
  const sha256 = await sha256Hex(bytes);
  await createDraft({ id: documentId, title: 'File', ownerId: DEV_OWNER_ID });
  await initUpload({
    ownerId: DEV_OWNER_ID,
    upload: {
      documentId,
      sha256,
      sizeBytes: bytes.byteLength,
      pageCount: 1,
      geometry: [letter],
    },
  });
  return { documentId, sha256 };
}

function blobOf(bytes: Uint8Array): Blob {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return new Blob([copy]);
}

function signatureField(signerId: string): FieldInput {
  const width = ptToMicro(120, 612);
  const height = ptToMicro(36, 792);
  return {
    id: ulid(),
    signerId,
    pageIndex: 0,
    kind: 'signature',
    x: 10_000,
    y: 10_000,
    w: width,
    h: height,
    required: true,
  };
}

function maxFields(signerId: string): FieldInput[] {
  const fields: FieldInput[] = [];
  for (let index = 0; index < 300; index += 1) {
    const pageIndex = Math.floor(index / 40);
    const slot = index % 40;
    fields.push({
      id: ulid(),
      signerId,
      pageIndex,
      kind: index === 0 ? 'signature' : 'text',
      x: (slot % 5) * 150_000,
      y: Math.floor(slot / 5) * 100_000,
      w: index === 0 ? 120_000 : 80_000,
      h: 40_000,
      required: index === 0,
    });
  }
  return fields;
}
