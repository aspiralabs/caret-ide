// ---------------------------------------------------------------------------
// Remembered window geometry. Only the terminal-mode window records its size
// today (spec §3.5: it opens at 1100×720 and remembers its own size separately
// from project windows, which keep their fixed default). Also the open project
// tabs, reopened at the next launch (see sessionRestore).
// ---------------------------------------------------------------------------

import Store from 'electron-store'
import type { SavedWindow } from './sessionRestore'

interface WindowSize {
  width: number
  height: number
}

interface StoreSchema {
  terminalWindow?: WindowSize
  /** Project windows open at last quit (validated on read by normalizeSession). */
  openProjects?: SavedWindow[]
}

const store = new Store<StoreSchema>({ name: 'window-state' })

export const TERMINAL_WINDOW_DEFAULT: WindowSize = { width: 1100, height: 720 }

export function getTerminalWindowSize(): WindowSize {
  const s = store.get('terminalWindow')
  if (!s || !Number.isFinite(s.width) || !Number.isFinite(s.height)) return TERMINAL_WINDOW_DEFAULT
  return { width: Math.max(720, Math.round(s.width)), height: Math.max(480, Math.round(s.height)) }
}

export function saveTerminalWindowSize(size: WindowSize): void {
  store.set('terminalWindow', size)
}

/** Raw saved session; run it through normalizeSession before use. */
export function getSavedSession(): unknown {
  return store.get('openProjects')
}

export function saveSession(windows: SavedWindow[]): void {
  store.set('openProjects', windows)
}
