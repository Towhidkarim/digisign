import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';

const PDF_PAGES = 200;
const PDF_SIZE_BYTES = 26_214_400;

export const documents = sqliteTable(
  'documents',
  {
    id: text().primaryKey(),
    ownerId: text('owner_id').notNull(),
    title: text().notNull(),
    status: text().notNull().default('draft'),
    uploadStatus: text('upload_status').notNull().default('pending'),
    sourceR2Key: text('source_r2_key'),
    sourceSha256: text('source_sha256'),
    sourceSize: integer('source_size', { mode: 'number' }),
    pageCount: integer('page_count', { mode: 'number' }).notNull().default(0),
    geometryJson: text('geometry_json'),
    geometrySha256: text('geometry_sha256'),
    layoutJson: text('layout_json'),
    layoutVersion: integer('layout_version', { mode: 'number' })
      .notNull()
      .default(0),
    layoutSha256: text('layout_sha256'),
    manifestJson: text('manifest_json'),
    manifestSha256: text('manifest_sha256'),
    manifestR2Key: text('manifest_r2_key'),
    anchoredAt: integer('anchored_at', { mode: 'number' }),
    expiresAt: integer('expires_at', { mode: 'number' }),
    version: integer({ mode: 'number' }).notNull().default(0),
    lastOpId: text('last_op_id'),
    createdAt: integer('created_at', { mode: 'number' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'number' }).notNull(),
    completedAt: integer('completed_at', { mode: 'number' }),
  },
  (table) => [
    index('documents_owner_id_idx').on(table.ownerId),
    check(
      'documents_status_ck',
      sql`${table.status} IN ('draft', 'in_progress', 'completed', 'declined', 'voided', 'expired')`,
    ),
    check(
      'documents_upload_status_ck',
      sql`${table.uploadStatus} IN ('pending', 'uploaded', 'rejected')`,
    ),
    check(
      'documents_page_count_ck',
      sql`${table.pageCount} BETWEEN 0 AND ${sql.raw(String(PDF_PAGES))}`,
    ),
    check('documents_layout_version_ck', sql`${table.layoutVersion} >= 0`),
    check('documents_version_ck', sql`${table.version} >= 0`),
    check(
      'documents_source_size_ck',
      sql`${table.sourceSize} IS NULL OR (${table.sourceSize} > 0 AND ${table.sourceSize} <= ${sql.raw(String(PDF_SIZE_BYTES))})`,
    ),
  ],
);
