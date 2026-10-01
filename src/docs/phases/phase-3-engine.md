# Phase 3 — Engine: queues, outbox, notifications, checkpoints, verification

> Part of the [masterplan](../masterplan.md). `§n` references point to masterplan sections; `I-n`, `S-n` are invariants and spikes defined there.
>
> - **Read first:** §3 (topology & queue budget), §8 (queue engine), §9.5 (verification), §10.2–10.3 (audit chain, keys, anchoring)
> - **Depends on:** [Phase 2](./phase-2-backend-core.md)
> - **Spikes to run:** S-5 (Resend over `fetch`)
> - **Next:** [Phase 4 — Auth](./phase-4-auth.md)

No PDF work happens here (I-1). Everything in this phase is small, I/O-bound work that fits the 10 ms CPU limit per invocation.

## Scope

- Queue configuration (`ds-events`, `ds-dlq`, §3.2), consumer framework (§8.3), handlers `dispatch_next`, `send_email`, `notify_parties`, `anchor_manifest` (§8.4). See §8.0 for why these exist without server-side PDF work.
- Outbox fast path + cron re-publisher and lost-message recovery (§8.2); sweeper tasks (§8.5); DLQ consumer (§8.6).
- `Mailer` interface with two adapters: **dev mailbox** (writes to `dev_mailbox`, viewable at `/dev/mailbox`) used by default, and **Resend** (configured at the end of this phase once the API key and sending domain are ready). E-mail templates: invite, reminder, completed, declined, voided.
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
- R-3.7a The public verification response contains no emails, IPs or user agents; authenticated creator/signers see full private evidence.
- R-3.8 CPU: every queue/cron invocation p99 ≤ 7 ms at `max_batch_size` 5.
- R-3.9 Queue budget: a 3-signer document end-to-end uses ≤ 12 messages (≤ 36 operations).

## Exit criteria

R-3.x green; full E2E (real local queues, dev mailbox) green from upload to verified download; DLQ replay runbook written.
