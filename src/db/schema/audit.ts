import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const auditEvents = sqliteTable(
	"audit_events",
	{
		documentId: text("document_id").notNull(),
		seq: integer({ mode: "number" }).notNull(),
		id: text().notNull(),
		type: text().notNull(),
		actorType: text("actor_type").notNull(),
		actorId: text("actor_id").notNull(),
		occurredAt: integer("occurred_at", { mode: "number" }).notNull(),
		payloadJson: text("payload_json").notNull(),
		prevHash: text("prev_hash").notNull(),
		hash: text().notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.documentId, table.seq] }),
	],
);
