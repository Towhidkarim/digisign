# Using this folder

Commit it to your repo, for example as `docs/design-system/`. Keep `DESIGN.md` copied (or symlinked) at the repo root and add this line to `CLAUDE.md`:

    Read DESIGN.md before any UI work and follow it.

- `README.md` is the brand book (principles, voice, visual rules, status system).
- `DESIGN.md` is the build guide for Claude Code, including the paste-ready CSS for `src/styles.css`.
- `tokens.json` is the source of truth for values. `tokens.css` is generated from it.
- `components/` holds the guidelines and a live HTML preview for each documented component.
- `index.html` is a local viewer (light and dark). Opening it from disk shows everything except the color swatches; run `npx serve docs/design-system` to see those too.

When a value changes, edit `tokens.json`, regenerate `tokens.css`, and update the CSS block in `src/styles.css`.
