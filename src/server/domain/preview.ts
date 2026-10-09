import { env } from 'cloudflare:workers';
import { and, asc, eq } from 'drizzle-orm';

import type {
  PageGeometryInput,
  SaveLayoutInput,
} from '#/core/contracts/index.ts';
import { sha256Hex } from '#/core/hash.ts';
import { getDb } from '#/db/index.ts';
import { documents, signers } from '#/db/schema/index.ts';
import type { ManifestSigner } from '#/features/sign/manifest.ts';
import {
  evidenceKey,
  manifestSigner,
  type StoredEvidence,
} from '#/server/domain/evidence.ts';
import { readGeometry, readLayout } from '#/server/domain/signing.ts';
import { AppError } from '#/server/errors.ts';

/**
 * What the owner's preview needs: the original's hash and layout, and the signatures recorded
 * so far. Each signature is read from its sealed evidence and checked against the hash stored
 * when it was made. Private evidence (email, IP, user agent) is never included.
 */
export type DocumentPreview = {
  documentId: string;
  title: string;
  status: string;
  sourceSha256: string;
  sourceSize: number;
  geometry: PageGeometryInput[];
  layout: SaveLayoutInput;
  signers: ManifestSigner[];
  signedCount: number;
  total: number;
};

export async function readDocumentPreview(input: {
  ownerId: string;
  documentId: string;
}): Promise<DocumentPreview> {
  const [document] = await getDb()
    .select({
      id: documents.id,
      title: documents.title,
      status: documents.status,
      uploadStatus: documents.uploadStatus,
      sourceSha256: documents.sourceSha256,
      sourceSize: documents.sourceSize,
      geometryJson: documents.geometryJson,
      layoutJson: documents.layoutJson,
      layoutVersion: documents.layoutVersion,
    })
    .from(documents)
    .where(
      and(
        eq(documents.id, input.documentId),
        eq(documents.ownerId, input.ownerId),
      ),
    )
    .limit(1);
  if (!document) throw new AppError(404, 'This document was not found.');
  if (document.status !== 'in_progress' && document.status !== 'completed') {
    throw new AppError(
      409,
      'A preview is available once the document is sent.',
    );
  }
  if (
    document.uploadStatus !== 'uploaded' ||
    !document.sourceSha256 ||
    document.sourceSize == null
  ) {
    throw new AppError(409, 'The original PDF is not available.');
  }

  const people = await getDb()
    .select({
      id: signers.id,
      name: signers.name,
      order: signers.signingOrder,
      status: signers.status,
      evidenceSha256: signers.evidenceSha256,
    })
    .from(signers)
    .where(eq(signers.documentId, input.documentId))
    .orderBy(asc(signers.signingOrder));

  const signed = people.filter(
    (person) => person.status === 'signed' && person.evidenceSha256,
  );
  const sealed: ManifestSigner[] = [];
  for (const person of signed) {
    const hash = person.evidenceSha256 ?? '';
    const object = await env.STORAGE.get(
      evidenceKey(input.documentId, person.id, hash),
    );
    if (!object) {
      throw new AppError(
        409,
        'A signature could not be found for this preview.',
      );
    }
    const text = await object.text();
    if ((await sha256Hex(text)) !== hash) {
      throw new AppError(409, 'A signature does not match its record.');
    }
    const evidence = JSON.parse(text) as StoredEvidence;
    sealed.push(
      manifestSigner({
        order: person.order,
        signerId: person.id,
        name: person.name,
        signedAt: evidence.signedAt,
        values: evidence.values,
        valuesSha256: evidence.valuesSha256,
        privateEvidenceSha256: evidence.privateEvidenceSha256,
      }),
    );
  }

  return {
    documentId: document.id,
    title: document.title,
    status: document.status,
    sourceSha256: document.sourceSha256,
    sourceSize: document.sourceSize,
    geometry: readGeometry(document.geometryJson),
    layout: readLayout(
      document.id,
      document.layoutJson,
      document.layoutVersion,
    ),
    signers: sealed,
    signedCount: sealed.length,
    total: people.length,
  };
}
