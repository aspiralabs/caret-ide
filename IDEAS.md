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

_Shipped in 0.6.0 (items 46–55): welcome-screen pinning / groups / remove, multi-root workspaces, GitHub release update check (in-place auto-update needs a signed build), full menu bar built from the command registry, palette prefixes, bundled themes + custom palettes, settings search + per-project `.caret/settings.json`, VS Code keybinding import, Intel (x64) DMG, crash report → Markdown / GitHub issue._

### Performance / robustness

_Shipped in 0.6.0 (items 56–60): rate-limited git status refresh, batched foreground polling, resource disposal on reload, virtualised file tree + lazy check-ignore, smoke test in CI._
