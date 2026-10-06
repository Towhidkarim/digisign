# DigiSign design guide (DESIGN.md)

Read this before building or changing any UI in this project. It is the source of truth for look and feel. Stack: TanStack Start, React 19, Tailwind v4 (CSS config in `src/styles.css`), shadcn/ui (new-york), Poppins. The brand blue is the existing harbor blue; neutrals and status colors are refined.

DigiSign sends a PDF through a fixed order of signers and keeps a record in the finished file that anyone can verify without an account. The interface should feel like a calm, well-kept desk.

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

## Do and don't

- Do give each screen exactly one primary `brand` button. Don't place two.
- Do use the shared `Button`, `Input`, `Dialog`, `Tabs`, `Alert` and toast components. Don't write raw `<button>` with ad hoc classes.
- Do show empty, loading and error states for every list and every route.
- Do keep tap targets at 44px on the signer flow. Don't rely on hover for anything a signer needs.
- Don't use gradients, glass effects, or emoji as icons.
- Don't invent testimonials, customer names, pricing or statistics in the UI.

## Tokens

Use only semantic names in components (`bg-card`, `text-muted-foreground`, `text-success-fg`, `bg-brand-bg`). Never `text-[var(--harbor)]`, raw hex, or `bg-white`.

### Colors

| Token | Light | Dark | Usage |
| --- | --- | --- | --- |
| `bg` | `#f5f8fa` | `#08202f` | Page background (the desk). Cool, near-white; never pure white so white surfaces lift off it. |
| `surface` | `#ffffff` | `#0e2c3e` | Cards, tables, popovers, modals, the PDF page frame. Maps to shadcn --card and --popover. |
| `surface-subtle` | `#edf3f7` | `#143a50` | Hover rows, table headers, sidebar active item, inset wells. Never text-bearing beyond ink-muted. |
| `border` | `#dbe6ee` | `#1e4a66` | Decorative hairlines: card edges, row dividers, separators. Not for control edges. |
| `border-control` | `#73909f` | `#5f8aa5` | Edges of inputs, checkboxes, switches and unfilled buttons. 3:1 against surface and bg. |
| `ink` | `#10303f` | `#e9f5fc` | Primary text and icons. Harbor ink; 13:1 on surface. |
| `ink-muted` | `#456072` | `#b4cfe0` | Secondary text: descriptions, table meta, helper text. 6:1 on surface. |
| `ink-subtle` | `#5a7184` | `#8fb0c6` | Tertiary text: timestamps, placeholders, captions. Lowest allowed text color; 4.5:1 on surface and bg. |
| `brand` | `#1a7cb5` | `#6ab8e6` | Harbor blue. Primary buttons, links, focus, selected state, progress. White text on it passes 4.5:1 in light. |
| `brand-hover` | `#156a9a` | `#8fcdf0` | Hover and pressed state of brand fills. |
| `on-brand` | `#ffffff` | `#06202f` | Text and icons placed on a brand fill. |
| `brand-bg` | `#e3f2fa` | `#12425d` | Tint for 'Out for signature' badges, selected rows, info callouts. |
| `brand-fg` | `#0e5a85` | `#a9dcf6` | Text and icons on brand-bg. 6.5:1. |
| `brand-soft` | `#9fd0ea` | `#2f6f94` | Decorative mid-tint: progress tracks, illustration fields, covers. Never carries text. |
| `success` | `#1d7a4b` | `#5fcf94` | Completed. Solid for icons, dots and check marks. |
| `success-bg` | `#e2f4ea` | `#12402b` | Tint for Completed badges and success callouts. |
| `success-fg` | `#14603a` | `#9be5bd` | Text and icons on success-bg. |
| `warning` | `#a35f00` | `#f0b13d` | Expired, expiring soon, needs attention. Solid for icons and dots. |
| `warning-bg` | `#fcf0d9` | `#4a3410` | Tint for Expired badges and warning callouts. |
| `warning-fg` | `#7a4700` | `#f7cf86` | Text and icons on warning-bg. |
| `danger` | `#b3332c` | `#f08b83` | Declined, errors, destructive actions. Solid for icons, destructive buttons, field errors. |
| `danger-bg` | `#fbe9e7` | `#4d1f1c` | Tint for Declined badges and error callouts. |
| `danger-fg` | `#8f2620` | `#f7b8b2` | Text and icons on danger-bg. |
| `neutral` | `#5a7184` | `#8fb0c6` | Draft and Voided. Solid for icons and dots. |
| `neutral-bg` | `#e8eff4` | `#1b3f55` | Tint for Draft and Voided badges. |
| `neutral-fg` | `#3b5365` | `#c3d9e8` | Text and icons on neutral-bg. |
| `scrim` | `rgba(16,48,63,0.45)` | `rgba(2,12,18,0.65)` | Backdrop behind modals, sheets and the signature capture dialog. |
| `signer-1` | `#c8561a` | `#f08a52` | Signer identity color 1 (orange). Fields, rail dot and row accent for that signer; always paired with the signer's name or initials. |
| `signer-2` | `#0b8a6a` | `#3cc9a0` | Signer identity color 2 (teal-green). |
| `signer-3` | `#b8467f` | `#e58ab8` | Signer identity color 3 (rose). |
| `signer-4` | `#9a6a00` | `#e0b04a` | Signer identity color 4 (ochre). |
| `signer-5` | `#6a4bc4` | `#a58cf0` | Signer identity color 5 (violet). |
| `signer-6` | `#4f6d7a` | `#9db8c6` | Signer identity color 6 (slate). Signer colors 7 to 10 in code (editor/reducer.ts) should be re-picked to stay clear of brand blue. |

### Type (Poppins only)

| Style | Size / line | Weight | Usage |
| --- | --- | --- | --- |
| `display` | 36px / 44px | 600 | Landing headline only. |
| `title` | 26px / 34px | 600 | Page title (h1). One per page. Replaces the copy-pasted clamp(1.7rem,3vw,2.1rem). |
| `heading` | 18px / 26px | 600 | Section and card headings (h2). |
| `subheading` | 15px / 22px | 600 | Row titles, dialog titles, form group labels (h3). |
| `body` | 14px / 22px | 400 | Default UI and paragraph text. |
| `body-strong` | 14px / 22px | 500 | Emphasis inside body text, button labels, table cells that name something. |
| `small` | 13px / 20px | 400 | Secondary text, helper text, table meta. |
| `caption` | 12px / 16px | 500 | Badges, timestamps, field labels in the editor. Minimum text size in the product. |
| `overline` | 11px / 16px | 600 | Uppercase group labels in the sidebar and activity log. Use sparingly. |

### Spacing (4px base)

| Token | Value | Usage |
| --- | --- | --- |
| `space-1` | 4px | Icon to label inside a badge. |
| `space-2` | 8px | Gap between tightly related items; button icon gap. |
| `space-3` | 12px | Control inner padding (vertical), row gaps. |
| `space-4` | 16px | Control inner padding (horizontal), mobile page gutter, default stack gap. |
| `space-5` | 20px | Card padding. |
| `space-6` | 24px | Large card padding, desktop page gutter, section gap. |
| `space-8` | 32px | Between page sections. |
| `space-10` | 40px | Page top padding on desktop. |
| `space-12` | 48px | Empty-state vertical padding. |
| `space-16` | 64px | Landing page section spacing. |

### Radius

| Token | Value | Usage |
| --- | --- | --- |
| `radius-sm` | 6px | Badges, checkboxes, small chips, tooltips. |
| `radius-md` | 8px | Buttons, inputs, selects, rows. Default control radius. |
| `radius-lg` | 12px | Cards, document sheets, popovers. Replaces rounded-[0.9rem]. |
| `radius-xl` | 16px | Modals, bottom sheets, the signature capture dialog. Replaces rounded-2xl. |
| `radius-full` | 9999px | Status dots, avatars, signer color dots, pill toggles. |

## Paste-ready CSS for `src/styles.css`

Replace the existing `:root`, `.dark` and `@theme inline` blocks with this. Keep the font `@import`, `@import "tailwindcss"`, the typography plugin, `tw-animate-css`, and the `@custom-variant dark` line. Then search for the old alias variables (`--desk`, `--paper`, `--ink`, `--harbor`, `--still`, `--tide`, `--line`, `--harbor-deep`) and replace each usage with the semantic token; delete the aliases once nothing references them. Dark mode needs a theme provider that toggles `.dark` on `<html>` and respects `prefers-color-scheme`.

```css
:root {
	--radius: 0.5rem;
	--background: #f5f8fa;
	--foreground: #10303f;
	--card: #ffffff;
	--card-foreground: #10303f;
	--popover: #ffffff;
	--popover-foreground: #10303f;
	--primary: #1a7cb5;
	--primary-foreground: #ffffff;
	--secondary: #edf3f7;
	--secondary-foreground: #10303f;
	--muted: #edf3f7;
	--muted-foreground: #456072;
	--accent: #edf3f7;
	--accent-foreground: #10303f;
	--destructive: #b3332c;
	--border: #dbe6ee;
	--input: #73909f;
	--ring: #1a7cb5;
	--sidebar: #ffffff;
	--sidebar-foreground: #10303f;
	--sidebar-primary: #1a7cb5;
	--sidebar-primary-foreground: #ffffff;
	--sidebar-accent: #e3f2fa;
	--sidebar-accent-foreground: #0e5a85;
	--sidebar-border: #dbe6ee;
	--sidebar-ring: #1a7cb5;
	--destructive-foreground: #ffffff;
	--ink-subtle: #5a7184;
	--brand-hover: #156a9a;
	--brand-bg: #e3f2fa;
	--brand-fg: #0e5a85;
	--brand-soft: #9fd0ea;
	--success: #1d7a4b;
	--success-bg: #e2f4ea;
	--success-fg: #14603a;
	--warning: #a35f00;
	--warning-bg: #fcf0d9;
	--warning-fg: #7a4700;
	--danger-bg: #fbe9e7;
	--danger-fg: #8f2620;
	--neutral: #5a7184;
	--neutral-bg: #e8eff4;
	--neutral-fg: #3b5365;
	--scrim: rgba(16,48,63,0.45);
	--signer-1: #c8561a;
	--signer-2: #0b8a6a;
	--signer-3: #b8467f;
	--signer-4: #9a6a00;
	--signer-5: #6a4bc4;
	--signer-6: #4f6d7a;
	--shadow-sm: 0 1px 2px rgba(16,48,63,0.06);
	--shadow-md: 0 4px 16px rgba(16,48,63,0.10);
	--shadow-lg: 0 12px 40px rgba(16,48,63,0.18);
}

.dark {
	--background: #08202f;
	--foreground: #e9f5fc;
	--card: #0e2c3e;
	--card-foreground: #e9f5fc;
	--popover: #0e2c3e;
	--popover-foreground: #e9f5fc;
	--primary: #6ab8e6;
	--primary-foreground: #06202f;
	--secondary: #143a50;
	--secondary-foreground: #e9f5fc;
	--muted: #143a50;
	--muted-foreground: #b4cfe0;
	--accent: #143a50;
	--accent-foreground: #e9f5fc;
	--destructive: #f08b83;
	--border: #1e4a66;
	--input: #5f8aa5;
	--ring: #6ab8e6;
	--sidebar: #0e2c3e;
	--sidebar-foreground: #e9f5fc;
	--sidebar-primary: #6ab8e6;
	--sidebar-primary-foreground: #06202f;
	--sidebar-accent: #12425d;
	--sidebar-accent-foreground: #a9dcf6;
	--sidebar-border: #1e4a66;
	--sidebar-ring: #6ab8e6;
	--destructive-foreground: #06202f;
	--ink-subtle: #8fb0c6;
	--brand-hover: #8fcdf0;
	--brand-bg: #12425d;
	--brand-fg: #a9dcf6;
	--brand-soft: #2f6f94;
	--success: #5fcf94;
	--success-bg: #12402b;
	--success-fg: #9be5bd;
	--warning: #f0b13d;
	--warning-bg: #4a3410;
	--warning-fg: #f7cf86;
	--danger-bg: #4d1f1c;
	--danger-fg: #f7b8b2;
	--neutral: #8fb0c6;
	--neutral-bg: #1b3f55;
	--neutral-fg: #c3d9e8;
	--scrim: rgba(2,12,18,0.65);
	--signer-1: #f08a52;
	--signer-2: #3cc9a0;
	--signer-3: #e58ab8;
	--signer-4: #e0b04a;
	--signer-5: #a58cf0;
	--signer-6: #9db8c6;
	--shadow-sm: 0 1px 2px rgba(0,0,0,0.4);
	--shadow-md: 0 4px 16px rgba(0,0,0,0.5);
	--shadow-lg: 0 12px 40px rgba(0,0,0,0.6);
}

@theme inline {
	--font-sans: "Poppins", ui-sans-serif, system-ui, sans-serif;
	--color-background: var(--background);
	--color-foreground: var(--foreground);
	--color-card: var(--card);
	--color-card-foreground: var(--card-foreground);
	--color-popover: var(--popover);
	--color-popover-foreground: var(--popover-foreground);
	--color-primary: var(--primary);
	--color-primary-foreground: var(--primary-foreground);
	--color-secondary: var(--secondary);
	--color-secondary-foreground: var(--secondary-foreground);
	--color-muted: var(--muted);
	--color-muted-foreground: var(--muted-foreground);
	--color-accent: var(--accent);
	--color-accent-foreground: var(--accent-foreground);
	--color-destructive: var(--destructive);
	--color-destructive-foreground: var(--destructive-foreground);
	--color-border: var(--border);
	--color-input: var(--input);
	--color-ring: var(--ring);
	--color-sidebar: var(--sidebar);
	--color-sidebar-foreground: var(--sidebar-foreground);
	--color-sidebar-primary: var(--sidebar-primary);
	--color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
	--color-sidebar-accent: var(--sidebar-accent);
	--color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
	--color-sidebar-border: var(--sidebar-border);
	--color-sidebar-ring: var(--sidebar-ring);
	--color-ink-subtle: var(--ink-subtle);
	--color-brand-hover: var(--brand-hover);
	--color-brand-bg: var(--brand-bg);
	--color-brand-fg: var(--brand-fg);
	--color-brand-soft: var(--brand-soft);
	--color-success: var(--success);
	--color-success-bg: var(--success-bg);
	--color-success-fg: var(--success-fg);
	--color-warning: var(--warning);
	--color-warning-bg: var(--warning-bg);
	--color-warning-fg: var(--warning-fg);
	--color-danger-bg: var(--danger-bg);
	--color-danger-fg: var(--danger-fg);
	--color-neutral: var(--neutral);
	--color-neutral-bg: var(--neutral-bg);
	--color-neutral-fg: var(--neutral-fg);
	--color-scrim: var(--scrim);
	--color-signer-1: var(--signer-1);
	--color-signer-2: var(--signer-2);
	--color-signer-3: var(--signer-3);
	--color-signer-4: var(--signer-4);
	--color-signer-5: var(--signer-5);
	--color-signer-6: var(--signer-6);
	--radius-sm: 6px;
	--radius-md: 8px;
	--radius-lg: 12px;
	--radius-xl: 16px;
	--shadow-sm: var(--shadow-sm);
	--shadow-md: var(--shadow-md);
	--shadow-lg: var(--shadow-lg);
}
```

## Component rules

- **Button:** one shadcn `Button` everywhere. Variants: default (brand, one per view), outline (`border-input` on `bg-card`), ghost, destructive (outlined `danger`; solid only inside a confirmation dialog). Height 40px default, 32px dense, 44px on touch in the signer flow. No raw `<button>` with ad hoc classes.
- **StatusBadge:** one component, six states (Draft, Out for signature, Completed, Declined, Voided, Expired), 24px tall, `radius-full`, icon plus label, using the `-bg` fill and `-fg` text of each status set. Draft and Voided use `neutral`; Expired uses `warning`; Declined uses `danger`; Completed uses `success`; Out for signature uses `brand`.
- **DocumentRow:** file icon tile, title (15px/600), one meta line (who it is waiting on), segmented progress (one segment per signer, filled with `brand` when signed, `brand-soft` otherwise), StatusBadge, relative date, chevron. Whole row is one link. Min height 72px, `surface-subtle` on hover.
- **Cards:** `bg-card border border-border rounded-lg`, no shadow by default. Padding `space-5` or `space-6`.
- **Dialogs and sheets:** use shadcn `Dialog`/`Sheet`/`AlertDialog` (the signature capture modal must become a real dialog with focus trap, Escape, and aria semantics; Draw/Type must be real tabs). Radius `radius-xl`, backdrop `scrim`.
- **Alerts and toasts:** add shadcn `Alert` and a toast (Sonner). Every error shows what to do next and offers Try again. Replace bare red `<p>` errors.
- **Inputs:** use shadcn `Input`, `Textarea`, `Select`, `Checkbox`. Replace raw `<select>`, `<textarea>`, and the consent `<input type="checkbox">`.
- **Signer color:** `signer-1` to `signer-6` mark a signer on fields and the signer list. Always beside a name or initials. Re-pick colors 7 to 10 in `editor/reducer.ts` so none sit near brand blue.
- **Icons:** Lucide only (`lucide-react`), 1.75 stroke, 16px inline, 20px in navigation. Remove HugeIcons (`components.json` already says `lucide`).

## Layout

- App shell: left sidebar 248px (Dashboard, Documents, Check a PDF; user and sign out at the bottom), collapsing to a sheet below 768px. Content column `max-w-[960px]` for lists and detail pages, `max-w-3xl` for forms. Gutters 16 / 24 / 32px.
- Page header: one `title` h1, a muted one-line subtitle, and at most one primary button on the right.
- Dashboard: greeting, four-cell overview strip (Out for signature, Drafts, Completed, Needs attention), then a card with filter tabs, search, and up to 6 DocumentRows with a footer link to all documents.
- Document detail: breadcrumb back to Documents, title with StatusBadge, a status callout (`brand-bg`) stating who it is waiting on and holding "Copy new signing link" (explain that it revokes the old link), then a two-column layout: signing order stepper plus activity on the left, details plus verification note on the right. Header actions: "Download original" (outline) and "Void document" (ghost, danger text). After completion, "Download signed PDF" becomes the primary action.
- Signer flow and verify page use the same logo, header and tokens as the app. Mobile first: 44px tap targets, a visible "n fields left" progress, no hover-only controls.

## Known issues to fix while restyling

1. Owner "Download PDF" on a completed document links to the source PDF. It should offer the signed PDF.
2. `/sign` error state links to "Prepare a document"; replace with a signer-appropriate message.
3. `/documents/$id` errors are a bare `<p role="alert">`; add retry and back link.
4. Two `cn` sources (`cn` package and `#/lib/utils`); keep only `#/lib/utils`.
5. Unused `SiteHeader` and `BetterAuthHeader`; delete.
6. Verify page and dev page still use legacy `.sheet` / `.wordmark` styles; migrate verify to the shared components.
7. Unify the three logo/header implementations into one `Logo` and one header component.

## Process rules for Claude Code

- Work one screen at a time and commit after each. Run `pnpm build` and `pnpm check:bundle` after route or heavy-dependency changes; keep PDF libraries out of the Worker bundle (use `lazyDesk`).
- Do not add features, routes or data fields while restyling. If a design shows something that does not exist yet (dashboard filters, search, "Needs attention" count), render it as a non-functional placeholder or ask first.
- Never invent testimonials, customer names, pricing or statistics.
