import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const runtimeProbes = sqliteTable("runtime_probes", {
	id: integer({ mode: "number" }).primaryKey({ autoIncrement: true }),
	kind: text().notNull(),
	payload: text().notNull(),
	createdAt: integer("created_at", { mode: "number" }).notNull(),
});
