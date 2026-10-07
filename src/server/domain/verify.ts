import { env } from 'cloudflare:workers';
import { asc, eq } from 'drizzle-orm';

import { canonicalJson } from '#/core/canonical-json.ts';
import { sha256Hex } from '#/core/hash.ts';
import { getDb } from '#/db/index.ts';
import { auditEvents, documents } from '#/db/schema/index.ts';
import { genesisHash } from '#/server/domain/audit.ts';
import type { ServerManifest } from '#/server/domain/evidence.ts';
import { createReadGrant } from '#/server/domain/grants.ts';
import { verifyCanonical } from '#/server/manifest-key.ts';

/** Audit rows for the public: hashes and times only. No emails, IPs, or user agents. */
export type PublicAuditEvent = {
  seq: number;
  type: string;
  actorType: string;
  occurredAt: number;
  prevHash: string;
  hash: string;
};

export type VerifyRecord =
  | { found: false }
  | {
      found: true;
      documentId: string;
      title: string;
      keyId: string;
      anchored: boolean;
      checks: {
        signature: boolean;
        manifestSha256: boolean;
        sourceSha256: boolean;
        auditChain: boolean;
        sourceStored: boolean;
      };
      manifest: ServerManifest;
      audit: PublicAuditEvent[];
      grant: string;
      grantExpiresAt: number;
    };

type Envelope = { keyId: string; sig: string; manifest: ServerManifest };

export async function verifyRecord(
  documentId: string,
  now: number,
): Promise<VerifyRecord> {
  const [document] = await getDb()
    .select()
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);
  if (!document || document.status !== 'completed' || !document.manifestJson) {
    return { found: false };
  }
  let envelope: Envelope;
  try {
    envelope = JSON.parse(document.manifestJson) as Envelope;
  } catch {
    return { found: false };
  }
  const manifest = envelope.manifest;
  const canonical = canonicalJson(manifest);
  const signature = await verifyCanonical(canonical, envelope.sig).catch(
    () => false,
  );
  const manifestSha256 =
    (await sha256Hex(canonical)) === document.manifestSha256;
  const sourceSha256 =
    manifest.documentId === document.id &&
    manifest.source.sha256 === document.sourceSha256;

  const rows = await getDb()
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.documentId, document.id))
    .orderBy(asc(auditEvents.seq));
  let previous = await genesisHash(document.id);
  let auditChain = rows.length > 0;
  for (const [index, row] of rows.entries()) {
    const expected = await sha256Hex(
      canonicalJson({
        documentId: row.documentId,
        seq: row.seq,
        type: row.type,
        actorType: row.actorType,
        actorId: row.actorId,
        occurredAt: row.occurredAt,
        payload: JSON.parse(row.payloadJson) as unknown,
        prevHash: row.prevHash,
      }),
    );
    if (
      row.seq !== index + 1 ||
      row.prevHash !== previous ||
      row.hash !== expected
    ) {
      auditChain = false;
      break;
    }
    previous = row.hash;
  }
  const head = rows.find((row) => row.seq === manifest.audit?.headSeq);
  if (!head || head.hash !== manifest.audit.headHash) auditChain = false;

  const stored = document.sourceR2Key
    ? await env.STORAGE.head(document.sourceR2Key)
    : null;
  const sourceStored = stored !== null && stored.size === manifest.source.size;
  const { grant, expiresAt } = await createReadGrant(document.id, now);
  return {
    found: true,
    documentId: document.id,
    title: document.title,
    keyId: envelope.keyId,
    anchored: document.anchoredAt != null,
    checks: {
      signature,
      manifestSha256,
      sourceSha256,
      auditChain,
      sourceStored,
    },
    manifest,
    audit: rows.map((row) => ({
      seq: row.seq,
      type: row.type,
      actorType: row.actorType,
      occurredAt: row.occurredAt,
      prevHash: row.prevHash,
      hash: row.hash,
    })),
    grant,
    grantExpiresAt: expiresAt,
  };
}
