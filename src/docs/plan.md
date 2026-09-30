# plan.md – Multi-Party Sequential Document Signing MVP
**Target Stack**: TanStack Start (React) on Cloudflare (Workers + R2 + Queues + D1/Hyperdrive PostgreSQL)  
**PDF Engine**: pdf-lib (pure TypeScript)  
**Frontend**: TanStack Start + PDF.js (react-pdf) + signature_pad  
**Goal**: Production-grade, isolate-aware, sequential multi-party e-signature system (BreezeDoc / DocuSign style)

---

## 1. Core Architecture Principles (Non-Negotiable)

- **Strict Isolate Separation**
  - HTTP isolate (TanStack Start server functions): auth, magic links, atomic DB writes, R2 puts of source files & signature PNGs, Queue producer only. Never import pdf-lib. Keep under low CPU/memory.
  - Queue consumer isolate (separate Worker entrypoint): all pdf-lib work, stamping, Certificate generation, final R2 writes, sequential dispatch logic.

- **Sequential Only**: Signers are processed strictly in `order`. Next signer is invited only after previous signer’s signature has been successfully stamped.

- **Optimistic Locking + Idempotency**: Every state transition uses conditional SQL (`WHERE status = expected AND version = expected`). Queue messages are protected by a `processed_messages` primary-key table.

- **Zero External Binary Dependencies**: Only pure JS/TS + Web Crypto API.

---

## 2. High-Level System Topology

```
Creator → HTTP Worker (upload + publish)
       → R2 (original PDF) + DB (documents + signers + fields)
       → Queue → Consumer (dispatch first signer)

Signer N → Magic link → HTTP Worker (serve PDF + collect signature)
         → R2 (signature PNG) + atomic DB update
         → Queue → Consumer (stamp with pdf-lib)

Last Signer → Consumer performs finalization:
            - Stamp last signature
            - Append Certificate of Completion (with placeholder digest)
            - Two-pass hash (fix placeholder)
            - Write final PDF to R2
            - Update document status = completed
            - Notify all parties
```

---

## 3. Data Model (Drizzle Schema)

### Tables
- `documents`
  - id, title, status (`draft` | `in_progress` | `completed` | `voided`)
  - originalR2Key, finalR2Key
  - originalDigest, finalDigest
  - version (optimistic lock)
  - createdAt, updatedAt

- `signers`
  - id, documentId, email, order (integer, sequential)
  - status (`pending` | `invited` | `viewing` | `signed` | `declined`)
  - magicToken, tokenExpiresAt
  - signatureR2Key, signedAt
  - version

- `signature_fields`
  - id, documentId, signerId, pageIndex (0-based)
  - xNorm, yNorm, wNorm, hNorm   ← normalized 0–1 **per page**
  - (optional absolute PDF points after mapping)

- `audit_logs`
  - id, documentId, eventType, actorId
  - payload (jsonb)
  - prevHash, eventHash (SHA-256 chained)
  - createdAt

- `processed_messages`
  - messageId (PK), processedAt   ← Queue idempotency

---

## 4. Finite State Machines

### Document
- draft → (publish) → in_progress
- in_progress → (all signers signed) → completed
- in_progress → (void/expire) → voided
- completed / voided = terminal

### Signer
- pending → (dispatch) → invited
- invited → (open valid link) → viewing
- viewing → (submit signature) → signed
- signed / declined = terminal

All transitions are atomic conditional updates with version check.

---

## 5. Coordinate System (Critical for Multi-Page)

**Coordinates are always stored and transmitted as normalized 0–1 values relative to the individual page.**

- Frontend (react-pdf):
  - User places / draws signature on a specific page.
  - Capture bounding client rect of that page only.
  - Convert mouse/touch → `xNorm = (x - left) / pageWidth`, `yNorm = (y - top) / pageHeight` (clamped 0–1).
  - Store `pageIndex` + the four norms.

- Backend / pdf-lib:
  - Load the specific page by `pageIndex`.
  - Convert norms → PDF points:
    ```
    pdfX = xNorm * page.getWidth()
    pdfY = (1 - yNorm) * page.getHeight()   // Y-axis inversion
    ```
  - Apply page `/Rotate` transform (0/90/180/270).
  - Preserve signature aspect ratio with `object-fit: contain` logic inside the field box.

**Never** use absolute coordinates across the whole document height. Everything is page-local.

---

## 6. Cryptographic Design

- **Chained Audit Log**: Each event’s hash = SHA-256(prevHash || timestamp || actor || type || canonicalPayload). Genesis = SHA-256("genesis").
- **Document Digests**:
  - `originalDigest` = SHA-256(original PDF bytes) at upload time.
  - `finalDigest` = SHA-256(final PDF bytes) after all stamps + Certificate.
- **Circular Hash Problem Solution (Two-Pass)**:
  1. Build Certificate page with fixed-length placeholder (`0`.repeat(64)).
  2. Serialize → compute real digest.
  3. Replace placeholder with real 64-char hex digest (byte-for-byte same length).
  4. Store final bytes + finalDigest.

Verification: Hash received PDF → must equal both the value printed on the Certificate and the value in the database.

---

## 7. Detailed Two-Party Flow (Alice → Bob)

1. Creator uploads + defines fields + publishes → HTTP: DB + R2 + enqueue `dispatch_next`.
2. Queue Consumer: invite Alice (magic link + email), set status=invited.
3. Alice opens link → HTTP serves original PDF + her field.
4. Alice submits signature → HTTP: store PNG, atomic update to signed, enqueue `process_signature`.
5. Queue Consumer: stamp Alice’s signature onto PDF, write intermediate, enqueue `dispatch_next`.
6. Queue Consumer: invite Bob.
7. Bob opens link → HTTP serves intermediate PDF (already has Alice) + Bob’s field.
8. Bob submits → HTTP: store PNG, atomic update, enqueue `process_signature`.
9. Queue Consumer (last signer): stamp Bob, append Certificate (placeholder), two-pass hash, write final PDF to R2, set document=completed, notify everyone.

---

## 8. Implementation Phases (Agent Execution Order)

### Phase 1 – Foundation
- [ ] Drizzle schema + migrations (all tables above)
- [ ] Basic TanStack Start project structure on Cloudflare
- [ ] R2 helpers (put/get original + signatures)
- [ ] Web Crypto SHA-256 utilities + chained hash helper

### Phase 2 – State Machine & Atomicity
- [ ] Document + Signer status transition functions with optimistic locking
- [ ] Unit tests for concurrent update rejection (version mismatch → 409)
- [ ] `processed_messages` idempotency table + helper

### Phase 3 – Magic Link & HTTP Paths
- [ ] Generate / validate magic tokens (expiry, single-use semantics)
- [ ] `createDocument` + `publish` server functions
- [ ] `submitSignature` server function (producer only)
- [ ] Frontend: PDF viewer + signature_pad integration (page-aware coordinates)

### Phase 4 – Queue Consumer Skeleton
- [ ] Separate Worker entrypoint for Queue
- [ ] `dispatch_next` handler (invite logic)
- [ ] `process_signature` handler skeleton (idempotency + load files)

### Phase 5 – PDF Stamping Core
- [ ] Coordinate mapper utility (norm → points + rotation + aspect-ratio)
- [ ] pdf-lib stamping of a single signature on a given page
- [ ] Intermediate PDF handling
- [ ] Certificate of Completion page generation (with placeholder)
- [ ] Two-pass digest replacement

### Phase 6 – Finalization & Notifications
- [ ] Detect last signer → full finalization path
- [ ] Write final PDF + update document
- [ ] Completion email / webhook
- [ ] Full audit trail verification helper

### Phase 7 – Hardening
- [ ] Race-condition tests (double-submit, out-of-order, concurrent invites)
- [ ] Page rotation test suite (0/90/180/270)
- [ ] Multi-page document tests
- [ ] Error handling, retries, dead-letter considerations
- [ ] Basic admin void / expire paths

---

## 9. Key Code Locations (Expected Structure)

```
/src
  /server
    createDocument.ts
    publish.ts
    submitSignature.ts          ← HTTP producer
    magicLink.ts
  /queue
    consumer.ts                 ← Queue isolate entry
    handlers/
      dispatchNext.ts
      processSignature.ts
  /lib
    coords.ts                   ← norm ↔ PDF points + rotation
    crypto.ts                   ← SHA-256 + chain
    pdf/
      stamp.ts
      certificate.ts
      twoPassDigest.ts
  /db
    schema.ts
    index.ts
  /components
    PdfViewer.tsx
    SignaturePad.tsx
```

---

## 10. Success Criteria

- Two (or more) signers can complete a multi-page PDF sequentially.
- No HTTP request ever runs pdf-lib.
- Double-submit or concurrent sign attempts are rejected cleanly.
- Final PDF contains correct signatures + self-consistent Certificate digest.
- Audit chain is verifiable from genesis.
- Coordinates work correctly on rotated and multi-page documents.
- Entire system runs on Cloudflare with pure JS/TS dependencies only.

---

## 11. Open Questions / Future Extensions (Out of Scope for MVP)

- Parallel signing (currently sequential only)
- Declined / void flows fully polished
- Mobile-optimized signature capture
- External TSA / RFC 3161 timestamps
- Full legal Certificate of Completion with jurisdiction text

---

**This plan is the single source of truth.**  
Any agent working on the project should treat the isolate boundaries, optimistic locking, page-local normalized coordinates, and two-pass digest as non-negotiable.  
Start with Phase 1 and proceed strictly in order.
```

The file is ready. You can download it here:

**[Download plan.md](file:///home/workdir/artifacts/plan.md)**

(If the link does not appear as a download button in your UI, the file is located at `/home/workdir/artifacts/plan.md`.)

Would you like me to also generate any of the starter code files (schema, coords utility, etc.) next?