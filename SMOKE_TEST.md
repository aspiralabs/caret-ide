# Smoke test — 0.6.0 candidate

Everything below shipped since v0.5.0. Unit tests cover the logic; this list is the
hands-on pass for the parts only a human can judge (feel, focus, native
behaviour). Run against a **built** app, not `npm run dev` — several items depend
on the packaged layout (Prettier under asar, the zsh shim dir, menu accelerators).

```bash
npm run pack:mac                     # dist/mac-arm64/Caret.app
open dist/mac-arm64/Caret.app        # (quit the installed Caret first — single-instance lock)
```

Tick as you go. Anything that fails: note what you saw next to it and we'll fix
before tagging. **Priority 1** items are the ones with the most native/OS surface;
do those even if you skip the rest.

---

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
- [ ] `Caret-0.6.0-x64.dmg` from the release: launches, terminal works, Prettier formats. (Cross-compiled on the arm64 runner; verified under Rosetta once.)

---

**Known / accepted:**
- Moving a terminal between panel and editor area restarts its scrollback (the pty survives).
- The in-app update check only offers a download; unsigned builds can't self-update.
- `~/.prettierrc` is ignored on purpose — only a config **inside** the project beats the global Settings config.
