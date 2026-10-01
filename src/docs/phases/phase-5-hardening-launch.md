# Phase 5 — Hardening & launch gate

> Part of the [masterplan](../masterplan.md). `§n` references point to masterplan sections; `I-n`, `S-n` are invariants and spikes defined there.
>
> - **Read first:** §2 (invariants), §12 (testing strategy), §13 (bounds & budgets)
> - **Depends on:** [Phase 4](./phase-4-auth.md)
> - **Next:** [Phase 6 — Post-MVP](./phase-6-post-mvp.md)

## Scope

- **Free-plan budget verification** on a deployed staging Worker: p99 CPU per route/handler ≤ 7 ms (Workers observability), D1 daily reads/writes and Queues daily operations projected against expected usage with alerts at 70% of the daily limits; 100 000 requests/day headroom.
- Load test (k6 or similar, staying under Free-plan daily limits): 30 concurrent signing sessions; D1 p95 query < 20 ms; no DLQ entries; no `exceededCpu` outcomes.
- Chaos run of R-3.3 on staging with real Cloudflare services.
- Cross-browser renderer determinism check on real devices (desktop + iOS Safari + Android Chrome).
- Observability: structured logs with `documentId`, `eventId`, `opId`; dashboards/alerts for DLQ count, `exceededCpu`, D1 limit errors, queue backlog.
- Backups: D1 Time Travel (7 days on Free) plus a scheduled export strategy; restore drill.
- Legal: consent/disclosure text, data-retention policy, deletion flow for drafts.
