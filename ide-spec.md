# Project Spec: Slim Electron IDE for macOS

A minimal, three-panel IDE for working on web projects with Claude Code. One window per project. File browser on the left, tabbed editor/browser center, tabbed terminal panel on the right.

---

## 1. Goals & Non-Goals

### Goals
- Fast, slim, single-purpose IDE: edit files, preview a local dev server in an embedded Chromium view, and run Claude Code (and other CLI tools) in real terminal sessions.
- One window == one project (a project is a folder on disk).
- All three panels independently toggleable.
- Terminal tabs that stay in sync with Claude Code session names (including after `/rename`).

### Non-Goals (v1)
- No extension/plugin system.
- No LSP integration beyond what Monaco provides out of the box (its built-in TS/JS intelligence is sufficient).
- No git UI (status bar indicator at most; git happens in the terminal).
- No settings UI (a JSON config file is fine).
- No Windows/Linux support. macOS only (Apple Silicon + Intel).

---

## 2. Tech Stack

| Concern | Choice | Notes |
|---|---|---|
| Shell | Electron (latest stable) | Chromium preview comes for free |
| Scaffold | electron-vite | Main/preload/renderer split with HMR |
| UI | React + TypeScript + TailwindCSS | |
| State | Zustand | One store per domain: layout, tabs, files, terminals |
| Panels/layout | react-resizable-panels | Persist sizes |
| Editor | Monaco via `@monaco-editor/react` | |
| Browser preview | Electron `WebContentsView` | See §5.3 — this is the trickiest integration |
| Terminal frontend | `@xterm/xterm` + fit addon | |
| Terminal backend | `node-pty` | Native module; needs electron-rebuild |
| FS watching | `chokidar` | Reload files changed on disk (Claude Code edits files underneath us) |
| Persistence | `electron-store` | Per-project workspace state, keyed by project path |
| Packaging | `electron-builder` | Unsigned OK for v1 |

---

## 3. Process Architecture

- **Main process** owns: window lifecycle, `WebContentsView` (browser preview), all `node-pty` instances, all filesystem access, chokidar watchers, electron-store.
- **Renderer** owns: all UI (file tree, Monaco, xterm.js instances, tabs, panel layout).
- **Preload** exposes a typed API surface (`window.ide.*`) via `contextBridge`. `contextIsolation: true`, `nodeIntegration: false`.

### IPC surface (indicative, not exhaustive)

```
fs.readDir(path) -> DirEntry[]
fs.readFile(path) -> { content, encoding }
fs.writeFile(path, content)
fs.watch(projectRoot) -> events: 'fs:changed' { path, kind }
pty.create({ cwd, cols, rows }) -> { ptyId }
pty.write(ptyId, data)
pty.resize(ptyId, cols, rows)
pty.kill(ptyId)
  events: 'pty:data' { ptyId, data }, 'pty:exit' { ptyId, code }
browser.setBounds(rect) / browser.show() / browser.hide()
browser.navigate(url) / browser.back() / browser.forward() / browser.reload()
browser.openDevTools()
  events: 'browser:did-navigate' { url }, 'browser:title-updated' { title }
workspace.getState() / workspace.saveState(state)
project.open() -> shows folder picker, opens new window
```

All IPC channels validated in main; renderer never receives raw fs paths outside the project root (path-traversal guard: resolve and verify every path is inside the project root).

---

## 4. Window & Project Model

- On launch with no state: show a minimal "Open Project…" screen (recent projects list + folder picker).
- Opening a folder creates a **new BrowserWindow** scoped to that folder. One window per project; opening an already-open project focuses its window.
- Window title: project folder name.
- Workspace state (per project path): open tabs + active tab, panel visibility + sizes, terminal tab labels, last browser URL, expanded file-tree nodes. Restored on reopen.

---

## 5. UI Layout

Three horizontal panels inside the window (below a slim title-bar area):

```
┌────────────┬───────────────────────────────┬──────────────────┐
│ File       │ Center (tabbed)               │ Terminal (tabbed)│
│ Browser    │ [ScoopLine ×] [file.ts ×] [+] │ [Dev][claude ×][+]│
│            │                               │                  │
│ (tree)     │  Browser view OR Monaco       │  xterm instance  │
│            │                               │                  │
└────────────┴───────────────────────────────┴──────────────────┘
```

### 5.1 Left panel — File Browser
- Lazy-loaded tree of the project folder. Directories expand on click; contents fetched on demand via `fs.readDir`.
- Single click on a file opens it as a **center-panel tab** (reuse an existing tab for the same path rather than duplicating).
- Respect a hardcoded ignore list for *watching* (`node_modules`, `.git`, `.next`, `dist`) but still *display* them in the tree (collapsed, never watched).
- Context menu (v1 minimal): New File, New Folder, Rename, Delete (moves to Trash via `shell.trashItem`), Reveal in Finder.
- File icons: simple extension-based mapping; no icon-theme system.
- Tree reacts to chokidar events (files created/deleted/renamed externally appear/disappear).

### 5.2 Center panel — Tabbed Editor/Browser
Tabs are heterogeneous: a tab is either
- **`browser` tab** — an embedded Chromium view with its own address bar. Any number of browser tabs may be open (e.g., app on :3000, Storybook on :6006, docs). "New browser tab" is a first-class action (toolbar `+` menu and shortcut), and each browser tab navigates independently.
- **`editor` tab** — a file open in Monaco.

Behavior:
- Tab bar at top: favicon/file-icon + label + close ×. Active tab highlighted. Middle-click closes. Drag to reorder.
- Editor tabs: label = filename; show a modified dot when the buffer is dirty; ⌘S saves. Prompt on closing a dirty tab.
- External changes: if chokidar reports a change to an open, **non-dirty** file, silently reload the buffer. If the file is dirty, show a non-blocking "File changed on disk — Reload / Keep mine" bar. (This is the common case when Claude Code edits an open file; it must feel seamless.)
- Monaco config: theme synced to a single app theme, TS/JS/TSX/JSON/CSS/MD highlighting, word wrap toggle, minimap off by default.

### 5.3 Browser tabs (the integration that needs care)
`WebContentsView` is rendered by the **main process** and floats above the renderer's DOM — it is not a DOM element. Main keeps a **pool of views keyed by tab id**; each browser tab owns exactly one view for its lifetime. Requirements:

- **At most one view visible at a time**: the view for the active center tab (if it's a browser tab) is attached and positioned; all other views are hidden. Switching tabs = hide old view, show new one. If the active center tab is an editor tab or the center panel is hidden, all views are hidden — otherwise a view will paint over the editor.
- The renderer renders a placeholder div for the browser content area and reports its bounding rect to main (`browser.setBounds(tabId, rect)`) on: panel resize, window resize, tab switch, panel toggle. Use a ResizeObserver; throttle to animation frames. Only the visible view's bounds need syncing; hidden views get their bounds updated on show.
- Browser chrome (rendered by us in the renderer, above the placeholder, per tab): back, forward, reload, editable URL bar, open-devtools button. New browser tabs default to `http://localhost:3000` (make the default configurable per project later). DevTools opens detached (`{ mode: 'detach' }`) so it doesn't fight the layout.
- Tab label = page title (from `browser:title-updated`), falling back to hostname:port.
- Views keep their session/state while hidden (don't destroy on tab switch; only on tab close). Each closed tab must destroy its view — leaking Chromium renderers is the memory bug to watch for.
- Links that request a new window (`target="_blank"`, `window.open`) open as a new browser tab in the center panel (intercept via `setWindowOpenHandler`) rather than a new OS window.
- **Memory note**: each view is a live Chromium renderer (~50–100MB+). No hard tab limit in v1, but don't preload/warm views, and destroy promptly on close.
- Escape hatch if `WebContentsView` bounds-syncing proves too fiddly during development: fall back to the `<webview>` tag (in-DOM, simpler layout, one per tab, slightly deprecated flavor). The IPC surface above should make this swap invisible to the rest of the app.

### 5.4 Right panel — Terminals
- Tab bar at top, same visual language as center tabs. `+` button spawns a new session (cwd = project root, shell = user's default via `/bin/zsh -l`).
- Each tab hosts one xterm.js instance bound to one pty. Fit addon keeps cols/rows synced to panel size; forward resizes to `pty.resize`.
- Closing a tab kills the pty. A pty exiting (shell exit, crash) marks the tab (e.g. dimmed + "exited") rather than vanishing it; user closes it.
- Terminal state is **not** restored across app restarts (dead ptys can't be resurrected); tab *labels* and count may be restored as fresh sessions if trivial, otherwise start with one fresh tab.
- Scrollback: 10k lines. ⌘K clears. Copy on select; ⌘V pastes.

---

## 6. Terminal Tab Naming & Claude Code `/rename`

**Goal:** when the user runs Claude Code in a terminal tab and renames the session (via `/rename`), the terminal tab's label follows the session name.

**Primary mechanism — OSC title sequences.** Terminal programs set tab/window titles by emitting `OSC 0/2 ; <title> BEL` escape sequences; xterm.js surfaces these via `terminal.onTitleChange`. Wire `onTitleChange` → update that tab's label in the Zustand store. This automatically gives us:
- shells that set titles (zsh precmd hooks show cwd/command),
- any CLI that sets a title, including Claude Code if/when it emits one.

**Investigation task (do this first, it de-risks the feature):** verify empirically whether the current Claude Code CLI emits an OSC title on session start and after `/rename`. Run `claude` inside a test harness that logs `onTitleChange` events.
- If yes → done; the primary mechanism covers it.
- If no or unreliable → **fallback mechanism:** watch Claude Code's session metadata on disk. Claude Code stores per-project session data under `~/.claude/projects/<encoded-project-path>/`. Watch that directory with chokidar; when session metadata changes, read the session title/name and apply it to the tab whose pty is running `claude`. Correlating pty ↔ session: use the most-recently-modified session file for ptys where we detected a `claude` process (see below), which is correct in practice for the common single-session-per-tab case. Treat this fallback as best-effort; document its limits in code comments.

**Detecting what's running in a tab (nice-to-have, supports the above + tab icons):** poll the pty's foreground process name (`process.title` isn't enough; use the pty pid → `ps -o comm` on its process group) every few seconds while the tab is visible. If foreground process is `claude`, show a small badge/icon on the tab.

**Manual override always wins:** double-click a terminal tab to rename it manually; a manually renamed tab stops auto-following titles until the user clears the custom name (right-click → "Follow automatic title").

Acceptance criteria:
1. Open terminal, run `claude`, run `/rename my-feature` → tab label becomes `my-feature` within ~2s (via OSC) or ~5s (via fallback watcher).
2. Manual rename sticks even if the program keeps emitting titles.
3. Two tabs each running their own `claude` session don't cross-contaminate labels (acceptable to relax this under the fallback mechanism — document it).

---

## 7. Panel Toggling

- Every panel is independently toggleable:
  - ⌘B — left (file browser)
  - ⌘J — right (terminals)
  - ⌘E — center (collapses center; browser view must hide; editor tabs preserved) — low priority, ship left/right toggles first
- Toggling preserves panel size (react-resizable-panels collapse/expand with remembered size).
- Hiding the panel does **not** kill anything: terminals keep running, editors keep state, browser view keeps its page (just hidden).
- Toggle state persists in workspace state.

---

## 8. Keyboard Shortcuts (v1)

| Shortcut | Action |
|---|---|
| ⌘S | Save active editor |
| ⌘W | Close active center tab (with dirty prompt) |
| ⌘T | New browser tab (center panel) |
| ⌘⇧T | New terminal tab |
| ⌘1…9 | Jump to center tab N |
| ⌃Tab / ⌃⇧Tab | Cycle center tabs |
| ⌘B / ⌘J | Toggle left / right panel |
| ⌘P | Quick-open file by fuzzy name (stretch goal; skip if it threatens v1) |
| ⌘R (browser tab active) | Reload preview |

---

## 9. macOS Specifics (do not skip)

1. **PATH**: GUI apps don't inherit the user's shell PATH. Spawn ptys as login shells (`/bin/zsh -l`) so `claude`, `node`, `npm` resolve. For any non-pty spawns from main, use the `fix-path` package. Test the *packaged* app, not just `npm run dev` — this is the classic works-in-dev-only bug.
2. **node-pty native rebuild**: must be compiled against Electron's ABI. electron-builder + `@electron/rebuild` handles it; verify on both arm64 and x64 (ship a universal build or arm64-only for v1 — arm64-only is acceptable, note it in the README).
3. **Traffic lights / title bar**: use `titleBarStyle: 'hiddenInset'` with a draggable top region (`-webkit-app-region: drag`) so it looks native.
4. **Trash, not unlink**: file deletion uses `shell.trashItem`.
5. **Signing**: v1 ships unsigned (right-click → Open). Structure electron-builder config so identity/notarization can be added later without rework.

---

## 10. Milestones

Build in this order — each milestone is independently demo-able:

1. **M1 — Shell + Terminal.** Window, project picker, right panel with working pty terminal tabs. (Terminal is the riskiest native integration; do it first. At the end of M1 you can already run `claude` and `npm run dev`.)
2. **M2 — Browser preview.** Center panel with browser tabs (multiple, view-per-tab), bounds syncing, URL bars, devtools, view destruction on close. Verify hide/show against tab switching and panel toggling.
3. **M3 — Files + Editor.** File tree, Monaco tabs, save, external-change reload via chokidar.
4. **M4 — Polish.** Tab renaming incl. Claude `/rename` integration (§6), panel toggle shortcuts, workspace persistence, packaged .app build that passes the PATH test.

## 11. Open Questions (decide before/during M4)

- Does current Claude Code emit OSC titles? (Investigation task in §6 — resolves the primary vs. fallback mechanism.)
- Should ⌘clicking a `file:line` in terminal output open it in the editor? (Very high value for Claude Code workflows; likely M4+ / v1.1. xterm.js link provider makes this feasible.)

## 12. Definition of Done (v1)

- Open a Next.js project, run `npm run dev` in one terminal tab and `claude` in another, preview at localhost:3000 in one browser tab and a second URL in another, open/edit/save files, see Claude's edits reflected live in open buffers, rename the Claude session and watch the tab follow, toggle any panel — all in a packaged .app launched from Finder.
