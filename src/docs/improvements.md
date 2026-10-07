# Improvement ideas

Ideas for after the MVP, grouped by what they add. The first item in each group is the one that matters most. Nothing here is built yet.

## Top three

1. External timestamp on the anchor.
2. Signers get their copy of the signed PDF by email.
3. A custom sending domain for email.

Together these make the product look and behave like a serious signing tool.

## Trust and verification

- **External timestamp on the anchor.** The anchor is only a copy in our own R2, so it proves nothing about time to an outsider. Submit the checkpoint hash to an RFC 3161 timestamp authority, or to OpenTimestamps. Then "this existed at time T" is provable without trusting us. It is a small change and the biggest upgrade to the integrity story.
- **Public key publishing and offline verify.** Publish the signing public key at a well-known URL, such as `/.well-known/digisign-key.json`. The PDF already embeds the signed envelope, so a small standalone script or page could verify a file with no server at all.
- **Key rotation.** `keyId` is already in the envelope. Add a tested rotation path in which old keys stay verifiable.

## Signer experience

- **Copy for signers.** After signing, email each signer the final PDF, or a link to it. Most signing tools do this and people expect it.
- **Reminders and expiry controls.** The notification types exist. Add a "remind now" button and a per-document deadline in the UI.
- **Typed and uploaded signatures**, not only drawn. They matter on desktops.
- **Mobile signing polish.** Most signers will open the email on a phone, so test that path hardest.

## Owner experience

- **Templates and reuse.** Save signer and field layouts, or "duplicate document". The most valuable feature after the basics.
- **Dashboard search, filters and a status timeline** per document, built from the audit events already stored.
- **Activity view.** Show "Opened by Ada, 2 min ago". The data is already there.
- **Bulk send.** One template sent to many recipients.

## Reliability and operations

- **Failure visibility.** A page or alert for dead letters and failed emails. Today they sit in tables nobody looks at.
- **Email deliverability.** Move off Gmail SMTP to a custom domain with SPF, DKIM and DMARC. Invite emails landing in spam is the most likely real-world failure. Gmail also limits sending to about 500 recipients a day.
- **Backups and retention.** Decide how long evidence is kept, and set up D1 and R2 backups. This is a compliance question for a signing product.
- **Analytics and error tracking**, such as Sentry or Workers Logs with alerts.
- **Rate limiting** on sign-in and magic-link requests.

## Product and polish

- **Accessibility pass.** Keyboard-only signing, screen-reader labels on the signature canvas, and contrast in dark mode.
- **Localization.** Real users may not use English. This also needs a bundled Unicode font: today characters the built-in PDF fonts cannot draw (for example Bengali or Chinese) show as "?" in the signed PDF.
- **Onboarding.** An empty-state dashboard with a one-click sample document.
- **Pricing or limits page**, if the product will be charged for.

## Open decisions

- **Legal wording** for the e-signing consent dialog is still a TODO.
- **"Anchored" wording.** Decide how the UI describes the anchor so it does not overclaim until the external timestamp exists.
- **Renderer versions.** Before the first real document is signed, freeze the drawing code for `1.1.0`. Any later change must be a new version that dispatches on `manifest.renderer.version`, so old documents keep verifying.
