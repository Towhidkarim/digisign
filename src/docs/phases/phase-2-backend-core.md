# Phase 2 — Backend core: D1 schema, HTTP mutations, R2, manifest signing

> Part of the [masterplan](../masterplan.md). `§n` references point to masterplan sections; `I-n`, `S-n` are invariants and spikes defined there.
>
> - **Read first:** §4 (state machines), §6.2 (endpoints), §7 (data layer on D1), §9.1–9.3 (upload, state hash, manifest), §10.3–10.4 (keys, signer access)
> - **Depends on:** [Phase 1](./phase-1-frontend.md)
> - **Spikes to run:** S-1 (`changes()` inside D1 batches → guarded-batch mechanism)
> - **Next:** [Phase 3 — Engine](./phase-3-engine.md)

## Scope

- Full schema §7.2 (layout as one JSON column), custom migration §7.3, `guardedBatch` §7.4 (after S-1), repositories.
- Server functions and the upload/source server routes from §6.2, except e-mail sending and verification (Phase 3); signer token exchange and sessions (signer access belongs to the signing domain, not Phase 4).
- Upload: `initUpload` + streaming `PUT` into R2 with the declared `sha256` (R2 verifies), size checks, 1 KB range read for the `%PDF-` header (§9.1).
- Range-capable streaming `GET` of the original.
- `stateHash` computation from stored hashes (§9.2); `submitSignature` including the completion path that builds and Ed25519-signs the manifest (§7.5, §9.3).
- Actor middleware: `resolveActor()` returns a **dev stub creator** until Phase 4; every creator query is already scoped by `owner_id`.
- Outbox rows written; publishing to the local queue (consumers arrive in Phase 3).
- Swap the Phase 1 mock adapter for real server functions.

## Requirements

- R-2.1 Every mutation is a single guarded batch of ≤ 20 statements; integration tests prove a CAS miss leaves **no** partial writes (audit, outbox, idempotency rows).
- R-2.2 Concurrency tests (N = 20 parallel requests): double submit, submit vs. void, two `saveLayout` with the same `layout_version` → exactly one winner, others `409`, DB consistent.
- R-2.3 Ambiguous outcome: fault-injected "commit then throw" returns success via `last_op_id` re-read.
- R-2.4 Triggers reject (tests use raw SQL to bypass app code): audit update/delete, layout/geometry/source edits after publish, signer identity edits after publish, illegal FSM transitions.
- R-2.5 Publish validation: upload `uploaded`, geometry present and valid, ≥ 1 signer, every signer has ≥ 1 signature field, all fields valid against geometry and §13 bounds.
- R-2.6 Upload: R2 rejects bytes that do not match the declared sha256; non-PDF header → `upload_status = rejected`; oversize rejected before streaming.
- R-2.7 Stale `stateHash` on submit → `409`, no writes.
- R-2.8 Manifest signature verifies with the published public key; manifest canonical bytes are stable across re-serialization.
- R-2.9 CPU: every endpoint measured in `vitest-pool-workers` (or `wrangler dev` with CPU reporting) at p99 ≤ 7 ms with maximum-size valid payloads (300 fields, 8 000-point signature).

## Exit criteria

R-2.x green; the Phase 1 E2E flow runs against real local D1/R2 through to "document completed, manifest signed", with dispatch done manually or by a test helper until Phase 3.
