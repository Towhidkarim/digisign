import {
	integer,
	primaryKey,
	sqliteTable,
	text,
} from "drizzle-orm/sqlite-core";

export const idempotencyKeys = sqliteTable(
	"idempotency_keys",
	{
		actorKey: text("actor_key").notNull(),
		key: text().notNull(),
		requestSha256: text("request_sha256").notNull(),
		responseJson: text("response_json").notNull(),
		createdAt: integer("created_at", { mode: "number" }).notNull(),
	},
	(table) => [primaryKey({ columns: [table.actorKey, table.key] })],
);
