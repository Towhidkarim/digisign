// Sends a dead-lettered event again.
//
//   node scripts/replay-dead-letter.mjs <dead-letter-id> [--remote]
//
// The dead letter keeps the original queue envelope. Its eventId is the outbox row id,
// so replay resets that outbox row to `pending`. The cron sweeper republishes pending
// rows after 30 seconds, and every handler is idempotent, so a second run is safe.
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const remote = args.includes("--remote");
const id = args.find((arg) => !arg.startsWith("--"));

if (!id || !/^[0-9A-Za-z_-]+$/.test(id)) {
	console.error("Usage: node scripts/replay-dead-letter.mjs <dead-letter-id> [--remote]");
	process.exit(1);
}

function d1(sql) {
	const result = spawnSync(
		"pnpm",
		["wrangler", "d1", "execute", "digisign", remote ? "--remote" : "--local", "--json", "--command", sql],
		{ encoding: "utf8", shell: true },
	);
	if (result.status !== 0) {
		console.error(result.stdout, result.stderr);
		process.exit(result.status ?? 1);
	}
	const parsed = JSON.parse(result.stdout);
	return parsed[0]?.results ?? [];
}

const [row] = d1(`SELECT body_json, replayed_at FROM dead_letters WHERE id = '${id}'`);
if (!row) {
	console.error(`No dead letter with id ${id}.`);
	process.exit(1);
}

let envelope;
try {
	envelope = JSON.parse(row.body_json);
} catch {
	envelope = null;
}
if (!envelope || typeof envelope.eventId !== "string" || !/^[0-9A-Za-z:_-]+$/.test(envelope.eventId)) {
	console.error("This dead letter holds no valid event envelope. Fix the data by hand, then mark it replayed.");
	process.exit(1);
}

const now = Date.now();
d1(
	`UPDATE outbox SET status = 'pending', available_at = ${now}, published_at = NULL WHERE id = '${envelope.eventId}'`,
);
d1(`UPDATE dead_letters SET replayed_at = ${now} WHERE id = '${id}'`);
console.log(
	`Event ${envelope.eventId} (${envelope.type}) is pending again. The sweeper republishes it within about a minute.`,
);
