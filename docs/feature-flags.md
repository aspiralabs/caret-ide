# Feature flags

Caret ships some features **dark**: the code is in the build, but its menu items, commands,
settings rows, context-menu entries and boot behaviour are hidden until the flag is on. This
lets a feature keep being refined on `main` without holding up a release.

The model lives in `src/shared/features.ts`. Every flag has a compiled-in default (off while
the feature is being refined) and two overrides:

| Where | How | Scope |
|---|---|---|
| `settings.json` (Settings → *Edit in settings.json*) | `"features": { "terminalMode": true }` | persisted, this install |
| environment | `CARET_FEATURES="terminalMode,!editorMinimap" npm run dev` | this run only, never written to disk |

Env tokens: a bare id turns a flag on, `!id` / `-id` turns it off, `all` / `none` set every
flag (exceptions may follow: `all,!terminalMode`). Unknown ids are ignored. Flags are
**global-only** — a project's `.caret/settings.json` cannot flip them.

## Current flags

| Flag | Hides |
|---|---|
| `terminalMode` | Launching into a terminal at `~` (`startupMode`, Settings → App), **New Terminal Window** (File menu, Dock), **Switch to IDE** ⌘⇧I, **Terminal Only** ⌘⇧T, the *Terminal* layout preset, folder adoption / the "open as a project?" offer. Spec: `docs/specs/terminal-mode.md`. |
| `fileTemplates` | Explorer context menu → **New File from Template**. |
| `workspaceFolders` | Explorer ⋯ → **Add folder to workspace…**, the × on extra root sections, restoring extra roots at launch. (The multi-root engine stays on — terminal mode's adoption uses it.) |
| `terminalInEditor` | Terminal tab context menu → **Move to editor area**. |
| `editorMinimap` | Settings → Editor → **Minimap** (the minimap is forced off). |
| `checkForUpdates` | View → **Check for Updates…**, the launch-time GitHub release check, Settings → **Check for updates**. |

## How gating works

- **Main** reads flags synchronously from `settings.json` + env (`src/main/features.ts`) before
  any window exists: boot target (`bootMode.ts`), the fallback / Dock menus, and the
  `window:newTerminal` / `project:addRoot` IPC handlers. It re-reads on each use, so a flag
  flipped in `settings.json` applies without a restart (main menus rebuild on the next renderer
  menu update).
- **Renderer** reads `settings.features` (normalised in `shared/types.ts`); `lib/features.ts`
  exposes `useFeature(id)` for components and `isFeatureEnabled(id)` for stores / commands.
- A command with `feature: '<id>'` in `lib/commands.ts` is dropped from the palette, the native
  menus (`menuSpec.ts` tidies the separators), the Keyboard Shortcuts list and chord dispatch,
  so its default chord is free while the flag is off.
- `applyFeatureConstraints` in `shared/types.ts` forces settings a hidden feature would need
  back to their off shape (`startupMode: 'welcome'`, no Terminal preset, minimap off, update
  check off) so nothing downstream needs a second check. The keys are left in the file, so
  turning a flag on later restores what the user had.

## Adding a flag

1. Append an entry to `FEATURES` in `src/shared/features.ts` (`default: false`).
2. Gate the surfaces: `feature:` on commands, `useFeature()` / `isFeatureEnabled()` in
   components and stores, `featureOn()` in `src/main/index.ts` for main-side menus / IPC.
3. If a setting only makes sense with the feature, force it in `applyFeatureConstraints`.
4. Add the row to the table above and a line to `SMOKE_TEST.md`.

To **release** a feature flip its `default` to `true` (or delete the flag and its checks).

## Smoke runs

`SMOKE_TEST=1 SMOKE_MODE=terminal …` turns `terminalMode` on for that process automatically (via
the env override), so the terminal-mode smoke run keeps working while the flag is off.
