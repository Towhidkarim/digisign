import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { user } from '#/db/schema/auth.ts';

/** The one signature a signed-in user keeps for reuse. Anyone else keeps theirs in the browser. */
export const savedSignatures = sqliteTable('saved_signatures', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  /** A validated `SignatureInput`, drawn, typed or image. */
  signatureJson: text('signature_json').notNull(),
  updatedAt: integer('updated_at', { mode: 'number' }).notNull(),
});
