# Caret

A minimal, three-panel Electron IDE for working on web projects with Claude Code, per [`ide-spec.md`](./ide-spec.md). One window per project: file browser on the left, tabbed editor/browser in the center, tabbed terminals on the right.

macOS only (arm64), unsigned for v1.

> **Contributions welcome** — see [CONTRIBUTING.md](./CONTRIBUTING.md). Licensed under [MIT](./LICENSE).

---

## Requirements

- macOS on Apple Silicon (arm64)
- Node 20+ (developed on Node 24)
- Xcode Command Line Tools (`xcode-select --install`) — needed to compile `node-pty`

## Quick start

```bash
npm install        # installs deps + rebuilds node-pty against Electron's ABI
npm run dev        # launch in development (HMR)
```

On first launch you get a native folder picker — choose a project folder and its window opens.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | electron-vite dev server + Electron, with HMR |
| `npm run build` | Type-agnostic bundle of main/preload/renderer into `out/` |
| `npm run typecheck` | `tsc` for both the node (main/preload) and web (renderer) projects |
| `npm run rebuild` | Rebuild `node-pty` against the current Electron ABI |
| `npm run pack:mac` | Build an unpacked `.app` (fast, for local testing) |
| `npm run dist:mac` | Build a distributable arm64 `.dmg` (unsigned) |

### Smoke test (headless boot verification)

```bash
SMOKE_TEST=1 SMOKE_PROJECT="$(pwd)" npx electron .
```

Boots the app against a folder, runs a real pty echo round-trip and a `WebContentsView`
navigation round-trip, prints `SMOKE_PTY: PTY_OK` / `SMOKE_BROWSER: BROWSER_OK`, and exits.
Used to validate the native integrations without a human clicking the folder picker.

---

## Architecture

```
src/
  shared/          types.ts (IPC data contract) + ipc.ts (channel names)
  main/            Electron main process
    index.ts       app lifecycle, project-open flow, menu, core IPC
    window.ts      per-project BrowserWindow registry (one window == one project)
    security.ts    path-traversal guard (every fs path verified inside project root)
    ipc/           fs, pty, browser, workspace, session handlers
  preload/         contextBridge -> window.ide.* (contextIsolation on, nodeIntegration off)
  renderer/        React + Tailwind UI
    stores/        Zustand: layout, tabs (center), terminals, files, persistence
    components/     TitleBar, CenterPanel, files/, editor/, terminal/, browser/
    hooks/         global keyboard shortcuts
    lib/           browser-safe path utils, id, editor save bridge
```

- **Main** owns all `node-pty` instances, filesystem access + chokidar watchers, `WebContentsView`s (the browser preview), and `electron-store` persistence.
- **Renderer** owns all UI. It never touches the filesystem directly — every path crosses IPC and is validated against the project root in main.
- **Browser preview** uses `WebContentsView` (main-process, floats above the DOM). One view per browser tab, at most one visible at a time; the renderer reports the placeholder's bounds and main positions the view (spec §5.3).

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| ⌘S | Save active editor |
| ⌘W | Close active center tab (prompts if dirty) |
| ⌘T | New browser tab |
| ⌘⇧T | New terminal tab |
| ⌘1…9 | Jump to center tab N |
| ⌃Tab / ⌃⇧Tab | Cycle center tabs |
| ⌘B / ⌘J | Toggle left / right panel |
| ⌘E | Toggle center panel |
| ⌘R (browser tab active) | Reload preview |
| ⌘K (terminal focused) | Clear terminal |

## Terminal tab naming & Claude `/rename` (spec §6)

- **Primary:** xterm's `onTitleChange` (OSC 0/2 title sequences) → tab label. Covers shells and any CLI that emits a title, including Claude Code if it does.
- **Fallback:** a chokidar watcher on `~/.claude/projects/<encoded-path>/` reads the session
  summary and applies it to the terminal tab running `claude`. The encoded path is
  `root.replace(/[^A-Za-z0-9]/g, '-')` (verified empirically — Claude replaces every
  non-alphanumeric char, including `_`). The session title comes from `sessions-index.json`'s
  `summary` field. This fallback is best-effort and cannot perfectly disambiguate two
  concurrent `claude` sessions to specific tabs (spec §6 acceptance criterion #3 relaxation).
- **Manual override wins:** double-click a terminal tab to rename; right-click → "Follow
  automatic title" to resume auto-naming.

---

## Known limitations / deviations from spec

- **Project picker** is the native macOS folder dialog rather than a custom "recent projects" welcome screen. Opening/focusing per project and one-window-per-project all work; a recents list is a future enhancement.
- **Dirty-tab close** uses a native confirm dialog (discard/cancel) rather than a 3-way save/don't-save/cancel bar.
- **⌘P quick-open** (fuzzy file finder) is not implemented (spec marked it a stretch goal).
- **Terminal restore:** ptys can't be resurrected, so tab labels/count restore as *fresh* sessions (spec §5.4).
- arm64-only, unsigned. The `electron-builder.yml` is structured so an identity + notarization step can be added without rework.

## Troubleshooting

**`node-gyp` fails with `No module named 'distutils'`** — Python 3.12+ removed `distutils`.
This project pins a modern `node-gyp` (v13, via `gyp-next` which doesn't need distutils), so a
fresh `npm install` should work. If you still hit it, ensure `node_modules/node-gyp` is v13+.

**`Electron failed to install correctly` / missing `Electron Framework.framework`** — Electron's
binary download or zip extraction was incomplete. Repair with:

```bash
rm -rf node_modules/electron/dist "$HOME/Library/Caches/electron"
node node_modules/electron/install.js
# if extraction still fails, extract the cached zip manually:
unzip -o "$HOME/Library/Caches/electron/"*/electron-*-darwin-arm64.zip -d node_modules/electron/dist
printf 'Electron.app/Contents/MacOS/Electron' > node_modules/electron/path.txt
```

**Native module ABI mismatch after an npm install** — run `npm run rebuild`.

**`claude` / `node` not found in a terminal** — terminals spawn as login shells (`/bin/zsh -l`)
so your shell PATH is inherited. Verify against the *packaged* app, not just `npm run dev`.

---

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](./CONTRIBUTING.md) for the
development setup, expectations, and pull-request process.

## Releases

Downloadable builds are published as [GitHub Releases](https://github.com/aspiralabs/caret-ide/releases),
produced automatically by CI when a `v*` tag is pushed. See [RELEASING.md](./RELEASING.md)
for the full process. Builds are unsigned arm64 — on first launch, right-click
**Caret.app** → **Open**.

## License

[MIT](./LICENSE) © David Ludemann
