# Spec: Terminal Mode

_Status: implemented on `feat/terminal-mode` (steps 1–6, one commit each) · Target: 0.7.0_

> **Implementation notes.** Judgment calls made where the spec left room: (1) Settings gained a new **App** section for "Open at launch". (2) When the cwd is `~` itself, Switch to IDE applies the layout but adopts nothing — watching the whole home folder is exactly what terminal mode avoids; the explorer shows a hint instead. (3) Closing the last terminal-mode window on macOS keeps the app alive (like the welcome screen) so AC6 is reachable. (4) A restart restores terminal tabs, splits and window size but not center/editor tabs, which would point into roots that aren't restored. (5) The Terminal preset is re-appended by `normalizeSettings` until a hidden `terminalPresetSeeded` marker is written on the next preset edit, so deleting it in Settings sticks (AC21). (6) AC13's watcher assertion and the cwd → ⌘⇧I flow are exercised by `SMOKE_MODE=terminal SMOKE_PROJECT=…` with real input events.

Caret opens straight into a terminal, like Warp. No splash, no project picker. You `cd` wherever you like, run `claude`, and get to work. When you want the file browser or an editor, you flip to IDE mode and the panels appear around the terminal you were already using.

---

## 1. Intent

### The problem

Caret is a project-first IDE: one window, one folder. That is right for development, but it makes the app feel heavy for the other half of how Claude Code gets used: journaling, research, thinking in Markdown, quick one-off commands. Today that flow is: open Caret, see the welcome screen, pick a project, wait for the window, find the terminal panel, then run `claude`. Warp is one keystroke away and gets you there in a second, so Warp wins, and Caret only gets opened when there is "real" development to do.

### The goal

Make Caret the thing you reach for first, for both kinds of work. Opening Caret should be as cheap as opening a terminal, and the IDE should be one click away from wherever the terminal happens to be.

### What this is

- A **startup mode** setting. `terminal` opens a bare terminal window at launch. `welcome` keeps today's behaviour.
- A **terminal-only layout**: the terminal fills the window, file browser and center panel hidden. Delivered as a built-in layout preset so the existing title-bar switcher is the mode toggle.
- A **Switch to IDE** action that reads the active terminal's working directory, makes it a workspace root, and shows the file browser and center panel. The running shell, and anything running inside it, is untouched.

### What this is not

- Not a new agent-first launcher with a prompt box (Cursor's model). Claude Code *is* the shell, so the shell is the front door.
- Not a rewrite of the window model. A terminal-mode window is still a `ProjectWindow`. Its root is the user's home folder, and the project-only subsystems are simply not started until IDE mode needs them.
- Not re-rooting a window in place. That is listed as a follow-up in §7.

---

## 2. User stories

1. **Journal.** I press ⌘Space, type "caret", hit Enter. A terminal is on screen in under a second. I type `cd ~/notes && claude` and start writing. I never see a file tree.
2. **Research that turns into editing.** While in that Claude session I want to read the Markdown it just wrote. I click **IDE** in the title bar. The file browser shows `~/notes`, I open the file, the preview renders, and the Claude session on the right keeps going.
3. **Real development.** I open Caret, `cd ~/dev/app`, then click **IDE**. I get the same three-panel layout I have today for that folder, including package.json scripts, git status and the Claude session picker. If that folder was already in my recents, its saved workspace comes back.
4. **Old habits still work.** `caret .` from any other terminal, the Dock's "Open Recent", and double-clicking a folder on the welcome screen all open a project window exactly as they do now, regardless of startup mode.
5. **Back out.** From IDE mode I click **Terminal** and the panels collapse; the terminal fills the window again. Nothing is closed.

---

## 3. Design

### 3.1 Startup mode

New app setting, in the "App" section of Settings and in `settings.json`:

```jsonc
"startupMode": "terminal"   // "welcome" | "terminal"; default "terminal"
```

Boot precedence in `main/index.ts` becomes:

1. `IDE_OPEN_PROJECT` env (dev) → open that folder.
2. `caret --dir <path>` → open that folder.
3. `startupMode === 'terminal'` → open a terminal-mode window (§3.2).
4. Otherwise → welcome screen (today's behaviour).

The Dock menu's "Welcome Screen" item stays, so the welcome screen remains reachable in terminal mode. Add a matching "New Terminal Window" item to the Dock and File menus so a terminal window is reachable in welcome mode.

macOS `activate` (Dock click with no windows) follows the same rule as launch: terminal window in terminal mode, welcome screen otherwise.

**Default.** The default is `terminal`. The setting is read by main synchronously at boot (the same way `startupBackgroundColor` reads the theme today), so a user's choice is honoured on the very first frame with no flash of the wrong screen.

### 3.2 Terminal-mode window

A terminal-mode window is a `ProjectWindow` whose root is `app.getPath('home')` and which carries a `mode: 'terminal'` flag. It is created by `createProjectWindow(home, { mode: 'terminal' })` and loads the renderer with a `#terminal` hash (the same mechanism `#welcome` uses today), so the renderer knows to boot in terminal mode before any store hydrates.

Window and boot differences from a normal project window:

| Concern | Project window | Terminal-mode window |
|---|---|---|
| Root | chosen folder | `~` |
| Title | folder name | `Terminal` (updates to the shell's cwd basename after each command, see §3.5) |
| Layout on first open | last saved for that root, else Full | **Terminal** preset, always |
| File watcher (`fs.watch`) | started at boot | **not started** until a bounded root is added |
| Session watcher (`session.watch`) | started at boot | not started until IDE mode |
| Git status | refreshed at boot | skipped (root is `~`) |
| File browser | renders root | renders nothing until IDE mode; `~` is never listed as a tree |
| Workspace persistence | keyed by root | keyed by the literal key `~terminal` so it never collides with a real project at `~` |
| Recents | added on open | **not** added |
| `caret <dir>` while focused | opens a new window | opens a new window (unchanged) |

Everything else (terminal tabs, splits, shell integration, send-to-Claude, settings, command palette, themes) works unchanged, because it already keys off the window, not the root.

**Why home as root.** Every project-scoped IPC handler requires a `ProjectWindow`. Rooting at `~` means path validation (`assertInsideRoot`) passes for anything the shell can reasonably reach, without loosening security for real project windows. The cost is that a few subsystems assume the root is small. Those are gated by the mode flag rather than the path, so a real project at `~` (unusual, but possible) keeps today's behaviour.

### 3.3 Terminal preset and the mode toggle

Add a built-in layout preset to `defaultLayoutPresets()`:

```ts
{ id: 'preset-terminal', name: 'Terminal', leftVisible: false, centerVisible: false, rightVisible: true, centerSplit: false, terminalSplit: false }
```

Existing users with customised presets get it appended by `normalizeSettings` if no preset with that id exists. The preset switcher already highlights whichever preset matches the live layout, so it doubles as the mode indicator with no new UI.

The "IDE" affordance in the title bar is the existing **Full** segment. In a terminal-mode window, clicking any preset that shows the left or center panel triggers **Switch to IDE** (§3.4) first, then applies the preset. Keyboard toggles (⌘B and friends) that reveal the left or center panel do the same.

### 3.4 Switch to IDE

New command `switch-to-ide` (palette, File menu, and implicitly via the presets as above). Steps:

1. Resolve the active terminal's cwd. Main already does this with `lsof` for the ⓘ popover; expose it as `pty.cwd(ptyId)`. If the lookup fails, fall back to the window root.
2. If the cwd is inside an existing workspace root, do nothing further.
3. Otherwise add it as a workspace root via the existing `projectSetRoots` path. This starts the chokidar watcher **for that folder only**, and the file browser gains a section for it. In a terminal-mode window, the home root is never rendered as a section, so the new folder is the only one shown.
4. Start the session watcher for that folder so the Claude session picker and tab naming work.
5. Apply the requested preset (default: Full).

The terminal, its pty, and whatever is running in it are not touched. The toggle is layout plus roots, nothing more.

**Promotion.** When the cwd is a folder in the recents list, or contains a `.git` or `package.json`, offer a toast: "Open ~/dev/app as a project?" Accepting calls `openProjectPath`, which opens a proper project window with its saved workspace, git status, scripts and Claude session pickers. The terminal window stays open. This is opt-in so the fast path never spawns a second window unprompted.

### 3.5 Small things that make it feel like a terminal

- **Title.** Shell integration already emits OSC 133 boundaries. Add OSC 7 (`\e]7;file://host/path\a`) to the zsh precmd hook so the renderer learns the cwd on every prompt without polling `lsof`. The window title becomes the cwd basename, and Switch to IDE can use this value first, `lsof` second.
- **First frame.** The terminal must have focus and a live prompt as soon as the window shows. No panel animation, no empty file browser flashing in.
- **Closing.** Closing the last terminal tab in a terminal-mode window closes the window (a terminal app with no terminal is nothing). In IDE mode with open editors, today's unsaved-changes guard applies.
- **Window size.** Terminal-mode windows open at 1100×720 and remember their own size separately from project windows.

### 3.6 Settings UI

In Settings → App:

- **Open at launch:** `Terminal` / `Welcome screen` (segmented control, searchable as "startup", "launch", "terminal mode").
- Help text: "Terminal opens a shell in your home folder. Use the layout switcher or ⌘⇧I to bring in the file browser and editor."

### 3.7 Keyboard

- `⌘⇧I` → Switch to IDE (applies Full). Rebindable like every other command.
- `⌘⇧T` → apply the Terminal preset (collapse to terminal-only). Both chords are currently unbound.

---

## 4. Acceptance criteria

A build passes when every item below is true. Items are grouped by the story they serve.

### Launch

- [ ] **AC1.** With `startupMode: "terminal"` and no CLI argument, launching Caret shows one window containing a focused terminal with a live prompt, cwd `~`, and no file browser or center panel.
- [ ] **AC2.** Time from process start to a usable prompt in that window is under 1.0 s on an M-series Mac, measured as `ready-to-show` plus the first OSC 133 `A` sequence. No file watcher or git process is spawned before the prompt appears.
- [ ] **AC3.** With `startupMode: "welcome"`, launch behaviour is byte-for-byte today's: the welcome window, recents, ⌘O.
- [ ] **AC4.** `caret <dir>`, `IDE_OPEN_PROJECT`, the Dock "Open Recent" menu, and welcome-screen clicks all open a normal project window in either startup mode.
- [ ] **AC5.** A fresh install (no `settings.json`) opens in terminal mode. Existing installs with a `settings.json` that lacks the key also open in terminal mode; the setting is written on first save with the current value so the JSON view shows it.
- [ ] **AC6.** Clicking the Dock icon with no windows open follows the startup mode.

### Terminal-mode window

- [ ] **AC7.** The terminal-mode window is not added to recents and does not appear in the Dock's "Open Recent" list.
- [ ] **AC8.** The window title tracks the shell's cwd basename after every prompt (OSC 7). While `claude` is the foreground process, the title stays the cwd; the Claude session name goes on the terminal tab as today.
- [ ] **AC9.** New terminal tabs, splits, broadcast, ⌘F search, shell integration navigation, send-to-Claude and the ⓘ popover all work in the terminal-mode window exactly as in a project window. Covered by the existing terminal smoke checklist run against a terminal-mode window.
- [ ] **AC10.** Closing the last terminal tab closes the window. If the window is in IDE mode with dirty editors, the existing Save / Don't Save / Cancel dialog runs first.
- [ ] **AC11.** With the window rooted at `~`, no chokidar watcher exists for `~` at any point. Verified by asserting `watchers` has no entry for the window until Switch to IDE runs, and afterwards that the watched path is the adopted folder, not `~`.
- [ ] **AC12.** The file browser never lists `~` as a tree in a terminal-mode window, even after toggling the left panel by keyboard.

### Switch to IDE

- [ ] **AC13.** From a terminal whose cwd is `~/notes`, running Switch to IDE (⌘⇧I, palette, or the Full preset) shows the file browser rooted at `~/notes` and the center panel, within 300 ms, without restarting the shell. A `claude` session running in that terminal keeps its output and accepts input afterwards.
- [ ] **AC14.** Opening a Markdown file from that browser renders it in the center panel, edits save, and the file browser reflects an edit Claude makes to the same file (the watcher is live for the adopted folder).
- [ ] **AC15.** Switching to IDE a second time with the same cwd does not add a duplicate root. Switching from a terminal whose cwd is a subfolder of an existing root adds nothing.
- [ ] **AC16.** Switching with two terminals open uses the **active** terminal's cwd.
- [ ] **AC17.** If the cwd cannot be resolved (shell exited, `lsof` timeout), the command shows a toast explaining that and does nothing else. The app does not throw.
- [ ] **AC18.** Clicking the **Terminal** preset from IDE mode hides the left and center panels and leaves roots, tabs and editors in place. Clicking **Full** again restores them without re-adding roots.
- [ ] **AC19.** When the cwd contains `.git` or `package.json`, or is already in recents, a toast offers to open it as a project. Accepting opens a project window for that folder with its saved workspace and leaves the terminal window open. Dismissing does nothing and the offer is not repeated for that folder in that window.
- [ ] **AC20.** Git status in the status bar reflects the first adopted root when there is one, or stays blank. It never shows status for `~`.

### Layout and persistence

- [ ] **AC21.** The Terminal preset appears in the title-bar switcher for new installs and is appended for users with custom presets who lack it. Deleting it in Settings is allowed; Switch to IDE still works without it.
- [ ] **AC22.** Quitting and relaunching a terminal-mode window restores its terminal tabs, split state and window size, but always applies the Terminal layout on boot regardless of what was showing at quit. Adopted roots are not restored (the shell starts at `~` again, so a stale root would be misleading).
- [ ] **AC23.** The per-project `.caret/settings.json` override layer is not consulted for the `~` root. It is consulted for an adopted root if that folder has one.

### Quality

- [ ] **AC24.** Unit tests cover: boot precedence (env → CLI → mode), `normalizeSettings` appending the Terminal preset, the cwd-inside-existing-root check, and the OSC 7 parser.
- [ ] **AC25.** The smoke test gains a `SMOKE_MODE=terminal` run that asserts a pty prompt in a terminal-mode window and asserts no watcher was started.
- [ ] **AC26.** `SMOKE_TEST.md` gains a "Terminal mode" section covering AC1, AC8, AC13, AC18 and AC19 by hand.
- [ ] **AC27.** No change in behaviour or performance for project windows: the existing smoke checklist passes unchanged.

---

## 5. Success measure

The feature is successful if, one week after shipping, the author opens Caret rather than Warp for journaling and research sessions without thinking about it. The proxy for that is: the terminal-mode window is the first window open in most launches, and Switch to IDE is used at least sometimes from it. If it turns out that the promotion toast (AC19) is the path taken every time, the in-place adopt-root behaviour is the wrong default and §7.1 should be prioritised.

---

## 6. Implementation plan

Each step is shippable on its own and lands as a separate commit on `feat/terminal-mode`.

1. **Setting + Terminal preset.** `startupMode` in `AppSettings`, `defaultSettings`, `normalizeSettings`, Settings UI row. Terminal preset in `defaultLayoutPresets`. Tests for normalisation. No behaviour change yet.
2. **Terminal-mode window.** `mode` on `ProjectWindow`, `#terminal` hash, boot precedence in `main/index.ts`, gated watchers / git / session start in `App.tsx`, file browser renders nothing for the home root in terminal mode, recents skip, workspace key `~terminal`, Dock and File menu items. Smoke test mode. AC1–AC12, AC21–AC23, AC25.
3. **OSC 7 + title.** Emit from the zsh hook, parse in the terminal view, store cwd on the terminal tab, drive the title. AC8.
4. **Switch to IDE.** `pty.cwd` IPC, `switch-to-ide` command, preset interception in a terminal-mode window, root adoption, session watcher start. AC13–AC18, AC20.
5. **Promotion toast.** AC19.
6. **Docs.** `SMOKE_TEST.md` section, README blurb, `IDEAS.md` item marked shipped. AC26.

Estimated effort: two to three days including tests.

---

## 7. Follow-ups (out of scope)

1. **Re-root in place.** Turn the terminal-mode window into a real project window for the adopted folder: recents, git store, session picker and workspace persistence all follow. Requires the root to be mutable on `ProjectWindow` and the `byPath` map, watchers and workspace key to be swapped atomically. Do this if AC19's toast turns out to be the path people always take.
2. **Multiple terminal windows.** ⌘N in terminal mode opens another terminal-mode window. Today `byPath` allows one window per root, so a second `~` window needs the workspace key trick extended.
3. **Quick folder jump.** A palette prefix (`>cd `) listing recents and pinned groups that types `cd <path>` into the active terminal. Cheap and very Warp-like.
4. **Warp-style blocks.** OSC 133 already marks command boundaries; rendering them as collapsible blocks with per-block copy and "send to Claude" is a natural next step but is its own spec.
