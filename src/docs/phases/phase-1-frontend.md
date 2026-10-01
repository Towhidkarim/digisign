# Phase 1 — Frontend: PDF viewing, field placement, signature capture, signing UX, renderer

> Part of the [masterplan](../masterplan.md). `§n` references point to masterplan sections; `I-n`, `S-n` are invariants and spikes defined there.
>
> - **Read first:** §5 (coordinate system), §6 (contracts & API surface), §9 (browser PDF handling), §13 (bounds)
> - **Depends on:** [Phase 0](./phase-0-foundations.md)
> - **Spikes to run:** S-2 (`react-pdf` vs `pdfjs-dist`), S-3 (renderer determinism), S-7 (SSR CPU cost)
> - **Next:** [Phase 2 — Backend core](./phase-2-backend-core.md)

On the Free plan the browser does **all** PDF work (I-1, I-2), so this phase also delivers the production renderer, not just a preview harness. The backend is mocked behind the §6 contracts (in-memory adapter with the same server-function signatures), so no UI rework is needed in Phase 2.

## Scope

1. **PDF loading & rendering** (pdf.js via `react-pdf` or `pdfjs-dist`; decide in S-2):
   - Client-only (no SSR of pdf.js; editor/signing/verify routes are client-rendered per S-7); worker loaded from same origin via Vite asset URL.
   - Virtualized pages: render only visible ± 2 pages (IntersectionObserver); cancel render tasks on unmount/zoom; canvas resolution `cssScale × min(devicePixelRatio, 2)`.
   - Range-request loading of large files (works with the Phase 2 streaming route).
   - Zoom: fit-width, fit-page, 50–200%; rotation displayed exactly as the PDF defines.
2. **Upload preparation** (§9.1):
   - Enforce ≤ 25 MB and ≤ 200 pages before upload; reject encrypted/unparseable files with a clear message.
   - Extract per-page geometry (`mediaBox`, `cropBox`, normalized `rotate`) with pdf.js; compute SHA-256 with Web Crypto; build `UploadInit`.
3. **Field editor**:
   - Palette → drag onto page; move/resize handles; keyboard nudge (1 px / 10 px with Shift); min size per kind (in points, via geometry); clamp to page bounds; no cross-page fields.
   - Assign to signer (color-coded); signer list with ordering (drag to reorder).
   - Undo/redo via a pure reducer + command stack; state serializes to `SaveLayoutInput`.
   - Autosave (debounced, CAS on `layout_version`; on 409 show "layout changed elsewhere, reload").
4. **Signature capture**:
   - `signature_pad` for drawn signatures with fixed capture aspect ratio (e.g. 3:1), `touch-action: none`, re-render from stroke data on resize (signature_pad clears on resize).
   - Encode strokes with the packed codec (`src/core/strokes-codec.ts`, coords 0..10 000, bounded); typed signature with 2 bundled script fonts; PNG preview only for UI.
   - **Saved signature reuse (device-local, D-18):** after signing, offer "Remember on this device". The packed `drawn`/`typed` record (never an image) is stored in `localStorage` under a versioned key; on the next signing screen it is offered as a one-click choice, re-validated with the shared bounds validator before use, with a "Forget" action. Nothing is saved server-side, and no account is needed. Reuse only pre-fills the capture; the signer must still review and submit, and the evidence is always a fresh `drawn`/`typed` value.
   - No image-upload signature type in the MVP (decoding untrusted images deferred post-MVP).
5. **Signing UI**:
   - Loads the original PDF, verifies its sha256, draws prior signers' signatures as overlays (same drawing code as the renderer).
   - Shows only the current signer's fields, guided "next required field", progress, required-field validation, consent checkbox with disclosure text, review screen, submit with idempotency key and `stateHash`.
   - Decline with reason.
6. **Deterministic renderer** (`src/pdf/render.ts`, §9.4): `render(originalBytes, signedManifest)` → signed PDF with stamped fields, footer on every page (document ID, shortened original SHA-256, verify URL), Certificate of Completion pages with QR code, embedded manifest attachment, `DigiSignDocumentId` Info key; fixed metadata, pinned pdf-lib and fonts.
   - Editor reserves the footer strip: fields cannot be placed over it.
7. **Dev harness route**: create a mock signed manifest, render, re-open with pdf.js, show field rectangles vs. drawn ink for visual checks.

## Requirements

- R-1.1 Coordinates produced by the editor round-trip exactly (integer equality) through save → load → render.
- R-1.2 For every fixture page and all rotations, rendered signature ink lands within **±1 pt** of the field rect (automated: render, rasterize with pdf.js, detect ink bounding box).
- R-1.3 `coords.ts` agrees with pdf.js `convertToPdfPoint` within 0.01 pt (property tests, ≥ 10 000 cases).
- R-1.4 **Determinism:** rendering the same inputs yields byte-identical output across runs and across Chromium, Firefox and WebKit (S-3 findings applied).
- R-1.5 Geometry extraction matches pdf.js viewport values for every fixture (including non-zero CropBox origins and inherited `/Rotate`).
- R-1.6 Editor interactions at 60 fps on a 50-page document on a mid-range laptop; first page visible < 1.5 s for a 5 MB PDF (local); rendering a 200-page / 25 MB fixture completes without tab crash and < 15 s on a mid-range laptop.
- R-1.7 Fully usable with keyboard; fields have accessible names; works with touch and pen.
- R-1.9 Saved-signature reuse: a tampered or oversized `localStorage` entry is rejected by the validator and discarded; "Forget" removes it; the submit payload for a reused signature is indistinguishable from a freshly drawn one.
- R-1.8 Packed-stroke codec: encode/decode round-trip exact; bounds violations rejected by the shared validator.

## Out of scope

Real persistence, auth, e-mail, templates, text/checkbox fields, mobile-specific layouts beyond "works".

## Exit criteria

R-1.1–R-1.8 automated and green; Playwright E2E "select PDF → place fields for 2 signers → sign as A → sign as B → render signed PDF (mock manifest)" green in all three browsers.
