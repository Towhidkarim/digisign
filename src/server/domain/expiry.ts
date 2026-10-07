import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

import { ulid } from '#/core/ulid.ts';
import { commitOrReplay, guardedBatch } from '#/db/guarded-batch.ts';
import { getDb } from '#/db/index.ts';
import {
  documents,
  signerSessions,
  signers,
  signerTokens,
} from '#/db/schema/index.ts';
import { insertAudit, planAudit } from '#/server/domain/audit.ts';
import { readLastOpId } from '#/server/domain/secrets.ts';
import { outboxInsert } from '#/server/engine/events.ts';

/**
 * Closes a document that outlived `expires_at`. Waiting signers are voided, their
 * links and sessions stop working, and every party gets an `expired` notice.
 * Returns false when something else changed the document first.
 */
export async function expireDocument(input: {
  documentId: string;
  origin: string;
  now?: number;
}): Promise<boolean> {
  const now = input.now ?? Date.now();
  const db = getDb();
  const [current] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, input.documentId))
    .limit(1);
  if (
    !current ||
    current.status !== 'in_progress' ||
    current.expiresAt == null ||
    current.expiresAt > now
  ) {
    return false;
  }
  const opId = ulid();
  const audit = await planAudit({
    documentId: current.id,
    type: 'document.expired',
    actorType: 'system',
    actorId: 'sweeper',
    occurredAt: now,
    payload: { documentId: current.id },
  });
  const waiting = db
    .select({ id: signers.id })
    .from(signers)
    .where(
      and(
        eq(signers.documentId, current.id),
        inArray(signers.status, ['pending', 'invited']),
      ),
    );
  const result = await commitOrReplay({
    opId,
    readLastOpId: () => readLastOpId(current.id),
    run: () =>
      guardedBatch({
        cas: [
          db
            .update(documents)
            .set({
              status: 'expired',
              version: sql`${documents.version} + 1`,
              lastOpId: opId,
              updatedAt: now,
            })
            .where(
              and(
                eq(documents.id, current.id),
                eq(documents.status, 'in_progress'),
                eq(documents.version, current.version),
              ),
            ),
        ],
        effects: [
          db
            .update(signerTokens)
            .set({ revokedAt: now })
            .where(
              and(
                inArray(signerTokens.signerId, waiting),
                isNull(signerTokens.revokedAt),
              ),
            ),
          db
            .delete(signerSessions)
            .where(inArray(signerSessions.signerId, waiting)),
          db
            .update(signers)
            .set({
              status: 'voided',
              version: sql`${signers.version} + 1`,
              lastOpId: opId,
            })
            .where(
              and(
                eq(signers.documentId, current.id),
                inArray(signers.status, ['pending', 'invited']),
              ),
            ),
          insertAudit(audit),
          outboxInsert({
            type: 'notify_parties',
            documentId: current.id,
            payload: { status: 'expired', origin: input.origin },
            now,
          }),
        ],
      }),
  });
  return result.ok;
}
