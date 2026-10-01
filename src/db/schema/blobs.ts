import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const blobIntents = sqliteTable("blob_intents", {
	r2Key: text("r2_key").primaryKey(),
	documentId: text("document_id").notNull(),
	createdAt: integer("created_at", { mode: "number" }).notNull(),
});

/** Assertion row used inside a D1 batch. `ok` must be 1, so a missed CAS aborts. */
export const assertOk = sqliteTable(
	"_assert",
	{
		ok: integer({ mode: "number" }).notNull(),
	},
	(table) => [check("assert_ok_ck", sql`${table.ok} = 1`)],
);
