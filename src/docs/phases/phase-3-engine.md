# Phase 3 — Engine: queues, outbox, notifications, checkpoints, verification

> Part of the [masterplan](../masterplan.md). `§n` references point to masterplan sections; `I-n`, `S-n` are invariants and spikes defined there.
>
> - **Read first:** §3 (topology & queue budget), §8 (queue engine), §9.5 (verification), §10.2–10.3 (audit chain, keys, anchoring)
> - **Depends on:** [Phase 2](./phase-2-backend-core.md)
> - **Spikes to run:** S-5 (Resend over `fetch`)
> - **Next:** [Phase 4 — Auth](./phase-4-auth.md)

No PDF work happens here (I-1). Everything in this phase is small, I/O-bound work that fits the 10 ms CPU limit per invocation.

## Who acts

- The **creator** is the only account. They prepare a document and dispatch it. Real signup is Phase 4; until then local dev keeps the stub owner. This phase does not add a sign-up screen.
- A **signer** does not sign in and does not get an account. The magic link (`/s/{token}`) is their proof. Opening the link does not consume the token. "Review and sign" exchanges it for a signer session.

## Scope

- Queue configuration (`ds-events`, `ds-dlq`, §3.2), consumer framework (§8.3), handlers `dispatch_next`, `send_email`, `notify_parties`, `anchor_manifest` (§8.4). See §8.0 for why these exist without server-side PDF work.
- Outbox fast path + cron re-publisher and lost-message recovery (§8.2); sweeper tasks (§8.5); DLQ consumer (§8.6).
- `Mailer` interface with two adapters. The default is the **console mailer**: it prints `----- DigiSign mail -----` in the `pnpm dev` terminal, including the full magic-link URL. There is no `dev_mailbox` table and no `/dev/mailbox` page. **Resend** replaces the console mailer only when `RESEND_API_KEY` and `MAIL_FROM` are set (end of this phase, once the API key and sending domain are ready). E-mail templates: invite, reminder, completed, declined, voided. Only the invite template carries the magic link. The others name the document and what happened. They do not ask the signer to create an account.
- R2 bucket-lock rules for `manifests/` and `anchors/`.
- `/.well-known/digisign-keys.json` (server route), `verifyManifest` / `lookupDocument` server functions with read grants, and the `/verify` + `/v/$documentId` pages (§9.5).

## Requirements

- R-3.1 Duplicate delivery: every handler run 2× sequentially and 2× concurrently for the same event yields identical final state (one invitation token active, one `sent` delivery row).
- R-3.2 Out-of-order delivery: a `dispatch_next` delivered before the previous signer's commit is a no-op (acked; re-triggered later by the commit or the sweeper).
- R-3.3 Crash injection at every step boundary of each handler → system converges to the correct state via retries/sweeper within 15 minutes.
- R-3.4 Lost message (simulated) is recovered by the sweeper.
- R-3.4a Cross-store atomicity: fault-inject "R2 evidence write succeeds, D1 batch fails" → orphan is GC'd within 24 h and no D1 row references it; "completion batch commits, `anchor_manifest` lost" → sweeper anchors the manifest; a failed completion batch leaves **nothing** in the locked `manifests/` prefix.
- R-3.5 Sweeper with nothing to do performs only one cheap indexed D1 read per task (or a single combined read) and sends zero queue messages.
- R-3.6 Swapping Mailer adapters requires only configuration (no handler changes); Resend errors are classified transient/permanent correctly.
- R-3.7 Verification (§9.5): a signed PDF rendered in Phase 1 code verifies as **Valid**; flipping one byte, changing a stamp, altering the embedded manifest, swapping in another document's genuine manifest, or tampering with an audit event each yields the correct failure state; a PDF with the attachment stripped is identified via metadata/footer text and reported as "Record found, no embedded manifest".
- R-3.7a The public verification response contains no emails, IPs or user agents. The creator, and a signer who still holds the magic-link session, see full private evidence. A signer does not need a platform account for that.
- R-3.8 CPU: every queue/cron invocation p99 ≤ 7 ms at `max_batch_size` 5.
- R-3.9 Queue budget: a 3-signer document end-to-end uses ≤ 12 messages (≤ 36 operations).

## Exit criteria

R-3.x green; full E2E (real local queues, console mailer) green from upload to verified download; DLQ replay runbook written. The invite URL is read from the process console until Resend is configured.

## Runbook

### Replay a dead-lettered event

Events that exhaust their retries (or fail permanently) land in the `dead_letters` table, and the consumer logs `[dead-letter]` with the reason.

1. Find the row: `pnpm wrangler d1 execute digisign --local --command "SELECT id, queue, error, body_json FROM dead_letters WHERE replayed_at IS NULL"` (add `--remote` for the deployed database).
2. Fix the cause (for a permanent mail failure, correct the address or the provider setting; a `failed` delivery row stays `failed`, so delete it or resend through "Send link again").
3. Run `node scripts/replay-dead-letter.mjs <dead-letter-id> [--remote]`. It sets the original outbox row back to `pending` and stamps `replayed_at`.
4. The cron sweeper republishes pending outbox rows older than 30 seconds. Handlers are idempotent, so a replay is safe to repeat.

### R2 bucket locks

The `manifests/` and `anchors/` prefixes are write-once by design (the code never overwrites them). Add bucket-lock rules for both prefixes when a remote bucket exists, and record the rule ids here at that time. Local development has no bucket locks.

### Local development notes

- `vite dev` does not run the cron trigger. The request path publishes the outbox right after commit, which covers local work. Run the sweeper tests (`pnpm vitest run`) to exercise recovery.
- Mail prints to the `pnpm dev` terminal between `----- DigiSign mail -----` lines until `RESEND_API_KEY` and `MAIL_FROM` are both set.
- Set `MANIFEST_SIGNING_KEY` in `.dev.vars` so verification keeps working across restarts. Public keys are served at `/.well-known/digisign-keys.json`.

### Verification pages

`/verify` checks a dropped PDF in the browser; `/v/{documentId}` opens the same page with the id filled in. Read grants are HMAC-signed, last 10 minutes, and unlock only the original PDF of a completed document.

### Measured notes

- R-3.8 (CPU p99 at most 7 ms) cannot be measured in the test pool. The tests log wall-clock handler time as a proxy; confirm CPU time in Workers observability after deploy.
- R-3.9 is asserted by `engine.worker.test.ts` (at most 12 messages for 3 signers).
