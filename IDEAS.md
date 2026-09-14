# Caret — Bugs & Ideas

A review of the codebase as of v0.4.1 (2026-09-13). Part 1 was a bug list from reading every file in `src/`; every entry has since been fixed (with unit tests — `npm test`) and removed. Part 2 is the remaining feature backlog, roughly ordered by value-for-effort; the quick wins, Claude Code integration and editor items have shipped.

---

## Part 1 — Bugs found

_No open bugs. (The v0.4.1 review list and the two 2026-09-14 markdown reports — blockquote markers, Preview ⇄ Source position — are fixed.)_

---

## Part 2 — Feature ideas

### Quick wins & Claude Code integration

_Shipped in 0.4.2 (items 1–18 of the original list): close/quit guard, overlay-aware preview detach, terminal commands (⌘⇧W / ⌘⇧] / ⌘⇧[ / ⌃` / ⌘⇧E), ⌘-click terminal links, restart exited shells, Save All / Revert + unsaved badge, Find / Go to Line commands, copy path / @file menus, zoom, device widths, Claude session status + notification, Send to Claude (⌘⇧C), console → Claude, diff-aware tree + gutter diff, quick diff (⌘⇧D), session picker / resume, prompt scratchpad (⌘⇧N), package.json scripts + dev-server auto-open._

### Editor

_Shipped in 0.6.0 (items 19–28): find in project (⌘⇧F), go to symbol (⌘⇧O) and `:`/`@`/`#` palette prefixes with recent commands first, editor options as settings, Prettier (format document / on save, project config else the global config in Settings), 40+ languages + highlighted fenced blocks, markdown relative links / Mermaid / table Tab / paste-image, image·SVG·PDF viewer tabs, breadcrumbs + auto-reveal, encoding + EOL awareness, atomic saves._

### File tree

_Shipped in 0.6.0 (items 29–33): drag-and-drop move within the tree (and drop rows on a terminal to type their paths), Finder drops that move (⌥: copy) into the hovered folder, multi-select with bulk trash / copy paths / send to Claude, type-to-filter + collapse all, Duplicate / New file from template / Open in default app, show-ignored and dotfiles toggles, right-click anywhere for New File / New Folder / Reveal._

### Browser preview

_Shipped in 0.6.0 (items 35–39): "use as default URL" from the chrome, screenshot to clipboard / to Claude, offline & 3G throttling, clear cookies & site data, scroll position kept across reloads, "reload on save" toggle, in-app console drawer (all levels, per-row → Claude)._

### Terminal

_Shipped in 0.6.0 (items 40–44): search (⌘F), Unicode 11 + inline images, vertical splits and terminals in the editor area, font / cursor / scrollback settings + ⓘ info popover, broadcast input, zsh shell integration (OSC 133: ⌘↑/⌘↓ between commands, ⌘⇧R rerun last, failed commands marked)._

### Workspace, windows, app

46. **Named workspaces / project groups** on the Welcome screen, pinning, and "remove from recents".
47. **Multi-root awareness**: open a sibling folder as a second tree section (many projects are `frontend/` + `backend/`).
48. **Auto-update** via `electron-updater` from the existing GitHub Releases pipeline; needs signing + notarisation, which `electron-builder.yml` is already structured for.
49. **Menu bar completeness**: File → New File/Folder, Save, Save All, Close Tab; View → Toggle panels, Zoom, Appearance; Terminal → New/Split/Clear; Go → File, Symbol, Line. Menus double as discoverable, native-feeling shortcut docs.
50. **Command palette upgrades**: recent commands first, `:` prefix for go-to-line, `@` for symbols, `#` for project search, and showing *all* chords for a command.
51. **Themes**: a handful of bundled palettes (One Dark, Solarized, GitHub) mapped to the `ink-*` variables + Monaco + xterm in one place (`lib/theme.ts` already centralises this), and a custom-theme JSON in settings.
52. **Settings search box** and a per-project `.caret/settings.json` override layer.
53. **Keybinding import** from VS Code `keybindings.json` (the chord format is nearly identical).
54. **Intel build** (spec says Apple Silicon + Intel; only arm64 ships) via a `universal` target in `electron-builder.yml`.
55. **Crash-report "Copy as Markdown"** button in Diagnostics for pasting into issues, and a "Report this" link that opens a pre-filled GitHub issue.

### Performance / robustness

56. **Batch the git status polling**: one `git status` per 8 s is fine, but the 400 ms fs-change debounce should coalesce across bursts (Claude writes many files quickly) with a trailing-only timer and a max rate of ~1/s.
59. **Virtualised file tree** (large repos) and lazy `git check-ignore` (skip for dirs already known ignored).
