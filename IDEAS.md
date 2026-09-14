# Caret — Bugs & Ideas

A review of the codebase as of v0.4.1 (2026-09-13). Part 1 was a bug list from reading every file in `src/`; every entry has since been fixed (with unit tests — `npm test`) and removed. Part 2 is the remaining feature backlog, roughly ordered by value-for-effort; the quick wins and Claude Code integration items have shipped.

---

## Part 1 — Bugs found

_All v0.4.1 review bugs are fixed. New reports below (2026-09-14)._

1. **Blockquotes render as raw source in markdown Preview.** A file whose body is one long `> ` quoted block (e.g. an email pasted into a `.md`) shows every `>` marker, the blank `>` lines, and the `**bold**` / `` `code` `` markers in Preview, so it looks like Source mode in a proportional font and the user can't tell which mode they're in (screenshot: Sift SSO/Keycloak setup doc). Causes in `cm/livePreview.ts`: `QuoteMark` is not in `MARKER_NODES`, so the `>` is never hidden and only the `cm-blockquote` left border + muted colour is applied; verify why the inline `**` markers also stay visible inside the quote (nested `StrongEmphasis` under `Blockquote` / `Paragraph` should still hit the `EmphasisMark` branch — check whether a multi-line selection is making `nodeActive` reveal them, or whether the parser emits different node names inside quotes). Fix: hide `QuoteMark` (plus its trailing space) on non-active lines like `HeaderMark`, keep the border, and add a `setup.test.ts` case for a quoted paragraph with bold and inline code.
2. **Toggling Preview ⇄ Source loses the scroll position (and caret).** `MarkdownTabView` in `EditorView.tsx` unmounts one editor and mounts the other, and nothing is carried across: Monaco's `saveViewState` is only used when switching tabs, and the CodeMirror side has no equivalent. Fix: on `choose()` read the first visible line (+ caret line/col) from the outgoing editor and, once the incoming one mounts, scroll that line to the top and restore the caret (`revealLineNearTop` / `scrollIntoView`). Line-based mapping is enough since both editors share the same buffer; store it in `editorModels` file meta next to `previewMode` so it also survives a tab switch mid-toggle.

---

## Part 2 — Feature ideas

### Quick wins & Claude Code integration

_Shipped in 0.4.2 (items 1–18 of the original list): close/quit guard, overlay-aware preview detach, terminal commands (⌘⇧W / ⌘⇧] / ⌘⇧[ / ⌃` / ⌘⇧E), ⌘-click terminal links, restart exited shells, Save All / Revert + unsaved badge, Find / Go to Line commands, copy path / @file menus, zoom, device widths, Claude session status + notification, Send to Claude (⌘⇧C), console → Claude, diff-aware tree + gutter diff, quick diff (⌘⇧D), session picker / resume, prompt scratchpad (⌘⇧N), package.json scripts + dev-server auto-open._

### Editor

19. **Find-in-project** (⌘⇧F): `git grep -n` / ripgrep via IPC, results in a palette-style list, click → open at line. The palette infrastructure and `listFiles` already exist.
20. **Go to symbol in file** (⌘⇧O) using Monaco's document symbol provider for TS/JS/CSS/JSON.
21. **Multi-cursor / column select, bracket-pair colouring, sticky scroll, minimap toggle** as settings; most are one Monaco option each.
22. **Prettier support — format on save and format document.**
    - **Commands**: `Format Document` (⇧⌥F) and a `formatOnSave` setting (global default in `settings.json`, overridable per project). Both run through a new `fmt:format` IPC so main does the work and the renderer never spawns processes.
    - **Resolution order** in main: the project's own `node_modules/prettier` (load it in-process via `createRequire(root)` so plugins and the project's exact version are honoured) → a bundled fallback Prettier for projects without one → skip with a status-bar hint if neither applies. Respect `.prettierrc*`, `prettier` key in `package.json`, `.editorconfig`, and `.prettierignore` via `prettier.resolveConfig` / `getFileInfo`; if `ignored` is true, do nothing.
    - **Apply as an edit, not a replace**: run Prettier on the buffer text, then push the result through `model.pushEditOperations` (Monaco) or a single `dispatch` (CodeMirror) so undo history, cursor and scroll survive, and the tab stays dirty-consistent. Use `formatWithCursor` so the caret lands in the right place.
    - **Save flow**: on ⌘S with `formatOnSave` on, format → write → set baseline, so the disk always holds formatted output. Errors (syntax error, missing parser) show a non-blocking bar like the disk-conflict one and still save the unformatted text.
    - **Languages**: whatever Prettier's inferred parser covers (TS/JS/JSX/TSX, JSON, CSS/SCSS/LESS, HTML, Markdown, YAML, GraphQL) — inferred from the file path by Prettier itself, not `languageForPath`.
    - **Safety**: run with a timeout, cap file size (e.g. 1 MB), never format when a disk conflict is pending, and never touch files outside the project root (existing `assertInsideRoot`).
    - **Nice-to-haves**: a "prettier" indicator in the status bar (version + whether the file is ignored), "Format Selection", and a `formatOnSave.languages` allowlist for people who only want it on TS/CSS.
23. **More languages**: YAML, TOML, shell, Dockerfile, SQL, Python, Go, Rust, GraphQL, Svelte/Vue (`.vue` as HTML). Monaco ships most Monarch grammars; only `languageForPath` needs extending. Also CM6 `codeLanguages` for fenced blocks in markdown preview.
24. **Markdown extras**: relative-link navigation (open `./docs/x.md` in a tab), Mermaid fenced blocks rendered as a widget, table editing helpers (Tab to next cell), outline sidebar from headings, paste-image-to-`assets/`.
25. **Image / SVG / PDF viewer tabs** instead of "Binary file not shown" (`readDataUrl` already exists).
26. **Editor breadcrumbs + "reveal active file in tree"** (auto-reveal on tab switch).
27. **Encoding + EOL awareness** (detect CRLF/BOM, show in status bar, preserve on save; fixes bug #22).
28. **Atomic saves** (write temp + rename) so a crash mid-write can't truncate a file, and preserve file mode.

### File tree

29. **Drag-and-drop move/copy within the tree** and drag a file onto a terminal to insert its path (terminal side exists; tree side doesn't).
30. **Multi-select** (⌘/⇧-click) for bulk trash / copy paths / send to Claude.
31. **Filter box** (type-to-filter) and **collapse all**.
32. **Duplicate, New file from template, Open in default app** in the context menu.
33. **`.gitignore`-aware "show ignored" toggle** and a **dotfiles** toggle.

### Browser preview

35. **Per-project default URL editable from the chrome** (it's in `WorkspaceState` but there's no UI to change it).
36. **Responsive/device toolbar** (#10), **screenshot to clipboard / to Claude** (`webContents.capturePage`), **throttle/offline toggles**, **clear site data**.
37. **Hot-reload friendliness**: keep scroll position across reloads; a "reload on save" toggle for projects without HMR.
38. **Console drawer** in the app's own DOM (from `console-message`) as a lighter alternative to full DevTools, with a "send to Claude" button (#13).
39. **Separate session partition** for the preview with a "clear cookies" action (also fixes #13's permissions).

### Terminal

40. **Web links, search (⌘F in terminal), Unicode-11 and image addons** from the xterm addon set.
41. **Split terminals vertically as well as horizontally**, and drag a terminal tab into the center panel (for a full-height Claude session next to an editor).
42. **Font size / family / cursor style / scrollback settings** and per-terminal **ⓘ info popover** (pid, cwd, foreground).
43. **Broadcast input** to all terminals (rare but handy for monorepos).
44. **Shell integration** (OSC 133) for command-boundary navigation and "rerun last command".

### Workspace, windows, app

45. **Persist split state, hidden panes, active terminal, scroll positions, cursor positions** (bug #12, #19).
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
57. **Batch foreground polling** into one `ps` for all pty pids (bug #24).
58. **Dispose per-window resources on renderer reload** (bug #10).
59. **Virtualised file tree** (large repos) and lazy `git check-ignore` (skip for dirs already known ignored).
60. **Smoke test in CI**: the `SMOKE_TEST=1` flow exists but isn't run by the release workflow; add it as a job before building the DMG.
