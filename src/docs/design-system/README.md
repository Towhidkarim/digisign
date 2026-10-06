# DigiSign

DigiSign is a web platform for sending a PDF through a fixed order of signers and keeping a record in the finished file that anyone can check without an account. The interface should feel like a calm, well-kept desk: quiet surfaces, one blue, clear status, and nothing the user has to decode.

This system refines the existing harbor-blue look rather than replacing it. Poppins stays, the brand blue stays (`brand` is the current `--harbor`), and the neutrals and status colors are tightened so every screen reads the same way.

## Principles

1. **The desk is for daily work.** The sender signs in, sees what needs attention, and acts. Lead with state ("Waiting on Maria") and the next action, not decoration.
2. **A signer needs a link, not an account.** The signing flow is the most public screen the product has. It is distraction-free, works one-handed on a phone, and always says how much is left.
3. **One person signs, then the next.** Show order and progress everywhere signers appear. Never imply parallel signing.
4. **Anyone can check the file.** Verification is a first-class screen and carries the same polish as the dashboard. Plain words, clear pass and fail states.
5. **Minimal, with one loud thing.** Each screen has one primary action in `brand`. Everything else is quiet.

## Content fundamentals

- **Voice:** calm, plain, direct. Say what happened and what happens next. "Maria has been invited. You will be emailed when she signs."
- **Sentence case** everywhere, including buttons and headings. No exclamation marks, no "Oops".
- **Name the action by its result.** "Send for signature", not "Submit". "Void document", not "Delete". "Copy new signing link", not "Share".
- **One term per thing.** Document, signer, field, signing link. Do not alternate with "agreement", "recipient", "box", "invite URL" in UI copy.
- **Status words are fixed:** Draft, Out for signature, Completed, Declined, Voided, Expired. Signer states: Not sent yet, Waiting, Signed, Declined, Voided.
- **Errors say what to do.** "We could not load your documents. Try again." with a Try again button, never a bare red line.
- **Dates:** relative for the last 7 days ("3 hours ago"), absolute after ("12 Sep 2026"). Full timestamp in a tooltip.

## Visual foundations

### Color

- `bg` is the desk, `surface` is a sheet of paper on it. Cards are `surface` with a `border` hairline, not a shadow.
- `brand` is the only saturated color in the chrome. Use it for the single primary button per view, links, focus, selection, and progress.
- Text is `ink`, then `ink-muted`, then `ink-subtle`. Nothing lighter carries text.
- Status uses three tokens per state: a solid (icons, dots), a `-bg` tint (badge fill), and a `-fg` (text on the tint). Always pair color with a word and an icon, so status never depends on hue alone.
- Signer colors (`signer-1` to `signer-6`) identify a signer on fields and in the signer list. They must always appear next to the signer's name or initials, and are never used for status.
- Dark mode is a first-class theme: every token has a dark value. Surfaces that are white in light mode (`surface`) are not hardcoded; the PDF page itself stays white, framed by a `border`.

### Type

Poppins only: 400 for text, 500 for labels and buttons, 600 for headings. Minimum size is 12px. Page titles use `title` (26px), and there is exactly one per page. Do not use arbitrary sizes such as `text-[0.95rem]`; use a named style.

### Spacing, radius, elevation

- 4px base. Cards pad with `space-5` (desktop `space-6`). Controls are 40px tall by default, 36px in dense toolbars, and 44px minimum on touch screens.
- Radius: `radius-md` (8px) for controls and rows, `radius-lg` (12px) for cards, `radius-xl` (16px) for modals and sheets, `radius-full` for dots and avatars. No other radius values.
- Elevation: borders for everything that sits on the page, `shadow-md` for popovers and floating toolbars, `shadow-lg` for modals.

### Layout

- App pages use a left sidebar (collapses to a sheet below 768px) and a content column of `max-w-5xl` for lists and tables, `max-w-3xl` for reading and forms. One width per page type; no `max-w-xl` and `max-w-lg` mixtures.
- Gutters: 16px on mobile, 24px tablet, 32px desktop.
- The editor and signing desk are full-bleed tools with their own slim header; both reuse the same logo and header component as the app.

### Motion

150ms ease-out for hover, focus and state changes; 200ms for sheets and dialogs. Honor `prefers-reduced-motion` (already in the codebase). No decorative animation.

## Iconography

Use **Lucide only**, 1.75px stroke, 16px inline and 20px in navigation. Retire HugeIcons from the dashboard shell and landing page so the product has one icon voice. Icons never stand alone for status; they sit beside a label.

## Status system

| State | Label | Tokens | Icon |
| --- | --- | --- | --- |
| Draft | Draft | `neutral` set | pencil |
| In progress | Out for signature | `brand` set | send |
| Completed | Completed | `success` set | check-circle |
| Declined | Declined | `danger` set | x-circle |
| Voided | Voided | `neutral` set, label struck from the document title | ban |
| Expired | Expired | `warning` set | clock |

Draft and Voided share the neutral set but differ by icon and label. Documents that are Voided or Declined also show their title in `ink-muted`.

## Using this in the codebase

The app uses Tailwind v4 with shadcn variables in `src/styles.css`. Map the tokens like this, and use only the semantic names in components (never `var(--harbor)` or `text-[var(--ink)]`):

| shadcn variable | Token |
| --- | --- |
| `--background` | `bg` |
| `--card`, `--popover` | `surface` |
| `--foreground`, `--card-foreground` | `ink` |
| `--muted`, `--secondary`, `--accent` | `surface-subtle` |
| `--muted-foreground` | `ink-muted` |
| `--primary` | `brand` |
| `--primary-foreground` | `on-brand` |
| `--border` | `border` |
| `--input` | `border-control` |
| `--ring` | `ring` |
| `--destructive` | `danger` |

Add new variables and `@theme inline` entries for `success`, `warning`, `info` (= brand set), `neutral`, each with `-bg` and `-fg`, plus `ink-subtle` and `brand-soft`. Set `--radius: 0.5rem`. Remove the legacy aliases (`--desk`, `--paper`, `--ink`, `--harbor`, `--still`, `--tide`, `--line`, `--harbor-deep`) once no file references them.

## Do and don't

- Do give each screen exactly one primary `brand` button. Don't place two.
- Do use the shared `Button`, `Input`, `Dialog`, `Tabs`, `Alert` and toast components. Don't write raw `<button>` with ad hoc classes.
- Do show empty, loading and error states for every list and every route.
- Do keep tap targets at 44px on the signer flow. Don't rely on hover for anything a signer needs.
- Don't use gradients, glass effects, or emoji as icons.
- Don't invent testimonials, customer names, pricing or statistics in the UI.
