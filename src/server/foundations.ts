import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const noteSchema = z.strictObject({
	note: z.string().trim().min(1).max(200),
});

const fileKey = "foundations/note.txt";

export const listProbes = createServerFn({ method: "GET" }).handler(
	async () => {
		const { desc } = await import("drizzle-orm");
		const { getDb } = await import("#/db/index.ts");
		const { runtimeProbes } = await import("#/db/schema.ts");
		const rows = await getDb()
			.select()
			.from(runtimeProbes)
			.orderBy(desc(runtimeProbes.id))
			.limit(20);
		return rows;
	},
);

export const writeDatabaseRow = createServerFn({ method: "POST" })
	.validator(noteSchema)
	.handler(async ({ data }) => {
		const { insertProbe } = await import("#/db/probes.ts");
		await insertProbe("database", data.note);
		return { ok: true as const };
	});

export const saveFile = createServerFn({ method: "POST" })
	.validator(noteSchema)
	.handler(async ({ data }) => {
		const { env } = await import("cloudflare:workers");
		await env.DOCS.put(fileKey, data.note);
		const stored = await env.DOCS.get(fileKey);
		if (!stored) {
			throw new Error(
				"The file was saved, but reading it back failed. Try again.",
			);
		}
		const text = await stored.text();
		return { text };
	});

export const sendQueueMessage = createServerFn({ method: "POST" })
	.validator(noteSchema)
	.handler(async ({ data }) => {
		const { env } = await import("cloudflare:workers");
		await env.Q_EVENTS.send({ note: data.note });
		return { ok: true as const };
	});
