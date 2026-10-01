# Phase 6 — Post-MVP (not planned in detail)

> Part of the [masterplan](../masterplan.md).
>
> - **Depends on:** [Phase 5](./phase-5-hardening-launch.md)

## Candidates

- **Move to Workers Paid** and add a server-side PDF worker (pdf-lib in a queue consumer with raised `cpu_ms`) that renders and stores the signed PDF, removing the reliance on client-side determinism.
- PAdES/CMS seal over the final PDF so PDF readers show a native "signed, not modified" status (requires server-side digest of the final file → Paid plan).
- RFC 3161 trusted timestamps on manifests.
- Cloudflare Email Service as an additional `Mailer` adapter (Paid plan).
- Parallel signing groups, templates, text/checkbox fields, webhooks, organizations/teams.
- Durable-Object coordination or Workflows if contention or long-lived schedules demand it.
