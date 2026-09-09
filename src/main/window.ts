import { readFileSync } from 'fs'
import { join, basename } from 'path'
import { app, BrowserWindow, nativeTheme, shell, type WebContents } from 'electron'
import { is } from '@electron-toolkit/utils'
import type { ProjectInfo } from '../shared/types'

// Native window backgrounds for the brief moment before the renderer paints —
// must match --ink-bg in src/renderer/src/index.css for a seamless first frame.
const BG_DARK = '#181818'
const BG_LIGHT = '#ffffff'

/**
 * Best-effort resolve of the startup background from the persisted theme, so a
 * light-theme user doesn't get a dark flash (and vice-versa) before the renderer
 * mounts. Reads settings.json synchronously; any failure falls back to the OS.
 */
function startupBackgroundColor(): string {
  let theme: unknown = 'system'
  try {
    const raw = readFileSync(join(app.getPath('userData'), 'settings.json'), 'utf8')
    theme = (JSON.parse(raw) as { theme?: unknown }).theme
  } catch {
    // No file yet / unreadable / invalid JSON — fall through to the OS default.
  }
  if (theme === 'light') return BG_LIGHT
  if (theme === 'dark') return BG_DARK
  return nativeTheme.shouldUseDarkColors ? BG_DARK : BG_LIGHT
}

/**
 * Per-window project context. One window == one project (spec §4).
 * Feature modules (pty, fs, browser, session) key their per-project state off
 * `id` and resolve the owning window from an IPC event via `projectWindowFor`.
 */
export interface ProjectWindow {
  id: number
  root: string
  name: string
  win: BrowserWindow
}

const byWebContentsId = new Map<number, ProjectWindow>()
const byWindowId = new Map<number, ProjectWindow>()
const byPath = new Map<string, ProjectWindow>()

const closeListeners = new Set<(windowId: number) => void>()

/** Subscribe to window-closed so a feature module can dispose per-window resources. */
export function onWindowClosed(cb: (windowId: number) => void): void {
  closeListeners.add(cb)
}

export function projectWindowFor(sender: WebContents): ProjectWindow | undefined {
  return byWebContentsId.get(sender.id)
}

export function projectWindowById(windowId: number): ProjectWindow | undefined {
  return byWindowId.get(windowId)
}

export function allProjectWindows(): ProjectWindow[] {
  return [...byWindowId.values()]
}

export function projectInfo(pw: ProjectWindow): ProjectInfo {
  return { root: pw.root, name: pw.name }
}

/** If the project is already open, focus its window and return true. */
export function focusIfOpen(root: string): boolean {
  const existing = byPath.get(root)
  if (existing) {
    if (existing.win.isMinimized()) existing.win.restore()
    existing.win.focus()
    return true
  }
  return false
}

export function createProjectWindow(root: string): ProjectWindow {
  const name = basename(root)
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 720,
    minHeight: 480,
    show: false,
    title: name,
    backgroundColor: startupBackgroundColor(),
    // macOS native look (spec §9.3): traffic lights inset, draggable top strip in renderer.
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 14 },
    webPreferences: {
      // electron-vite emits the preload as ESM (.mjs) because package.json is "type":"module".
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Capture ids up front: inside the 'closed' handler win.webContents is already
  // destroyed, so reading win.webContents.id there throws "Object has been destroyed".
  const webContentsId = win.webContents.id
  const windowId = win.id

  const pw: ProjectWindow = { id: windowId, root, name, win }
  byWebContentsId.set(webContentsId, pw)
  byWindowId.set(windowId, pw)
  byPath.set(root, pw)

  win.on('ready-to-show', () => win.show())

  // Open real external links (not app-internal target=_blank browser tabs) in the OS browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  win.on('closed', () => {
    byWebContentsId.delete(webContentsId)
    byWindowId.delete(windowId)
    byPath.delete(root)
    for (const cb of closeListeners) cb(windowId)
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return pw
}
