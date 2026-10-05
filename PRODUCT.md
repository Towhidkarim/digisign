# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary user is someone at an office desk who sends agreements every day. They prepare a PDF, name the people who must sign, and put those people in order. They need a working desk for that, not a one-off form.

Signers are the named people on a document. They do not have accounts. A link is how they arrive, review, and sign.

A third audience can check a finished PDF without an account and without having been part of the signing.

## Product Purpose

DigiSign lets that office send a PDF through a fixed order of signers and keep a checkable record in the finished file.

Success for the MVP is the creator doing that path themselves: prepare a PDF, send the links, and check the finished file. A stronger interface and further peripheral features are wanted. Which extra features are in scope is not decided.

## Positioning

Two things together, both binding. Signing is sequential: the next person is invited only after the previous one has signed. The finished PDF carries a record anyone can check, without an account. A neighboring product that only stores the signature in its own account, or that lets everyone sign at once, is not this product.

## Operating Context

The creator signs in with email and password and lands on a dashboard of their documents. They start a document from a PDF, place fields, name signers in order, and send. Each signer gets a link when it is their turn. Opening the link does not use it up. Choosing to review and sign does.

Until email delivery is configured, invitation and notice mail is printed to the console. The creator, and anyone else with the file, can check a finished PDF on the public check page.

## Capabilities and Constraints

Confirmed:

- One creator account per person. Signers never sign in.
- Email and password for the creator. Magic-link login, password reset, and email verification are not part of the product yet.
- Signing order is strict. At most one signer on a document is invited at a time.
- The server is the evidence authority: document state, storage, the audit chain, and an Ed25519-signed manifest. PDF parsing, rendering, and stamping happen in the browser.
- The app runs on Cloudflare Workers Free. The worker bundle must stay small and must not contain the PDF libraries.
- A document can be a draft, out for signature, completed, declined, voided, or expired.
- Rate limits and a signer one-time code are deferred.
- A page for opening one document from the dashboard does not exist yet. A row is a record, not a destination.

Not decided:

- Which peripheral features sit beside prepare, send, and check.
- Whether other offices can sign up, or the path stays the owner's own use first. The confirmed success is the owner's own path.

## Brand Commitments

The product name is DigiSign.

The landing line already in the product is "Signed documents, kept in the file itself."

The interface is bound to Poppins and the existing desk, paper, ink, and harbor palette. That is a constraint, not a visual system.

## Evidence on Hand

The landing page is `src/routes/index.tsx`. The app runs locally with `pnpm dev`.

There are no testimonials, case studies, pricing, or customer names. Do not invent them.

## Product Principles

- The desk is for daily agreement work.
- A signer needs a link, not an account.
- One person signs, then the next is invited.
- Someone who was not in the signing can still check the file.
- The creator can finish prepare, send, and check without an operator.
