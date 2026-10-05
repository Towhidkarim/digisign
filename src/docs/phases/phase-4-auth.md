# Phase 4 — Auth layer (creators) & access hardening

> Part of the [masterplan](../masterplan.md). `§n` references point to masterplan sections; `I-n`, `S-n` are invariants and spikes defined there.
>
> - **Read first:** §10 (security & tamper resistance), §6.2 (endpoints and actors), §2 I-2 (CPU budget)
> - **Depends on:** [Phase 3](./phase-3-engine.md)
> - **Spikes to run:** S-6 (Better Auth on D1, CPU cost), S-8 (rate-limit binding on Free)
> - **Next:** [Phase 5 — Hardening & launch](./phase-5-hardening-launch.md)

## Scope

- Better Auth on D1 via the Drizzle adapter (SQLite provider), instance created per request with bindings; generate its tables into our schema/migrations.
- **Login method chosen for the 10 ms CPU budget:** password hashing (scrypt/argon2-style) can exceed 10 ms per login. Prefer **e-mail magic-link / OTP login** for creators (cheap, and reuses the `Mailer`); only enable email+password if S-6 shows the hash cost fits with headroom.
- Replace the dev stub actor; enforce `owner_id` on every creator endpoint and on source streaming.
- Rate limiting on login, token exchange, submit, upload (rate-limit binding if available on Free per S-8; otherwise a D1 fixed-window counter or WAF rule).
- `Origin` check middleware, security headers (CSP, HSTS, `Referrer-Policy`, `X-Content-Type-Options`, `frame-ancestors 'none'`).
- Optional signer e-mail OTP step-up (per-document setting).

## Requirements

- R-4.1 Authorization matrix test: every endpoint × {anonymous, other creator, owner, other signer, active signer, finished signer, manifest holder} → expected allow/deny.
- R-4.2 No creator endpoint reachable without a session; session cookies HttpOnly/Secure/SameSite.
- R-4.3 Rate limits verified by tests; responses do not leak account existence.
- R-4.4 Session validation and login endpoints p99 ≤ 7 ms CPU.

## Decisions and results

- Login is email and password for the MVP. Magic-link or other methods can follow later.
- Rate limits are deferred (R-4.3 covers non-leaking responses only). Resend and the signer e-mail OTP step-up are deferred.
- Auth tables live in `src/db/schema/auth.ts` and are barrel-exported. Migration `0003_auth`.
- S-6: Better Auth's default scrypt took about 85 ms per hash in a local measurement, over the 10 ms Free budget. Hashing uses native PBKDF2-SHA256 at 100,000 iterations (the Workers maximum), in `src/server/password.ts`. Local native cost was about 50 ms wall clock. Measure real CPU in Workers observability after deploy. If it exceeds the plan limit, the options are a lower iteration count (weaker), a paid plan, or another login method.
- `resolveActor()` reads the session and returns 401 when missing. `ownerContact()` reads the `user` table, so the creator now receives completion, decline and expiry notices.
- Origin check on non-safe methods and security headers live in `src/server/security.ts`, applied in `src/server-entry.ts`. The CSP and HSTS apply on https only. Check a deployed build loads PDFs and fonts under the CSP.
- Existing documents from the dev stub owner are not migrated.
- Security review found no authorization bypass. One medium finding: unauthenticated login and sign-up run 100,000-iteration PBKDF2 with no rate limit, a CPU-abuse vector. Add rate limiting (deferred by decision) before launch.

## Exit criteria

R-4.x green; external-style review of auth flows done (use the security-review workflow).
