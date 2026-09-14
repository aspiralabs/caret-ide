// ---------------------------------------------------------------------------
// App settings (spec-added): a VSCode-style settings.json living in userData.
//
// The main process owns the FILE but is intentionally SCHEMA-AGNOSTIC: it never
// interprets, validates, or strips keys. It stores/merges raw JSON and hands the
// parsed object to the renderer, which owns the schema (defaults + validation
// via `normalizeSettings`). This means adding a new setting only touches
// shared/types + the renderer — main never needs to change (or restart).
//
// Two write paths stay in sync:
//   1) the Settings UI  -> settings:update (merge a patch into the raw object)
//   2) the raw JSON tab -> settings:setRaw (write verbatim text on save)
// Either write — plus any external edit picked up by the fs watcher —
// broadcasts `settings:changed` to every window so the app applies live.
//
// Invalid JSON is never applied and never destroys data: the last object that
// parsed successfully is kept in memory, so a patch arriving while the file on
// disk is broken merges over that snapshot instead of over `{}`.
// ---------------------------------------------------------------------------

import { promises as fsp, watch, type FSWatcher } from 'fs'
import { basename, dirname, join } from 'path'
import { app, BrowserWindow, ipcMain } from 'electron'
import { IPC } from '../../shared/ipc'
import { defaultSettings } from '../../shared/types'

/** A raw, un-validated settings object. The renderer normalizes it. */
export type RawSettings = Record<string, unknown>

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

// Accepts any object: the raw settings map, or the typed `AppSettings` from
// `defaultSettings()`. (`RawSettings` alone excludes AppSettings — no index sig.)
function serialize(settings: object): string {
  return JSON.stringify(settings, null, 2) + '\n'
}

/** Create the file with pretty defaults if it doesn't exist yet. */
async function ensureFile(): Promise<void> {
  const path = settingsPath()
  try {
    await fsp.access(path)
  } catch {
    await fsp.writeFile(path, serialize(defaultSettings()), 'utf8')
  }
}

async function readRaw(): Promise<string> {
  await ensureFile()
  return fsp.readFile(settingsPath(), 'utf8')
}

/**
 * Strict parse: throws on invalid JSON or a non-object root. Callers decide
 * whether to fall back — a broken file must never silently become `{}` and
 * get written back (that wiped presets/keybindings).
 */
export function parseStrict(raw: string): RawSettings {
  const val = JSON.parse(raw)
  if (!val || typeof val !== 'object' || Array.isArray(val)) {
    throw new Error('settings.json must contain a JSON object')
  }
  return val as RawSettings
}

/** The most recent object that parsed successfully (null until first read). */
let lastGood: RawSettings | null = null

/**
 * Parse the file into a raw object, remembering it as the last-good snapshot.
 * On a parse error returns the last-good object (or `{}` if there never was
 * one) WITHOUT touching disk, so a half-edited file degrades gracefully.
 */
export function parseLenient(raw: string): RawSettings {
  try {
    lastGood = parseStrict(raw)
    return lastGood
  } catch {
    return lastGood ?? {}
  }
}

/**
 * Merge a patch over the current settings. If `raw` doesn't parse, the merge
 * base is the last-good snapshot so an in-progress hand edit (or a stray
 * trailing comma) can't cause a rewrite that drops every other key.
 */
export function mergePatch(raw: string, patch: RawSettings): RawSettings {
  return { ...parseLenient(raw), ...patch }
}

/** Test hook: forget the in-memory last-good snapshot. */
export function _resetSettingsCache(): void {
  lastGood = null
}

function broadcast(settings: RawSettings): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.evtSettingsChanged, settings)
  }
}

let watcher: FSWatcher | null = null
let debounce: ReturnType<typeof setTimeout> | null = null

/**
 * Watch for external edits (e.g. the user editing settings.json elsewhere) and
 * rebroadcast. We watch the DIRECTORY, not the file: editors that save via
 * write-temp-then-rename (vim, VS Code) replace the inode, which makes a
 * file-level `fs.watch` go silent after the first save. Our own writes also
 * trip this — harmless, the payload is idempotent for the renderer store.
 */
function startWatch(): void {
  if (watcher) return
  const path = settingsPath()
  const name = basename(path)
  try {
    watcher = watch(dirname(path), (_event, filename) => {
      if (filename && filename !== name) return
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(() => {
        debounce = null
        void readRaw()
          .then((raw) => {
            // Only apply when the file parses — a mid-edit external save must
            // not reset every window to defaults.
            try {
              broadcast(parseStrict(raw))
              lastGood = parseStrict(raw)
            } catch {
              /* invalid JSON on disk — keep the last-good settings live */
            }
          })
          .catch(() => {})
      }, 100)
    })
  } catch {
    // Directory may not exist yet or platform quirk — non-fatal, live-apply
    // still works through the explicit write paths below.
  }
}

export function registerSettingsIpc(): void {
  // Ensure the file exists up front, then start watching it.
  void ensureFile().then(startWatch)

  ipcMain.handle(IPC.settingsGet, async (): Promise<RawSettings> => parseLenient(await readRaw()))

  ipcMain.handle(IPC.settingsGetRaw, async (): Promise<{ path: string; content: string }> => ({
    path: settingsPath(),
    content: await readRaw()
  }))

  ipcMain.handle(
    IPC.settingsSetRaw,
    async (_e, content: string): Promise<{ ok: boolean; error?: string }> => {
      // Always persist the user's text (it's their file); only apply/broadcast
      // when it parses, so a typo never resets the live app to defaults.
      await fsp.writeFile(settingsPath(), content, 'utf8')
      let parsed: RawSettings
      try {
        parsed = parseStrict(content)
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Invalid JSON' }
      }
      lastGood = parsed
      broadcast(parsed)
      return { ok: true }
    }
  )

  ipcMain.handle(IPC.settingsUpdate, async (_e, patch: RawSettings): Promise<RawSettings> => {
    // Merge the patch into the raw object — preserving any keys main doesn't
    // know about — then persist and broadcast. A broken file on disk merges
    // over the last-good snapshot instead of `{}` (see mergePatch).
    const next = mergePatch(await readRaw(), patch)
    await fsp.writeFile(settingsPath(), serialize(next), 'utf8')
    lastGood = next
    broadcast(next)
    return next
  })
}
