import { readFileSync } from 'fs'
import { join, basename } from 'path'
import { app, BrowserWindow, nativeTheme, shell, type WebContents } from 'electron'
import { is } from '@electron-toolkit/utils'
import { IPC } from '../shared/ipc'
import type { ProjectInfo } from '../shared/types'
import { shouldBlockNavigation } from './navigationGuard'

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

/**
 * Subscribe to window teardown so a feature module can dispose per-window
 * resources (ptys, WebContentsViews, watchers). Fires on window close AND on a
 * full renderer reload (ErrorBoundary "Reload", View → Force Reload): the new
 * document re-creates everything it needs, so the old shells/views would
 * otherwise leak — each reload spawning another set.
 */
export function onWindowClosed(cb: (windowId: number) => void): void {
  closeListeners.add(cb)
}

function disposeWindowResources(windowId: number): void {
  for (const cb of closeListeners) cb(windowId)
}

/** Windows whose renderer has approved the pending close (unsaved-work check passed). */
const closeApproved = new Set<number>()

/**
 * Renderer's answer to a close request. `true` lets the close proceed (the
 * window is closed again, this time without asking); `false` cancels it.
 */
export function replyClose(sender: WebContents, ok: boolean): void {
  const pw = byWebContentsId.get(sender.id)
  if (!pw || pw.win.isDestroyed()) return
  if (!ok) return
  closeApproved.add(pw.id)
  pw.win.close()
}

/**
 * Refuse top-level navigations away from the app document (see
 * navigationGuard.shouldBlockNavigation) — most importantly Chromium's default
 * for a file dropped on the DOM, which would replace the IDE with `file://…`.
 */
function guardNavigation(win: BrowserWindow): void {
  win.webContents.on('will-navigate', (event, url) => {
    if (shouldBlockNavigation(win.webContents.getURL(), url)) event.preventDefault()
  })
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

  guardNavigation(win)

  // Unsaved-changes guard (traffic light, ⌘⇧W, ⌘Q — which closes every window
  // and is cancelled if any close is prevented). Ask the renderer first; it
  // prompts per dirty editor and answers via IPC.windowCloseReply. Skipped when
  // the renderer can't answer (still loading, crashed) so a wedged window can
  // always be closed.
  win.on('close', (event) => {
    if (closeApproved.has(windowId)) return
    const wc = win.webContents
    if (wc.isDestroyed() || wc.isCrashed() || wc.isLoadingMainFrame()) return
    event.preventDefault()
    wc.send(IPC.evtWindowCloseRequested)
  })

  // A full renderer reload tears down the old document: dispose its ptys and
  // browser views now, exactly as if the window had closed (bug: each reload
  // used to leak a set of shells + Chromium renderers).
  win.webContents.on('did-start-navigation', (details) => {
    if (details.isMainFrame && !details.isSameDocument) disposeWindowResources(windowId)
  })

  win.on('closed', () => {
    lastClosedWasWelcome = false
    byWebContentsId.delete(webContentsId)
    byWindowId.delete(windowId)
    byPath.delete(root)
    closeApproved.delete(windowId)
    disposeWindowResources(windowId)
  })

  loadRenderer(win)

  return pw
}

/**
 * Load the renderer into a window. An optional URL hash (e.g. `welcome`) lets
 * the same bundle boot into a different top-level view without a separate html.
 */
function loadRenderer(win: BrowserWindow, hash?: string): void {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'] + (hash ? `#${hash}` : ''))
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), hash ? { hash } : undefined)
  }
}

// The welcome screen is project-less, so it lives OUTSIDE the project-window
// maps (feature IPC keyed on a project window never resolves it). At most one
// exists at a time.
let welcomeWindow: BrowserWindow | null = null

/**
 * True when the most recently closed window was the welcome screen. Consulted
 * by `window-all-closed`: dismissing the welcome screen shouldn't quit the app
 * on macOS (Dock/`activate` brings it back), whereas closing the last project
 * window does.
 */
let lastClosedWasWelcome = false

export function wasLastClosedWelcome(): boolean {
  return lastClosedWasWelcome
}

/** Open the welcome screen, or focus it if already open. */
export function createOrFocusWelcomeWindow(): BrowserWindow {
  if (welcomeWindow && !welcomeWindow.isDestroyed()) {
    if (welcomeWindow.isMinimized()) welcomeWindow.restore()
    welcomeWindow.focus()
    return welcomeWindow
  }

  const win = new BrowserWindow({
    width: 860,
    height: 600,
    minWidth: 620,
    minHeight: 460,
    show: false,
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    title: 'Caret',
    backgroundColor: startupBackgroundColor(),
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 14 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  welcomeWindow = win

  guardNavigation(win)
  win.on('ready-to-show', () => win.show())
  win.on('closed', () => {
    lastClosedWasWelcome = true
    if (welcomeWindow === win) welcomeWindow = null
  })

  loadRenderer(win, 'welcome')
  return win
}

/** Close the welcome window if open (called after it launches a project). */
export function closeWelcomeWindow(): void {
  if (welcomeWindow && !welcomeWindow.isDestroyed()) welcomeWindow.close()
  welcomeWindow = null
}
