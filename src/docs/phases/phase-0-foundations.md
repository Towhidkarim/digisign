# Phase 0 — Foundations & contracts (short, blocking)

> Part of the [masterplan](../masterplan.md). `§n` references point to masterplan sections; `I-n`, `S-n` are invariants and spikes defined there.
>
> - **Read first:** §0 (constraints & current state), §2 (invariants), §5 (coordinates), §6 (contracts), §15 (repo layout)
> - **Depends on:** nothing
> - **Spikes to run:** S-4 (custom server entry with `queue` + `scheduled`)
> - **Next:** [Phase 1 — Frontend](./phase-1-frontend.md)

## Scope

- Repo layout (§15); `src/core` with contracts (Zod ≥ 4.5), `coords.ts`, canonical JSON, hash helpers, packed-stroke codec, FSM transition tables as data.
- Replace `better-sqlite3` with D1 (`drizzle-orm/d1`); add `DB`, `STORAGE` (R2), `Q_EVENTS` bindings and a cron trigger; bump `compatibility_date`; `wrangler types`.
- Custom server entry `src/server-entry.ts` exporting `fetch` (TanStack Start), `queue`, `scheduled` (S-4).
- Test harness: Vitest (unit + browser mode), `@cloudflare/vitest-pool-workers`, Playwright (Chromium, Firefox, WebKit).
- Fixture PDF corpus: A4/Letter portrait/landscape, `/Rotate` 0/90/180/270, non-zero CropBox origin, mixed page sizes, 200-page, 25 MB, encrypted (negative), malformed (negative).
- Biome `noRestrictedImports`: `pdf-lib`, `@pdf-lib/fontkit`, `pdfjs-dist` only in `src/pdf/**` and client components (I-1). CI step fails if the server bundle contains them.

## Exit criteria

- `pnpm dev`, `pnpm test`, `pnpm build` green; a trivial D1 query works in dev; a test message round-trips through the local queue; the cron handler fires locally.
- Contracts reviewed and frozen at `v1`.
