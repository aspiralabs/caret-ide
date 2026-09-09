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
// ---------------------------------------------------------------------------

import { promises as fsp, watch, type FSWatcher } from 'fs'
import { join } from 'path'
import { app, BrowserWindow, ipcMain } from 'electron'
import { IPC } from '../../shared/ipc'
import { defaultSettings } from '../../shared/types'

/** A raw, un-validated settings object. The renderer normalizes it. */
type RawSettings = Record<string, unknown>

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

function serialize(settings: RawSettings): string {
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

/** Parse the file into a raw object; `{}` on any parse error (the renderer will
 *  fill defaults). No key stripping — unknown keys are preserved verbatim. */
function parse(raw: string): RawSettings {
  try {
    const val = JSON.parse(raw)
    return val && typeof val === 'object' ? (val as RawSettings) : {}
  } catch {
    return {}
  }
}

function broadcast(settings: RawSettings): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.evtSettingsChanged, settings)
  }
}

let watcher: FSWatcher | null = null
let debounce: ReturnType<typeof setTimeout> | null = null

/** Watch the file for external edits (e.g. the user editing it elsewhere) and
 *  rebroadcast. Our own writes also trip this — harmless, the payload is
 *  idempotent for the renderer store. */
function startWatch(): void {
  if (watcher) return
  try {
    watcher = watch(settingsPath(), () => {
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(() => {
        debounce = null
        void readRaw()
          .then((raw) => broadcast(parse(raw)))
          .catch(() => {})
      }, 100)
    })
  } catch {
    // File may not exist yet or platform quirk — non-fatal, live-apply still
    // works through the explicit write paths below.
  }
}

export function registerSettingsIpc(): void {
  // Ensure the file exists up front, then start watching it.
  void ensureFile().then(startWatch)

  ipcMain.handle(IPC.settingsGet, async (): Promise<RawSettings> => parse(await readRaw()))

  ipcMain.handle(IPC.settingsGetRaw, async (): Promise<{ path: string; content: string }> => ({
    path: settingsPath(),
    content: await readRaw()
  }))

  ipcMain.handle(
    IPC.settingsSetRaw,
    async (_e, content: string): Promise<{ ok: boolean; error?: string }> => {
      // Always persist the user's text; only apply/broadcast when it parses.
      await fsp.writeFile(settingsPath(), content, 'utf8')
      try {
        broadcast(parse(content))
        return { ok: true }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Invalid JSON' }
      }
    }
  )

  ipcMain.handle(IPC.settingsUpdate, async (_e, patch: RawSettings): Promise<RawSettings> => {
    // Merge the patch into the raw object — preserving any keys main doesn't
    // know about — then persist and broadcast.
    const next = { ...parse(await readRaw()), ...patch }
    await fsp.writeFile(settingsPath(), serialize(next), 'utf8')
    broadcast(next)
    return next
  })
}
