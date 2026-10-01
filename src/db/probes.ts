import { getDb } from "#/db/index.ts";
import { runtimeProbes } from "#/db/schema.ts";

export async function insertProbe(kind: string, payload: string) {
	const db = getDb();
	await db.insert(runtimeProbes).values({
		kind,
		payload,
		createdAt: Date.now(),
	});
}
