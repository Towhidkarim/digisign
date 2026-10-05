import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { canonicalJson } from "#/core/canonical-json.ts";
import { ulid } from "#/core/ulid.ts";
import { getDb } from "#/db/index.ts";
import { deadLetters, documents, outbox, signers } from "#/db/schema/index.ts";
import {
	declineSignature,
	exchangeSignerToken,
} from "#/server/domain/signing.ts";
import {
	handleDeadLetterBatch,
	handleEventBatch,
} from "#/server/engine/consumer.ts";
import { PermanentEventError } from "#/server/engine/errors.ts";
import { outboxInsert, type QueueEnvelope } from "#/server/engine/events.ts";
import { manifestAnchorKey, processEvent } from "#/server/engine/handlers.ts";
import { publishOutbox, setQueueSender } from "#/server/engine/outbox.ts";
import { runSweeper } from "#/server/engine/sweeper.ts";
import { setMailer } from "#/server/mail/index.ts";
import { MailError, type Mailer } from "#/server/mail/mailer.ts";
import { createMemoryMailer } from "#/server/mail/memory.ts";
import {
	classifyResendStatus,
	createResendMailer,
} from "#/server/mail/resend.ts";
import { verifyCanonical } from "#/server/manifest-key.ts";
import {
	buildPublished,
	captureQueue,
	migrate,
	ORIGIN,
	pump,
	signWithToken,
	tokenFor,
} from "#/server/test-support.ts";

const MINUTE = 60_000;

let sent: QueueEnvelope[];
let mail: ReturnType<typeof createMemoryMailer>;

beforeAll(migrate);

beforeEach(() => {
	mail = createMemoryMailer();
	setMailer(mail);
	sent = captureQueue();
});

async function scalar(query: string, ...binds: unknown[]): Promise<number> {
	const row = await env.DB.prepare(query)
		.bind(...binds)
		.first<{ n: number }>();
	return row?.n ?? 0;
}

async function activeTokens(signerId: string): Promise<number> {
	return scalar(
		"SELECT count(*) AS n FROM signer_tokens WHERE signer_id = ? AND revoked_at IS NULL",
		signerId,
	);
}

async function deliveries(status: string, documentId: string): Promise<number> {
	return scalar(
		`SELECT count(*) AS n FROM email_deliveries d JOIN outbox o ON o.id = d.event_id
		 WHERE d.status = ? AND o.document_id = ?`,
		status,
		documentId,
	);
}

async function publishDoc(documentId: string, now?: number): Promise<void> {
	await publishOutbox({ documentId, now });
}

/** Runs the first invite: publish -> dispatch_next -> send_email. */
async function inviteFirst(documentId: string): Promise<void> {
	await publishDoc(documentId);
	await pump(sent);
}

describe("phase 3 engine", () => {
	it("R-3.5 an idle sweeper reads once and sends nothing", async () => {
		const report = await runSweeper(Date.now());
		expect(report.idle).toBe(true);
		expect(sent).toHaveLength(0);
	});

	it("R-3.1 a repeated dispatch_next leaves one token and one mail", async () => {
		const built = await buildPublished(1);
		const signerId = built.signers[0]?.id ?? "";
		await publishDoc(built.documentId);
		const [dispatch] = sent.splice(0);
		if (!dispatch) throw new Error("No dispatch_next was published.");
		await processEvent(dispatch);
		await processEvent(dispatch);
		expect(await activeTokens(signerId)).toBe(1);
		await publishDoc(built.documentId);
		const emails = sent
			.splice(0)
			.filter((event) => event.type === "send_email");
		expect(emails).toHaveLength(1);
		const email = emails[0];
		if (!email) throw new Error("No send_email was published.");
		await processEvent(email);
		await processEvent(email);
		expect(mail.messages).toHaveLength(1);
		expect(await deliveries("sent", built.documentId)).toBe(1);
	});

	it("R-3.1 concurrent deliveries of the same event still converge", async () => {
		const built = await buildPublished(1);
		const signerId = built.signers[0]?.id ?? "";
		await publishDoc(built.documentId);
		const [dispatch] = sent.splice(0);
		if (!dispatch) throw new Error("No dispatch_next was published.");
		await Promise.all([processEvent(dispatch), processEvent(dispatch)]);
		expect(await activeTokens(signerId)).toBe(1);
		const rows = await getDb()
			.select()
			.from(outbox)
			.where(eq(outbox.documentId, built.documentId));
		expect(rows.filter((row) => row.type === "send_email")).toHaveLength(1);
		await publishDoc(built.documentId);
		const email = sent.splice(0).find((event) => event.type === "send_email");
		if (!email) throw new Error("No send_email was published.");
		const outcomes = await Promise.all([
			processEvent(email),
			processEvent(email),
		]);
		expect(outcomes).toContain("done");
		expect(mail.messages).toHaveLength(1);
		expect(await deliveries("sent", built.documentId)).toBe(1);
	});

	it("R-3.2 a dispatch_next that arrives before the previous signer signed does nothing", async () => {
		const built = await buildPublished(2);
		await inviteFirst(built.documentId);
		const early = ulid();
		await outboxInsert({
			id: early,
			type: "dispatch_next",
			documentId: built.documentId,
			payload: { documentId: built.documentId, origin: ORIGIN },
			now: Date.now(),
		});
		const outcome = await processEvent({
			v: 1,
			eventId: early,
			type: "dispatch_next",
			documentId: built.documentId,
			occurredAt: Date.now(),
		});
		expect(outcome).toBe("done");
		const second = built.signers[1];
		expect(await activeTokens(second?.id ?? "")).toBe(0);
		const [row] = await getDb()
			.select()
			.from(signers)
			.where(eq(signers.id, second?.id ?? ""));
		expect(row?.status).toBe("pending");
	});

	it("R-3.3 a transient mail failure releases the claim and the retry sends once", async () => {
		const built = await buildPublished(1);
		let calls = 0;
		const flaky: Mailer = {
			async send(message, options) {
				calls += 1;
				if (calls === 1)
					throw new MailError("transient", "provider unavailable");
				return mail.send(message, options);
			},
		};
		setMailer(flaky);
		await publishDoc(built.documentId);
		await pump(sent.splice(0, 1));
		await publishDoc(built.documentId);
		const email = sent.splice(0).find((event) => event.type === "send_email");
		if (!email) throw new Error("No send_email was published.");
		await expect(processEvent(email)).rejects.toBeInstanceOf(MailError);
		expect(mail.messages).toHaveLength(0);
		expect(await processEvent(email)).toBe("done");
		expect(mail.messages).toHaveLength(1);
		expect(await deliveries("sent", built.documentId)).toBe(1);
	});

	it("R-3.3 a claim left by a crashed attempt expires and the mail still goes out", async () => {
		const built = await buildPublished(1);
		await publishDoc(built.documentId);
		await pump(sent.splice(0, 1));
		await publishDoc(built.documentId);
		const email = sent.splice(0).find((event) => event.type === "send_email");
		if (!email) throw new Error("No send_email was published.");
		await env.DB.prepare(
			`INSERT INTO email_deliveries (id, event_id, to_addr, template, status, claimed_until, attempts, updated_at)
			 VALUES (?, ?, ?, 'invite', 'claimed', ?, 1, ?)`,
		)
			.bind(ulid(), email.eventId, built.signers[0]?.email, 1, 1)
			.run();
		expect(await processEvent(email)).toBe("done");
		expect(mail.messages).toHaveLength(1);
		expect(await deliveries("sent", built.documentId)).toBe(1);
	});

	it("R-3.3 a crash after the invite commit is repaired by the sweeper", async () => {
		const built = await buildPublished(1);
		await publishDoc(built.documentId);
		const [dispatch] = sent.splice(0);
		if (!dispatch) throw new Error("No dispatch_next was published.");
		setQueueSender(async () => {
			throw new Error("queue unavailable");
		});
		await expect(processEvent(dispatch)).rejects.toThrow("queue unavailable");
		sent = captureQueue();
		expect(await processEvent(dispatch)).toBe("done");
		expect(sent).toHaveLength(0);
		const report = await runSweeper(Date.now() + 31_000);
		expect(report.republished).toBeGreaterThanOrEqual(1);
		await pump(sent);
		expect(mail.messages).toHaveLength(1);
	});

	it("R-3.4 a lost dispatch_next is recovered by the sweeper", async () => {
		const built = await buildPublished(2);
		await inviteFirst(built.documentId);
		const first = built.signers[0];
		if (!first) throw new Error("No first signer.");
		await signWithToken(built, 0, tokenFor(mail.messages, first.email));
		// The commit wrote a dispatch_next row. Pretend its queue message vanished.
		await env.DB.prepare(
			"UPDATE outbox SET status = 'published' WHERE document_id = ?",
		)
			.bind(built.documentId)
			.run();
		const later = Date.now() + 11 * MINUTE;
		const report = await runSweeper(later);
		expect(report.redispatched).toBeGreaterThanOrEqual(1);
		await pump(sent, later);
		const second = built.signers[1];
		expect(await activeTokens(second?.id ?? "")).toBe(1);
		expect(tokenFor(mail.messages, second?.email ?? "")).toBeTruthy();
	});

	it("R-3.4a nothing reaches manifests/ until the document is complete, and a lost anchor is recovered", async () => {
		const built = await buildPublished(1);
		const signer = built.signers[0];
		if (!signer) throw new Error("No signer.");
		await inviteFirst(built.documentId);
		const prefix = `manifests/${built.documentId}/`;
		await expect(
			exchangeSignerToken({ token: "x".repeat(43) }),
		).rejects.toThrow();
		expect((await env.STORAGE.list({ prefix })).objects).toHaveLength(0);
		await signWithToken(built, 0, tokenFor(mail.messages, signer.email));
		expect((await env.STORAGE.list({ prefix })).objects).toHaveLength(0);
		// Drop the anchor_manifest message on the floor.
		await env.DB.prepare(
			"UPDATE outbox SET status = 'published' WHERE document_id = ? AND type = 'anchor_manifest'",
		)
			.bind(built.documentId)
			.run();
		await publishDoc(built.documentId);
		await pump(sent);
		const later = Date.now() + 11 * MINUTE;
		const report = await runSweeper(later);
		expect(report.reanchored).toBeGreaterThanOrEqual(1);
		await pump(sent, later);
		const [document] = await getDb()
			.select()
			.from(documents)
			.where(eq(documents.id, built.documentId));
		expect(document?.anchoredAt).not.toBeNull();
		const key = manifestAnchorKey(
			built.documentId,
			document?.manifestSha256 ?? "",
		);
		expect(document?.manifestR2Key).toBe(key);
		const stored = await env.STORAGE.get(key);
		expect(await stored?.text()).toBe(document?.manifestJson);
		const checkpoints = await env.STORAGE.list({
			prefix: `anchors/${built.documentId}/`,
		});
		expect(checkpoints.objects).toHaveLength(1);
		const object = await env.STORAGE.get(checkpoints.objects[0]?.key ?? "");
		const envelope = JSON.parse((await object?.text()) ?? "{}") as {
			checkpoint: unknown;
			sig: string;
		};
		expect(
			await verifyCanonical(canonicalJson(envelope.checkpoint), envelope.sig),
		).toBe(true);
	});

	it("R-3.3 an anchor whose manifest copy already exists still finishes", async () => {
		const built = await buildPublished(1);
		const signer = built.signers[0];
		if (!signer) throw new Error("No signer.");
		await inviteFirst(built.documentId);
		await signWithToken(built, 0, tokenFor(mail.messages, signer.email));
		const [document] = await getDb()
			.select()
			.from(documents)
			.where(eq(documents.id, built.documentId));
		const key = manifestAnchorKey(
			built.documentId,
			document?.manifestSha256 ?? "",
		);
		await env.STORAGE.put(key, document?.manifestJson ?? "");
		await publishDoc(built.documentId);
		await pump(sent);
		const [after] = await getDb()
			.select()
			.from(documents)
			.where(eq(documents.id, built.documentId));
		expect(after?.anchoredAt).not.toBeNull();
	});

	it("R-3.6 Resend errors are classified and the handler needs no change", async () => {
		expect(classifyResendStatus(429)).toBe("transient");
		expect(classifyResendStatus(503)).toBe("transient");
		expect(classifyResendStatus(422)).toBe("permanent");
		expect(classifyResendStatus(401)).toBe("permanent");
		const seen: { headers: Record<string, string>; body: string }[] = [];
		const ok = createResendMailer({
			apiKey: "re_test",
			from: "DigiSign <sign@example.com>",
			fetcher: async (_url, init) => {
				seen.push({
					headers: init?.headers as Record<string, string>,
					body: String(init?.body),
				});
				return Response.json({ id: "msg_1" });
			},
		});
		const receipt = await ok.send(
			{ to: "a@example.com", subject: "s", text: "t", html: "<p>t</p>" },
			{ idempotencyKey: "evt-1" },
		);
		expect(receipt.providerMessageId).toBe("msg_1");
		expect(seen[0]?.headers["idempotency-key"]).toBe("evt-1");
		expect(seen[0]?.headers.authorization).toBe("Bearer re_test");
		const rejecting = createResendMailer({
			apiKey: "re_test",
			from: "x@example.com",
			fetcher: async () => new Response("bad", { status: 422 }),
		});
		await expect(
			rejecting.send({
				to: "a@example.com",
				subject: "s",
				text: "t",
				html: "t",
			}),
		).rejects.toMatchObject({ kind: "permanent" });
		const offline = createResendMailer({
			apiKey: "re_test",
			from: "x@example.com",
			fetcher: async () => {
				throw new Error("network down");
			},
		});
		await expect(
			offline.send({ to: "a@example.com", subject: "s", text: "t", html: "t" }),
		).rejects.toMatchObject({ kind: "transient" });
		// The same handler runs against the adapter that was configured.
		const built = await buildPublished(1);
		setMailer(ok);
		await publishDoc(built.documentId);
		await pump(sent);
		expect(seen.length).toBeGreaterThanOrEqual(2);
		expect(await deliveries("sent", built.documentId)).toBe(1);
	});

	it("R-3.6 a permanent mail failure is dead-lettered and a transient one is retried", async () => {
		const built = await buildPublished(1);
		await publishDoc(built.documentId);
		await pump(sent.splice(0, 1));
		await publishDoc(built.documentId);
		const email = sent.splice(0).find((event) => event.type === "send_email");
		if (!email) throw new Error("No send_email was published.");
		setMailer({
			async send() {
				throw new MailError("permanent", "mailbox does not exist");
			},
		});
		const permanent = fakeBatch([email]);
		await handleEventBatch(permanent.batch);
		expect(permanent.acks).toEqual([0]);
		expect(permanent.retries).toEqual([]);
		expect(await deliveries("failed", built.documentId)).toBe(1);
		const rows = await getDb().select().from(deadLetters);
		expect(
			rows.some((row) => row.error.includes("mailbox does not exist")),
		).toBe(true);

		const again = await buildPublished(1);
		await publishDoc(again.documentId);
		await pump(sent.splice(0, 1));
		await publishDoc(again.documentId);
		const second = sent.splice(0).find((event) => event.type === "send_email");
		if (!second) throw new Error("No send_email was published.");
		setMailer({
			async send() {
				throw new MailError("transient", "rate limited");
			},
		});
		const transient = fakeBatch([second]);
		await handleEventBatch(transient.batch);
		expect(transient.retries).toEqual([0]);
		expect(transient.acks).toEqual([]);
	});

	it("R-3.3 a malformed message and an exhausted message are kept for replay", async () => {
		const before = (await getDb().select().from(deadLetters)).length;
		const junk = fakeBatch([{ nonsense: true }]);
		await handleEventBatch(junk.batch);
		expect(junk.acks).toEqual([0]);
		const exhausted = fakeBatch(
			[
				{
					v: 1,
					eventId: "evt",
					type: "send_email",
					documentId: "doc",
					occurredAt: 1,
				},
			],
			"ds-dlq",
		);
		await handleDeadLetterBatch(exhausted.batch);
		expect(exhausted.acks).toEqual([0]);
		expect((await getDb().select().from(deadLetters)).length).toBe(before + 2);
		expect(new PermanentEventError("x").name).toBe("PermanentEventError");
	});

	it("notices go to every signer who was invited, but not to the one who declined", async () => {
		const built = await buildPublished(3);
		await inviteFirst(built.documentId);
		const [one, two] = built.signers;
		if (!one || !two) throw new Error("Missing signers.");
		await signWithToken(built, 0, tokenFor(mail.messages, one.email));
		await publishDoc(built.documentId);
		await pump(sent);
		const exchanged = await exchangeSignerToken({
			token: tokenFor(mail.messages, two.email),
		});
		await declineSignature({
			sessionId: exchanged.sessionId,
			reason: "Wrong terms",
			origin: ORIGIN,
		});
		await publishDoc(built.documentId);
		await pump(sent);
		const declined = mail.messages.filter((message) =>
			message.subject.includes("declined"),
		);
		expect(declined.map((message) => message.to)).toEqual([one.email]);
		expect(declined[0]?.text).toContain("Signer 2 declined");
	});

	it("an expired document voids waiting signers, kills their links, and tells them", async () => {
		const built = await buildPublished(1);
		const signer = built.signers[0];
		if (!signer) throw new Error("No signer.");
		await inviteFirst(built.documentId);
		await env.DB.prepare("UPDATE documents SET expires_at = 1 WHERE id = ?")
			.bind(built.documentId)
			.run();
		const report = await runSweeper(Date.now());
		expect(report.expired).toBeGreaterThanOrEqual(1);
		await pump(sent);
		const [document] = await getDb()
			.select()
			.from(documents)
			.where(eq(documents.id, built.documentId));
		expect(document?.status).toBe("expired");
		expect(await activeTokens(signer.id)).toBe(0);
		expect(
			mail.messages.some((message) => message.subject.includes("expired")),
		).toBe(true);
	});

	it("a signer gets one reminder with a fresh link, and never a second", async () => {
		const built = await buildPublished(1);
		const signer = built.signers[0];
		if (!signer) throw new Error("No signer.");
		await inviteFirst(built.documentId);
		const oldToken = tokenFor(mail.messages, signer.email);
		await env.DB.prepare("UPDATE signers SET invited_at = 1 WHERE id = ?")
			.bind(signer.id)
			.run();
		const first = await runSweeper(Date.now());
		expect(first.reminded).toBeGreaterThanOrEqual(1);
		await pump(sent);
		const reminder = mail.messages.find((message) =>
			message.subject.startsWith("Reminder"),
		);
		expect(reminder).toBeDefined();
		expect(tokenFor(mail.messages, signer.email)).not.toBe(oldToken);
		await expect(exchangeSignerToken({ token: oldToken })).rejects.toThrow();
		const second = await runSweeper(Date.now());
		expect(second.reminded).toBe(0);
	});

	it("the sweeper republishes a stale outbox row and garbage-collects orphan blobs", async () => {
		const built = await buildPublished(1);
		const later = Date.now() + 31_000;
		const stale = await runSweeper(later);
		expect(stale.republished).toBeGreaterThanOrEqual(1);
		expect(sent.some((event) => event.documentId === built.documentId)).toBe(
			true,
		);
		const orphan = `docs/${ulid()}/orphan.pdf`;
		await env.STORAGE.put(orphan, "orphan");
		const [document] = await getDb()
			.select()
			.from(documents)
			.where(eq(documents.id, built.documentId));
		await env.DB.prepare(
			"INSERT INTO blob_intents (r2_key, document_id, created_at) VALUES (?, ?, 1)",
		)
			.bind(orphan, built.documentId)
			.run();
		// The upload already recorded an intent for the real source file. Age it too.
		await env.DB.prepare(
			"UPDATE blob_intents SET created_at = 1 WHERE r2_key = ?",
		)
			.bind(document?.sourceR2Key)
			.run();
		const swept = await runSweeper(Date.now());
		expect(swept.blobsCollected).toBeGreaterThanOrEqual(2);
		expect(await env.STORAGE.get(orphan)).toBeNull();
		expect(await env.STORAGE.get(document?.sourceR2Key ?? "")).not.toBeNull();
		expect(
			await scalar(
				"SELECT count(*) AS n FROM blob_intents WHERE r2_key = ?",
				orphan,
			),
		).toBe(0);
	});

	it("R-3.8 and R-3.9 a three-signer document stays within the queue budget", async () => {
		const built = await buildPublished(3);
		let delivered = 0;
		const durations: number[] = [];
		const run = async () => {
			await publishOutbox({ documentId: built.documentId });
			const result = await pump(sent);
			delivered += result.count;
			durations.push(...result.durations);
		};
		await run();
		for (let index = 0; index < 3; index += 1) {
			const signer = built.signers[index];
			if (!signer) throw new Error("Missing signer.");
			const result = await signWithToken(
				built,
				index,
				tokenFor(mail.messages, signer.email),
			);
			expect(result.status).toBe(index === 2 ? "completed" : "signed");
			await run();
		}
		expect(delivered).toBeLessThanOrEqual(12);
		expect(delivered * 3).toBeLessThanOrEqual(36);
		expect(
			mail.messages.filter((message) =>
				message.subject.startsWith("Please sign"),
			),
		).toHaveLength(3);
		expect(
			mail.messages.filter((message) =>
				message.subject.includes("fully signed"),
			),
		).toHaveLength(3);
		const [document] = await getDb()
			.select()
			.from(documents)
			.where(eq(documents.id, built.documentId));
		expect(document?.status).toBe("completed");
		expect(document?.anchoredAt).not.toBeNull();
		durations.sort((a, b) => a - b);
		console.info(
			`queue messages ${delivered}; handler ms p50 ${durations[Math.floor(durations.length / 2)]?.toFixed(1)} max ${durations.at(-1)?.toFixed(1)}`,
		);
	});
});

function fakeBatch(bodies: unknown[], queue = "ds-events") {
	const acks: number[] = [];
	const retries: number[] = [];
	const messages = bodies.map((body, index) => ({
		id: String(index),
		timestamp: new Date(),
		body,
		attempts: 1,
		ack() {
			acks.push(index);
		},
		retry() {
			retries.push(index);
		},
	}));
	const batch = {
		queue,
		messages,
		ackAll() {},
		retryAll() {},
	} as unknown as MessageBatch<unknown>;
	return { batch, acks, retries };
}
