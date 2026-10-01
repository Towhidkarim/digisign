import { sql } from "drizzle-orm";
import {
	check,
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const outbox = sqliteTable(
	"outbox",
	{
		id: text().primaryKey(),
		topic: text().notNull(),
		type: text().notNull(),
		documentId: text("document_id").notNull(),
		payloadJson: text("payload_json").notNull(),
		status: text().notNull().default("pending"),
		attempts: integer({ mode: "number" }).notNull().default(0),
		availableAt: integer("available_at", { mode: "number" }).notNull(),
		createdAt: integer("created_at", { mode: "number" }).notNull(),
		publishedAt: integer("published_at", { mode: "number" }),
	},
	(table) => [
		index("outbox_status_available_idx").on(table.status, table.availableAt),
		check("outbox_status_ck", sql`${table.status} IN ('pending', 'published')`),
	],
);

export const inbox = sqliteTable(
	"inbox",
	{
		consumer: text().notNull(),
		eventId: text("event_id").notNull(),
		processedAt: integer("processed_at", { mode: "number" }).notNull(),
	},
	(table) => [primaryKey({ columns: [table.consumer, table.eventId] })],
);

export const emailDeliveries = sqliteTable(
	"email_deliveries",
	{
		id: text().primaryKey(),
		eventId: text("event_id").notNull(),
		toAddr: text("to_addr").notNull(),
		template: text().notNull(),
		status: text().notNull(),
		claimedUntil: integer("claimed_until", { mode: "number" }),
		providerMessageId: text("provider_message_id"),
		attempts: integer({ mode: "number" }).notNull().default(0),
		updatedAt: integer("updated_at", { mode: "number" }).notNull(),
	},
	(table) => [
		uniqueIndex("email_deliveries_event_recipient_uq").on(
			table.eventId,
			table.toAddr,
		),
		check(
			"email_deliveries_status_ck",
			sql`${table.status} IN ('claimed', 'sent', 'failed')`,
		),
	],
);

export const deadLetters = sqliteTable("dead_letters", {
	id: text().primaryKey(),
	queue: text().notNull(),
	bodyJson: text("body_json").notNull(),
	attempts: integer({ mode: "number" }).notNull(),
	error: text().notNull(),
	createdAt: integer("created_at", { mode: "number" }).notNull(),
	replayedAt: integer("replayed_at", { mode: "number" }),
});
