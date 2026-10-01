import { getPlatformProxy } from "wrangler";

const { env, dispose } = await getPlatformProxy({
	configPath: "wrangler.jsonc",
	persist: { path: ".wrangler/state" },
});

const db = env.DB;
await db.exec("DROP TABLE IF EXISTS _assert");
await db.exec("DROP TABLE IF EXISTS spike_row");
await db.exec(
	"CREATE TABLE spike_row (id INTEGER PRIMARY KEY, version INTEGER NOT NULL)",
);
await db.exec(
	"CREATE TABLE _assert (ok INTEGER NOT NULL CHECK (ok = 1))",
);
await db.exec("INSERT INTO spike_row (id, version) VALUES (1, 1)");

async function run(label, statements) {
	try {
		const result = await db.batch(statements);
		const changes = result.map((item) => item.meta?.changes ?? null);
		console.log(label, "COMMITTED", JSON.stringify(changes));
	} catch (error) {
		console.log(label, "ABORTED", error instanceof Error ? error.message : error);
	}
	const row = await db.prepare("SELECT version FROM spike_row WHERE id = 1").first();
	console.log(label, "row", JSON.stringify(row));
}

await run("miss", [
	db.prepare("UPDATE spike_row SET version = 2 WHERE id = 1 AND version = 9"),
	db.prepare("INSERT INTO _assert (ok) SELECT changes()"),
	db.prepare("DELETE FROM _assert"),
]);

await run("hit", [
	db.prepare("UPDATE spike_row SET version = version + 1 WHERE id = 1 AND version = 1"),
	db.prepare("INSERT INTO _assert (ok) SELECT changes()"),
	db.prepare("DELETE FROM _assert"),
]);

await db.exec("DROP TABLE IF EXISTS _assert");
await db.exec("DROP TABLE IF EXISTS spike_row");
await dispose();
