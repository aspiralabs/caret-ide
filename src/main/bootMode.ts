// ---------------------------------------------------------------------------
// What to open at launch (spec: docs/specs/terminal-mode.md §3.1).
//
// Precedence: an explicit folder (dev env, then `caret --dir <path>`) always
// wins; otherwise the `startupMode` setting decides between a terminal-mode
// window and the welcome screen. The setting is read synchronously from
// settings.json — the same way the startup background colour is — so the
// very first window is the right one, with no flash of the wrong screen.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs'
import { join } from 'path'
import type { StartupMode } from '../shared/types'

export type BootTarget = { kind: 'project'; root: string } | { kind: 'terminal' } | { kind: 'welcome' }

/** Pure precedence rule: env → CLI → startup mode. */
export function resolveBootTarget(input: {
  envDir?: string | null
  cliDir?: string | null
  startupMode: StartupMode
}): BootTarget {
  if (input.envDir) return { kind: 'project', root: input.envDir }
  if (input.cliDir) return { kind: 'project', root: input.cliDir }
  return input.startupMode === 'terminal' ? { kind: 'terminal' } : { kind: 'welcome' }
}

/** Parse the `startupMode` key out of raw settings.json text; unknown → the default (terminal). */
export function parseStartupMode(raw: string | null): StartupMode {
  if (raw === null) return 'terminal'
  try {
    const mode = (JSON.parse(raw) as { startupMode?: unknown }).startupMode
    return mode === 'welcome' ? 'welcome' : 'terminal'
  } catch {
    return 'terminal'
  }
}

/** Synchronous read of the persisted startup mode (no file / invalid JSON → terminal). */
export function readStartupMode(userData: string): StartupMode {
  let raw: string | null = null
  try {
    raw = readFileSync(join(userData, 'settings.json'), 'utf8')
  } catch {
    // No settings file yet (fresh install) — fall through to the default.
  }
  return parseStartupMode(raw)
}
