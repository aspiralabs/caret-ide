# Caret — Bugs & Ideas

A review of the codebase as of v0.4.1 (2026-09-13). Part 1 is a bug list from reading every file in `src/` (confirmed by code inspection unless marked *likely*). Part 2 is a feature backlog, roughly ordered by value-for-effort.

---

## Part 1 — Bugs found

### High

### Medium

15. **Session watcher can watch all of `~/.claude/projects` forever.**
    If the project's session dir doesn't exist at boot, chokidar watches the whole projects root with `depth: 2` (every other project's `.jsonl` files) and never narrows once the dir appears. Multiplied per window.
    → `src/main/ipc/session.ts:199`. Fix: watch the parent with `depth: 0` just to detect the dir's creation, then swap to a direct watcher.

16. **A brand-new Claude session inherits the previous session's title.**
    On the first `add` of a new `.jsonl`, `titleFromIndex` still returns the index's newest *existing* summary, so a fresh `claude` tab is briefly labelled with the last session's name until the new one gets its own summary.
    → `session.ts` (`emitUpdate`). Fix: only apply a title whose `sessionId` is newer than what the tab already showed, or compare the jsonl's mtime with the terminal's start time.

### Low / polish

24. **Foreground polling spawns two `ps` processes per terminal every 3 s.** One `ps -o tpgid=,comm= -p <all shell pids>` batched across terminals would do.
---

## Part 2 — Feature ideas

### Quick wins (a day or less each)

1. **Unsaved-changes guard on window close and quit** (fixes bug #3). Reuse the 3-button dialog; "Save All" for multiple dirty tabs.
2. **Overlay-aware browser detach** (fixes bug #4): one `useOverlayStore` counter, incremented by any modal/menu/tooltip that can overlap the center panel.
3. **Context-aware ⌘W and terminal shortcuts.** ⌘W closes the terminal tab when a terminal has focus; add `close-terminal`, `next/prev terminal` (⌘⇧] / ⌘⇧[), `focus terminal` (⌘`) and `focus editor` commands to the registry so they're rebindable.
4. **"Open in browser tab" for `localhost` URLs printed in the terminal.** xterm's web-links addon (`@xterm/addon-web-links`) makes `http://localhost:5173` clickable → opens/focuses a browser tab. Dev servers print this on every start; it's the #1 friction in a Claude-driven workflow.
5. **Restart exited shells.** An "exited" terminal pane should accept Enter/click to respawn a pty in place instead of forcing close + ⌘D.
6. **Save All / Revert File commands**, plus a dirty-count badge on the center tab bar.
7. **Editor "go to line" (⌘G) and "find in file" surfaced as commands** with chord hints (Monaco has them; CM6 has `searchKeymap`).
8. **Copy path / Copy relative path / Copy `@file` reference** on tree and tab context menus. The relative-path form pastes straight into a Claude prompt.
9. **Zoom** (⌘+/−/0) for the UI and separately for the browser preview (`webContents.setZoomFactor`).
10. **Preview device sizes.** A width dropdown in the browser chrome (375 / 768 / 1024 / fluid) that letterboxes the `WebContentsView` — cheap because bounds are already computed in the renderer.

### Claude Code integration (the product's reason to exist)

11. **Claude session status in the terminal tab.** The foreground poll already knows a tab runs `claude`; add "thinking / waiting for input / idle" by watching the session `.jsonl` tail (last record type), and a subtle pulse on the tab. Combine with a **macOS notification** when a background Claude tab stops and needs input.
12. **"Send to Claude" from the editor.** Select text (or the whole file) → ⌘⇧C writes `@path#L10-L20` plus the snippet as a bracketed paste into the active Claude terminal, exactly like the browser element picker does today. Same for a tree node ("Add file to prompt").
13. **Console → Claude.** Capture `console-message` / uncaught errors from the preview `webContents` and offer "Send last error to Claude" in the browser chrome. Pairs naturally with the element picker.
14. **Diff-aware file tree.** The status bar already parses porcelain v2 per file; colour tree rows (modified / untracked / staged) and add a "Changes" section at the top that lists what Claude just touched, with click-to-open. Extend to an inline **gutter diff** in Monaco against HEAD (`git show HEAD:path` via IPC, `IModelDeltaDecoration`).
15. **Quick diff / review view.** ⌘⇧D on a modified file opens a side-by-side Monaco `DiffEditor` (HEAD vs working tree) — the natural way to review Claude's edits without leaving the IDE.
16. **Session picker on the terminal "+" menu.** Read `sessions-index.json` and offer "New Claude session" / "Resume <summary>" which spawns `claude --resume <id>`; also fixes the fallback-title ambiguity (bug #16) since the tab knows its `sessionId` from birth.
17. **Prompt scratchpad tab.** A markdown center tab (`.caret/prompts.md`, git-ignored) with a "send selection to Claude" button, so long prompts aren't composed in a 2-line terminal input.
18. **Run tasks from `package.json`.** A ▶ menu in the terminal header listing `scripts`; each runs in a new named tab (`dev`, `test`…) with the port auto-detected and a browser tab opened when `localhost:<port>` appears.

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

34. **Auto-open the dev server.** Watch terminal output for `localhost:\d+` / `Local: http://…` and offer a toast "Open http://localhost:5173 ▸".
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
