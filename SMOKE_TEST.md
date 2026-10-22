# Smoke test — 0.7.0 candidate

Everything below shipped since v0.5.0 (Terminal mode is new in 0.7.0; the rest
landed in 0.6.0 and stays on the list until it ships). Unit tests cover the logic;
this list is the hands-on pass for the parts only a human can judge (feel, focus,
native behaviour). Run against a **built** app, not `npm run dev` — several items
depend on the packaged layout (Prettier under asar, the zsh shim dir, menu
accelerators).

```bash
npm run pack:mac                     # dist/mac-arm64/Caret.app
open dist/mac-arm64/Caret.app        # (quit the installed Caret first — single-instance lock)
```

Before the hands-on pass, run the two headless smoke modes — they take 20 s and
catch the boot / pty / watcher regressions without a human:

```bash
npm run build
SMOKE_TEST=1 SMOKE_PROJECT="$(pwd)" npx electron --user-data-dir=/tmp/caret-smoke .
SMOKE_TEST=1 SMOKE_MODE=terminal SMOKE_PROJECT="$(pwd)/docs" npx electron --user-data-dir=/tmp/caret-smoke .
SMOKE_TEST=1 SMOKE_MODE=tabs SMOKE_PROJECT="$(pwd)" npx electron --user-data-dir=/tmp/caret-smoke .
```

Expect `SMOKE_PTY: PTY_OK` / `SMOKE_FORMAT: FORMAT_OK` in both, and in the terminal
run `SMOKE_WATCHER_BEFORE: none`, `SMOKE_TITLE_AFTER_CD: docs`, then
`SMOKE_WATCHER_AFTER: […/docs, …/docs/specs]` — the adopted folder only, never `~`.
(`--user-data-dir` sidesteps the installed app's single-instance lock and gives a
clean "fresh install".)

Tick as you go. Anything that fails: note what you saw next to it and we'll fix
before tagging. **Priority 1** items are the ones with the most native/OS surface;
do those even if you skip the rest.

## Feature flags (2 min) — new in 0.7.0

`docs/feature-flags.md`. Six features are built but hidden by default: `terminalMode`,
`fileTemplates`, `workspaceFolders`, `terminalInEditor`, `editorMinimap`, `checkForUpdates`.

- [ ] **Flags off (default).** With no `"features"` key in `settings.json`: launch → the welcome screen (never a terminal). No **New Terminal Window** in File or the Dock menu; View has no **Switch to IDE** / **Terminal Only** / **Check for Updates…**; the title-bar switcher has no **Terminal** segment; Settings has no **App → Open at launch**, **Check for updates** or **Minimap** rows, and the Keyboard Shortcuts list has no Switch to IDE entry; ⌘⇧I / ⌘⇧T do nothing. Explorer right-click has no **New File from Template**; ⋯ has no **Add folder to workspace…**; a terminal tab's context menu has no **Move to editor area**. The palette finds none of them. Monaco shows no minimap even with `"editorMinimap": true` in the file.
- [ ] **Flags on.** Add `"features": { "terminalMode": true, "checkForUpdates": true }` via *Edit in settings.json* and save: the View menu and the switcher gain their items **without a relaunch**; relaunch → the terminal window. `CARET_FEATURES=none npm run dev` hides everything again without touching the file.
- [ ] **Terminal-mode section below** is run with `terminalMode` on (the automated `SMOKE_MODE=terminal` run turns it on for itself).

---

## Priority 1 — Terminal mode (10 min) — new in 0.7.0, behind the `terminalMode` flag

Requires `"features": { "terminalMode": true }` in `settings.json` (or `CARET_FEATURES=terminalMode`).
Spec: `docs/specs/terminal-mode.md` (AC numbers below refer to its §4). Quit
Caret completely before each **Launch** item so launch behaviour is what's tested.
Use a folder like `~/notes` (plain, no git) and a real repo like `~/dev/<app>`.

### Launch
- [ ] **Fresh install (AC1, AC5).** Move `~/Library/Application Support/Caret/settings.json` aside (or launch with `--user-data-dir=/tmp/caret-fresh`) and launch with `CARET_FEATURES=terminalMode` (a fresh file has no flags). Open Caret: **one** window, a focused terminal with a live prompt at `~`, no explorer, no editor; **Terminal** is highlighted in the title-bar switcher; the status bar shows nothing on the left. Nothing else flashes in first. Restore your settings file afterwards.
- [ ] **Existing install without the key (AC5).** With your real `settings.json` lacking `startupMode`, launch → still the terminal window. Change any setting in Settings → the JSON view (`Edit in settings.json`) now shows `"startupMode": "terminal"`.
- [ ] **Speed (AC2).** From ⌘Space → Enter to a usable prompt feels like opening Terminal.app — well under a second on an M-series Mac. Activity Monitor (or `pgrep -fl "git|lsof"` in another terminal during launch) shows no `git` spawned by Caret before the prompt.
- [ ] **Welcome mode (AC3).** Settings → App → Open at launch → **Welcome screen**. Quit, relaunch → the welcome screen exactly as in 0.6.0: recents, pins, groups, ⌘O picker. Switch back to **Terminal** before the next item.
- [ ] **Old habits (AC4).** In **each** startup mode: `caret <dir>` from Terminal.app, Dock → Open Recent → a project, and a welcome-screen click each open a normal three-panel project window (git status, scripts menu, session picker present).
- [ ] **Dock (AC6).** Close every window (the app stays alive on macOS). Click the Dock icon: a terminal window in terminal mode, the welcome screen in welcome mode. Dock right-click and File menu both have **New Terminal Window**; from the welcome screen it opens one, and a second click focuses the existing one rather than opening another.
- [ ] **Not a recent (AC7).** After a terminal-mode launch, Dock → Open Recent and the welcome screen do **not** list `~` or "Terminal".

### The terminal-mode window
- [ ] **Title (AC8).** Title bar reads `~`. `cd ~/notes` → `notes` at the next prompt; `cd` back → `~`. Run `claude` and ask something: the title **stays** `notes`; Claude's session name lands on the terminal **tab** only.
- [ ] **Everything else works (AC9).** Run the **zsh shell integration** and **Terminal** sections below inside this window: new tabs (⌘D), splits + orientation toggle, broadcast, ⌘F find bar, ⌘↑/⌘↓/⌘⇧R, send-to-Claude from a selection, ⓘ info popover (cwd updates after `cd`), Move to editor area. New tabs open at `~`.
- [ ] **⌘B at `~` (AC12).** Fresh window, still at `~`, press ⌘B: the explorer panel opens with the "cd into a folder… ⌘⇧I" hint and an **Add folder…** button. `~` is never listed as a tree. ⌘B again hides it. Same with ⌘E for the editor area (empty "No tabs open").
- [ ] **Close last tab (AC10).** Close the only terminal tab (⌘⇧W, or × on the tab): the window closes; the app stays alive. Then: switch to IDE, open a file, edit it without saving, close the last terminal tab → the Save / Don't Save / Cancel dialog appears first; Cancel keeps the window.
- [ ] **No watcher on `~` (AC11).** Watch Caret in Activity Monitor (Disk tab) for the first ~10 s after launch: reads stay flat — a watcher on `~` would scan hundreds of thousands of files and peg the disk for a long time. The automated terminal smoke run above asserts the watcher list directly (`none` before, the adopted folder only after).

### Switch to IDE
- [ ] **Core (AC13).** `cd ~/notes`, start `claude`, then ⌘⇧I. Within a blink: explorer rooted at `notes`, center panel visible, **Full** highlighted, the `claude` session still streaming and still accepting input. Same via View → Switch to IDE, the palette, and clicking **Full** / **Editor** directly.
- [ ] **Editing round-trip (AC14).** Open a `.md` from that tree → renders; edit + ⌘S saves. Ask Claude to change the same file → the editor / tree update without a manual refresh (the watcher is live for the adopted folder).
- [ ] **No duplicates (AC15).** ⌘⇧I again → still one section. `cd ~/notes/2026` → ⌘⇧I → still one section (`notes`), nothing added.
- [ ] **Active terminal wins (AC16).** Two tabs: tab 1 at `~/notes`, tab 2 at `~/dev/<app>`. With tab 2 active, ⌘⇧I → `<app>` is adopted, not `notes`.
- [ ] **Unreadable cwd (AC17).** In a tab whose shell has exited (`exit`), press ⌘⇧I → a toast "Couldn't read the terminal's folder…" and nothing else changes. No crash, no error in View → App Developer Tools.
- [ ] **Back and forth (AC18).** Click **Terminal** (or ⌘⇧T): explorer and editor collapse, terminal fills the window, tabs and editors are still there. Click **Full**: everything returns; the folder was not added a second time.
- [ ] **Promotion (AC19).** `cd ~/dev/<app>` (has `.git` or `package.json`, or is in recents) → ⌘⇧I → toast "Open ~/dev/<app> as a project?". **Open** → a normal project window for it with its saved workspace; the terminal window stays open. Adopt another repo, dismiss the toast, ⌘⇧T, ⌘⇧I → no second offer for that folder. A plain folder (`~/notes`) never gets the toast.
- [ ] **Git status (AC20).** Before any adoption the status bar is blank on the left. After adopting `~/dev/<app>` it shows `<app> › <branch>` + counts; after adopting a plain folder it shows the folder name and "not a git repository". Never `~`.

### Layout and persistence
- [ ] **Preset (AC21).** Settings → Layout presets: **Terminal** is there (right panel only). Delete it → the switcher loses the segment, and it stays gone after a relaunch — but ⌘⇧T and ⌘⇧I still work. To get it back: **Capture current layout** while in terminal-only layout, or remove `"terminalPresetSeeded"` from `settings.json`.
- [ ] **Restart (AC22).** Two terminal tabs, split them, ⌘⇧I on a folder, resize the window, quit, relaunch: two tabs and the split are back, the window size is remembered, but the layout is terminal-only and **no** folder is adopted (explorer hint again after ⌘B).
- [ ] **Project settings layer (AC23).** Put `{ "formatOnSave": true }` in `~/notes/.caret/settings.json`, adopt `~/notes` → Settings banner says the key is overridden. Before adopting anything the banner never mentions a `~/.caret` file (create one to prove it's ignored).

## Priority 1 — native surfaces (10 min)

### Menu bar + shortcuts
- [ ] Every top-level menu is present: Caret / File / Edit / View / Go / Terminal / Claude / Window.
- [ ] File → Save shows ⌘S; rebind Save in Settings → Keyboard Shortcuts (record a new chord) → the File menu updates live.
- [ ] While recording a shortcut in Settings, press ⌘S — it is **captured** as the new chord (not swallowed by the menu).
- [ ] In a markdown Preview tab, ⌘B bolds the selection (sidebar does **not** toggle). In a `.ts` tab, ⌘D adds a cursor on the next match (no new terminal).
- [ ] With the terminal focused, ⌘W closes the terminal; with an editor focused, ⌘W closes the tab. ⌘F in the terminal opens the terminal find bar; ⌘F in an editor opens Monaco's find.
- [ ] Click into a browser preview page, press ⌘R — the page reloads (and keeps its scroll position if you were scrolled down).

### zsh shell integration
- [ ] Open a new terminal: your prompt looks normal (Starship / p10k / plain) and your aliases work — proof the shim sourced your real `.zshrc`.
- [ ] Run `ls`, then `false`, then `echo hi`. ⌘↑ / ⌘↓ jump between the prompts; the `false` prompt line has a red mark in the gutter / scrollbar.
- [ ] ⌘⇧R reruns `echo hi`.
- [ ] `echo $ZDOTDIR` prints a path under `~/Library/Application Support/Caret/shell-integration/zsh` (that's expected — your original is in `$CARET_USER_ZDOTDIR`).

### Finder → explorer drops
- [ ] Drag a file from Finder over the explorer: an overlay says **"Move into <folder> (hold ⌥ to copy)"** and the folder under the pointer highlights. Drop → the file moves (gone from Finder's folder). ⌘Z in Finder does not apply; it's a real move.
- [ ] Same drop with ⌥ held → overlay says "Copy into …", original stays.
- [ ] Drop onto empty space below the tree → lands in the project root.
- [ ] Drop a file whose name already exists → arrives as `name 2.ext`, nothing overwritten.
- [ ] Cancel a drag mid-way (press Esc or drag out of the window) → the overlay disappears (no stuck overlay).

### Prettier
- [ ] Settings → Formatting → paste `{ "semi": false, "singleQuote": true }` → Save config. In a project **without** a `.prettierrc`, ⇧⌥F on a `.ts` file strips semicolons.
- [ ] In a project **with** a `.prettierrc`, its rules win over the global config.
- [ ] Turn on "Format on save" → ⌘S formats then saves; a file with a syntax error still saves and a toast explains.

## Priority 2 — new UI (10 min)

### Themes
- [ ] Settings → Appearance → Dark palette: switch through One Dark / Solarized Dark / GitHub Dark. Sidebar, tabs, editor **and terminal** all change together. Light palette likewise with the appearance set to Light.
- [ ] Terminal ANSI colours match the theme (run `ls -G` or any colourful command).

### Explorer
- [ ] Type in the header filter box → flat results; Esc clears. ⋯ menu → Collapse all works; Hide dotfiles hides `.git`/`.env`; Hide git-ignored hides `node_modules`/`dist`.
- [ ] ⌘-click two files, ⇧-click a third → right-click shows "3 items selected" with bulk actions.
- [ ] Right-click the **header** and the **Changes** section → root menu (New File / New Folder / Template / Reveal).
- [ ] New File from Template → React component → file opens with `export default function …`.
- [ ] Duplicate a folder → `name copy` beside it with contents.
- [ ] Expand a big folder (node_modules with ignored shown) and scroll — smooth (virtualised).
- [ ] ⋯ → Add folder to workspace → second section appears; files in it open/edit/save; the × on its header removes it; relaunch → it's still there.

### Terminal
- [ ] Split two terminals; header button toggles side-by-side ⇄ stacked; the divider drags in both orientations.
- [ ] Tab context menu → "Move to editor area" → terminal appears as a center tab; type in it (the shell is alive); close the tab → it returns to the panel.
- [ ] Tab context menu → Terminal info… → pid/shell/cwd/foreground shown; `cd` somewhere and watch cwd update.
- [ ] Broadcast toggle on → typing in one terminal echoes in all.
- [ ] Settings → Terminal → font size 14 → all terminals resize immediately.
- [ ] `printf '\e]1337;File=inline=1:...'` optional; at least confirm emoji/CJK output aligns (`echo "日本語 🚀 x"`).

### Browser preview
- [ ] ⋯ menu → Copy screenshot → paste into Preview.app/Slack. Send screenshot to Claude → a `@.caret/screenshots/…png` mention lands in the Claude terminal.
- [ ] ⋯ → Offline → the page fails to fetch; Online restores. Slow 3G visibly throttles a reload.
- [ ] Console drawer button → shows the page's console output; `console.error` in the page → red badge count + row "→ Claude" works.
- [ ] Reload on save → save a file → the preview reloads.
- [ ] Use as default URL → ⌘T opens that URL.
- [ ] Clear cookies & site data → a logged-in page logs out.

### Palette
- [ ] ⌘⇧F → `#` mode → type a word → results with file:line; Enter opens at that line (caret placed there).
- [ ] ⌘⇧O in a `.ts` file → symbols; in a `.md` → headings. `:42` jumps to line 42.
- [ ] `>` mode lists the last-run commands first.

### Editor
- [ ] Breadcrumb click on a folder reveals it in the tree; switching tabs auto-reveals the file (Settings → Reveal file in explorer toggles it).
- [ ] Open a `.png`, `.svg`, `.pdf` → viewer tabs (fit / actual size; PDF renders).
- [ ] Open a CRLF file (create one: `printf 'a\r\nb\r\n' > crlf.txt`) → status bar shows `UTF-8 · CRLF`; edit + save → `xxd crlf.txt` still shows `0d0a`.
- [ ] Markdown: `[link](./OTHER.md)` click opens the file; a ```mermaid fence renders a diagram; Tab inside a table row moves cells; paste a screenshot → `assets/pasted-….png` appears and the image renders.
- [ ] Toggle Preview ⇄ Source on a long markdown file → caret and scroll stay put; a long `> quoted` block renders as a quote (no `>` markers).
- [ ] Settings → Editor: minimap on/off, bracket colouring, sticky scroll, font size — each applies live.

## Priority 3 — app (5 min)

- [ ] Welcome screen (close all project windows on macOS — app stays open — then Dock → Welcome Screen): hover a recent → pin / group / × work; grouped projects show under their section header; the app does **not** quit when the welcome window closes.
- [ ] View → Check for Updates… → toast ("up to date" since 0.6.0 isn't released yet; or the download offer).
- [ ] Settings search box filters rows; create `.caret/settings.json` with `{ "formatOnSave": true }` → banner says the key is overridden; editing that file re-applies live.
- [ ] Settings → Keyboard Shortcuts → Import from VS Code… → paste a real `keybindings.json` → toast with import/skip counts.
- [ ] Status bar → Diagnostics → select a report → Copy as Markdown / Report on GitHub (opens a pre-filled issue).
- [ ] Session status: run `claude` in a terminal, ask something, switch to another app while it works → macOS notification when it finishes; badge is amber while waiting for you. (If notifications don't appear at all: unsigned-app limitation, not a bug.)
- [ ] Session picker (chevron next to terminal +) → Resume a recent session → tab is titled from the start.

## Intel build (only if you have an Intel Mac or Rosetta handy)
- [ ] `Caret-0.7.0-x64.dmg` from the release: launches straight into a terminal, ⌘⇧I adopts a folder, Prettier formats. (Cross-compiled on the arm64 runner; verified under Rosetta once.)

---

**Known / accepted:**
- Terminal mode **adopts** folders into the window; it does not re-root it. Recents, the welcome screen and the session picker treat a promoted project window as the real thing (spec §7.1 is the follow-up).
- An adopted (or project) root that is a **subfolder of a git repo** lists Changes with repo-relative paths, so entries outside the folder show as absolute paths. Pre-existing; not a terminal-mode regression.
- Only one terminal-mode window at a time; **New Terminal Window** focuses the existing one (spec §7.2).
- Moving a terminal between panel and editor area restarts its scrollback (the pty survives).
- The in-app update check only offers a download; unsigned builds can't self-update.
- `~/.prettierrc` is ignored on purpose — only a config **inside** the project beats the global Settings config.
