import { sql } from 'drizzle-orm';
import {
  check,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const signers = sqliteTable(
  'signers',
  {
    id: text().primaryKey(),
    documentId: text('document_id').notNull(),
    signingOrder: integer('signing_order', { mode: 'number' }).notNull(),
    email: text().notNull().default(''),
    name: text().notNull(),
    status: text().notNull().default('pending'),
    invitedAt: integer('invited_at', { mode: 'number' }),
    firstViewedAt: integer('first_viewed_at', { mode: 'number' }),
    signedAt: integer('signed_at', { mode: 'number' }),
    declineReason: text('decline_reason'),
    evidenceR2Key: text('evidence_r2_key'),
    evidenceSha256: text('evidence_sha256'),
    consentAt: integer('consent_at', { mode: 'number' }),
    clientIp: text('client_ip'),
    userAgent: text('user_agent'),
    version: integer({ mode: 'number' }).notNull().default(0),
    lastOpId: text('last_op_id'),
  },
  (table) => [
    uniqueIndex('signers_document_order_uq').on(
      table.documentId,
      table.signingOrder,
    ),
    check(
      'signers_status_ck',
      sql`${table.status} IN ('pending', 'invited', 'signed', 'declined', 'voided')`,
    ),
    check(
      'signers_order_ck',
      sql`${table.signingOrder} BETWEEN 1 AND ${sql.raw('10')}`,
    ),
    check('signers_version_ck', sql`${table.version} >= 0`),
  ],
);

export const signerTokens = sqliteTable('signer_tokens', {
  tokenHash: text('token_hash').primaryKey(),
  signerId: text('signer_id').notNull(),
  expiresAt: integer('expires_at', { mode: 'number' }).notNull(),
  revokedAt: integer('revoked_at', { mode: 'number' }),
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
});

export const signerSessions = sqliteTable('signer_sessions', {
  sessionHash: text('session_hash').primaryKey(),
  signerId: text('signer_id').notNull(),
  expiresAt: integer('expires_at', { mode: 'number' }).notNull(),
  idleExpiresAt: integer('idle_expires_at', { mode: 'number' }).notNull(),
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
});
