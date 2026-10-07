import { env } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  decideOutcome,
  parseFooter,
  recordIsGenuine,
} from '#/features/verify/outcome.ts';
import {
  checkReadGrant,
  createReadGrant,
  GRANT_TTL_MS,
} from '#/server/domain/grants.ts';
import { readDocumentSource } from '#/server/domain/source.ts';
import { verifyRecord } from '#/server/domain/verify.ts';
import { publishOutbox } from '#/server/engine/outbox.ts';
import { setMailer } from '#/server/mail/index.ts';
import { createMemoryMailer } from '#/server/mail/memory.ts';
import { exportManifestPublicJwk } from '#/server/manifest-key.ts';
import {
  buildPublished,
  captureQueue,
  migrate,
  pump,
  signWithToken,
  tokenFor,
} from '#/server/test-support.ts';

let mail: ReturnType<typeof createMemoryMailer>;

beforeAll(migrate);

beforeEach(() => {
  mail = createMemoryMailer();
  setMailer(mail);
});

async function completed() {
  const sent = captureQueue();
  const built = await buildPublished(1);
  const signer = built.signers[0];
  if (!signer) throw new Error('No signer.');
  await publishOutbox({ documentId: built.documentId });
  await pump(sent);
  await signWithToken(built, 0, tokenFor(mail.messages, signer.email));
  await publishOutbox({ documentId: built.documentId });
  await pump(sent);
  return built;
}

describe('phase 3 verification', () => {
  it('R-3.7 a completed document verifies with every check passing', async () => {
    const built = await completed();
    const record = await verifyRecord(built.documentId, Date.now());
    expect(recordIsGenuine(record)).toBe(true);
    if (!record.found) throw new Error('Record missing.');
    expect(record.checks).toEqual({
      signature: true,
      manifestSha256: true,
      sourceSha256: true,
      auditChain: true,
      sourceStored: true,
    });
    expect(record.audit.length).toBeGreaterThan(2);
    expect(record.anchored).toBe(true);
  });

  it('R-3.7a the public record carries no emails, IPs, or user agents', async () => {
    const built = await completed();
    const record = await verifyRecord(built.documentId, Date.now());
    const body = JSON.stringify(record);
    for (const signer of built.signers)
      expect(body).not.toContain(signer.email);
    expect(body).not.toMatch(/"(ip|email|userAgent|payloadJson|actorId)"/);
  });

  it('R-3.7 a document that is not complete has no public record', async () => {
    const built = await buildPublished(1);
    expect(await verifyRecord(built.documentId, Date.now())).toEqual({
      found: false,
    });
    expect(await verifyRecord('01NOSUCHDOCUMENT00000000', Date.now())).toEqual({
      found: false,
    });
  });

  it('R-3.7 a changed signature is reported invalid', async () => {
    const built = await completed();
    await env.DB.prepare(
      'UPDATE documents SET manifest_json = replace(manifest_json, \'"completedAt":\', \'"completedAt":1\') WHERE id = ?',
    )
      .bind(built.documentId)
      .run();
    const record = await verifyRecord(built.documentId, Date.now());
    expect(recordIsGenuine(record)).toBe(false);
    if (!record.found) throw new Error('Record missing.');
    expect(record.checks.signature).toBe(false);
  });

  it('R-3.7 a rewritten audit row breaks the chain', async () => {
    const built = await completed();
    await env.DB.exec('DROP TRIGGER IF EXISTS audit_events_no_update');
    await env.DB.prepare(
      "UPDATE audit_events SET type = 'forged' WHERE document_id = ? AND seq = 2",
    )
      .bind(built.documentId)
      .run();
    const record = await verifyRecord(built.documentId, Date.now());
    expect(recordIsGenuine(record)).toBe(false);
    if (!record.found) throw new Error('Record missing.');
    expect(record.checks.auditChain).toBe(false);
  });

  it('the public key is exported without private material', async () => {
    const jwk = await exportManifestPublicJwk();
    expect(jwk.kty).toBe('OKP');
    expect(jwk.crv).toBe('Ed25519');
    expect(jwk.kid).toBeTruthy();
    expect(jwk.d).toBeUndefined();
  });

  it('a read grant opens the original of a completed document for ten minutes only', async () => {
    const built = await completed();
    const now = Date.now();
    const { grant } = await createReadGrant(built.documentId, now);
    expect(await checkReadGrant(built.documentId, grant, now)).toBe(true);
    expect(
      await checkReadGrant(built.documentId, grant, now + GRANT_TTL_MS + 1),
    ).toBe(false);
    expect(await checkReadGrant('other-document-id', grant, now)).toBe(false);
    expect(await checkReadGrant(built.documentId, `${grant}x`, now)).toBe(
      false,
    );

    const read = (value: string | null) =>
      readDocumentSource({
        documentId: built.documentId,
        ownerId: null,
        sessionHash: null,
        rangeHeader: null,
        grant: value,
      });
    const ok = await read(grant);
    expect(ok.status).toBe(200);
    expect((await ok.arrayBuffer()).byteLength).toBeGreaterThan(0);
    expect((await read(null)).status).toBe(404);
    expect((await read('1.forged')).status).toBe(404);
  });

  it('a grant does not open a document that is still being signed', async () => {
    const built = await buildPublished(1);
    const { grant } = await createReadGrant(built.documentId, Date.now());
    const response = await readDocumentSource({
      documentId: built.documentId,
      ownerId: null,
      sessionHash: null,
      rangeHeader: null,
      grant,
    });
    expect(response.status).toBe(404);
  });
});

describe('verify outcomes', () => {
  const genuine = {
    found: true,
    checks: {
      signature: true,
      manifestSha256: true,
      sourceSha256: true,
      auditChain: true,
      sourceStored: true,
    },
  } as unknown as Parameters<typeof decideOutcome>[0] & object;

  it('R-3.7 names the verification outcomes', () => {
    expect(decideOutcome(genuine, { kind: 'compared', matches: true })).toBe(
      'valid',
    );
    expect(decideOutcome(genuine, { kind: 'compared', matches: false })).toBe(
      'modified',
    );
    expect(decideOutcome(genuine, { kind: 'no-manifest' })).toBe(
      'not-comparable',
    );
    expect(decideOutcome(genuine, { kind: 'none' })).toBe('record-only');
    expect(decideOutcome({ found: false }, { kind: 'none' })).toBe('not-found');
    const broken = {
      ...genuine,
      checks: { ...(genuine as { checks: object }).checks, signature: false },
    };
    expect(
      decideOutcome(broken as unknown as typeof genuine, { kind: 'none' }),
    ).toBe('failed-checks');
  });

  it('reads the id and origin from the footer text', () => {
    expect(
      parseFooter(
        'DigiSign · 01HZZZZZZZZZZZZZZZZZZZZZZZ · abcdef012345 · https://sign.example.com/v/01HZZZZZZZZZZZZZZZZZZZZZZZ',
      ),
    ).toEqual({
      documentId: '01HZZZZZZZZZZZZZZZZZZZZZZZ',
      origin: 'https://sign.example.com',
    });
    expect(parseFooter('just a page')).toBeNull();
  });
});
