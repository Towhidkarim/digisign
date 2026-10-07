import { sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';

import { getDb } from '#/db/index.ts';
import { assertOk } from '#/db/schema/index.ts';

export type GuardedResult = { ok: true } | { ok: false; reason: 'conflict' };

export type Statement = BatchItem<'sqlite'>;

const MAX_STATEMENTS = 20;

let commitFault: (() => void) | null = null;

/** Test hook for R-2.3. The fault runs after the batch has committed. */
export function setCommitFault(fault: (() => void) | null): void {
  commitFault = fault;
}

function isConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('CHECK constraint failed') && message.includes('ok');
}

export async function guardedBatch(input: {
  cas: Statement[];
  effects?: Statement[];
}): Promise<GuardedResult> {
  const db = getDb();
  const effects = input.effects ?? [];
  const statements: Statement[] = [];
  for (const statement of input.cas) {
    statements.push(statement);
    // changes() has to be its own statement. A query builder cannot see the previous row count.
    statements.push(
      db.run(sql`INSERT INTO _assert (ok) SELECT changes()`) as Statement,
    );
  }
  statements.push(...effects);
  statements.push(db.delete(assertOk));
  if (statements.length > MAX_STATEMENTS) {
    throw new Error('A guarded batch may contain at most 20 statements.');
  }
  try {
    await db.batch(statements as [Statement, ...Statement[]]);
  } catch (error) {
    if (isConflict(error)) return { ok: false, reason: 'conflict' };
    throw error;
  }
  const fault = commitFault;
  commitFault = null;
  if (fault) fault();
  return { ok: true };
}

export async function commitOrReplay(input: {
  opId: string;
  readLastOpId: () => Promise<string | null>;
  run: () => Promise<GuardedResult>;
}): Promise<GuardedResult> {
  try {
    const result = await input.run();
    if (result.ok) return result;
    const committed = await input.readLastOpId();
    if (committed === input.opId) return { ok: true };
    return result;
  } catch (error) {
    const committed = await input.readLastOpId().catch(() => null);
    if (committed === input.opId) return { ok: true };
    throw error;
  }
}
