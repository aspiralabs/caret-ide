import { readFileSync } from 'fs'
import { join, basename } from 'path'
import { app, BrowserWindow, nativeTheme, shell, WebContentsView, type WebContents } from 'electron'
import { is } from '@electron-toolkit/utils'
import { IPC } from '../shared/ipc'
import type { ProjectInfo, ProjectTabsState, WindowMode } from '../shared/types'
import { shouldBlockNavigation } from './navigationGuard'
import { assertInsideRoot } from './security'
import { getTerminalWindowSize, saveSession, saveTerminalWindowSize } from './windowState'
import type { SavedWindow } from './sessionRestore'
import { cycleId, neighborAfterClose, reorderIds } from './projectTabs'

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
 * Per-project context. A project renders in its own WebContentsView, and a
 * host window shows one or more projects as title-bar tabs (only the active
 * one visible). Feature modules (pty, fs, browser, session) key their
 * per-project state off `id` and resolve the owning project from an IPC event
 * via `projectWindowFor`. The name predates tabs: it is a project, not a window.
 */
export interface ProjectWindow {
  /** The project renderer's webContents id — unique, and stable across window moves. */
  id: number
  root: string
  name: string
  /** The host window currently showing this project (changes when a tab moves). */
  win: BrowserWindow
  /** The project's own view inside `win`; preview browser views are its children. */
  view: WebContentsView
  /** The project renderer. Send project events here, never to `win.webContents`. */
  wc: WebContents
  /** Additional workspace folders (multi-root); fs access is allowed inside any of them. */
  extraRoots: string[]
  /**
   * `terminal` for a terminal-mode window (root = home). Subsystems that assume
   * a small root — watcher, git, sessions, quick-open — gate on this flag, not
   * on the path, so a real project at `~` keeps normal behaviour.
   */
  mode: WindowMode
}

/**
 * A native window holding project tabs. It loads nothing itself: its own
 * webContents sits empty under the project views and only forwards focus.
 */
interface HostWindow {
  win: BrowserWindow
  /** Tabs in display order. */
  tabs: ProjectWindow[]
  activeId: number | null
  /** Hosts the terminal-mode window: never receives other projects. */
  terminal: boolean
  /** Set while a window close walks its tabs, asking each to confirm. */
  closing: boolean
  /** The tabs as they were when a whole-window close began (what to reopen next launch). */
  frozen?: SavedWindow
}

/**
 * Persistence / dedupe key for a terminal-mode window. Deliberately not a path
 * so it never collides with a real project opened at `~` (spec §3.2).
 */
export const TERMINAL_WORKSPACE_KEY = '~terminal'

export function isTerminalMode(pw: ProjectWindow): boolean {
  return pw.mode === 'terminal'
}

/** Key for workspace state and the open-project map. */
export function workspaceKey(pw: ProjectWindow): string {
  return isTerminalMode(pw) ? TERMINAL_WORKSPACE_KEY : pw.root
}

/**
 * The folder project-scoped features (git status, sessions, quick-open,
 * search) act on: the project root, or in terminal mode the first adopted
 * folder — never `~`. Null when a terminal-mode window has adopted nothing.
 */
export function primaryRoot(pw: ProjectWindow): string | null {
  return isTerminalMode(pw) ? (pw.extraRoots[0] ?? null) : pw.root
}

/**
 * Validate `target` against the window's roots (primary + extras) and return
 * the containing root with the resolved path. Throws when it is inside none.
 */
export function resolveInRoots(pw: ProjectWindow, target: string): { root: string; abs: string } {
  let lastErr: unknown
  for (const root of [pw.root, ...pw.extraRoots]) {
    try {
      return { root, abs: assertInsideRoot(root, target) }
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`Path escapes project root: ${target}`)
}

const byWebContentsId = new Map<number, ProjectWindow>()
const byPath = new Map<string, ProjectWindow>()
/** Host windows by BrowserWindow id. */
const hosts = new Map<number, HostWindow>()
/** The host the user was last in — where a project opened from elsewhere (welcome, Dock, CLI) lands. */
let lastFocusedHostId: number | null = null
/** Latest document title per project, mirrored onto the host window while active. */
const titles = new Map<number, string>()
/** Projects with a Claude session waiting on the user (dot on their tab). */
const awaitingProjects = new Set<number>()

const closeListeners = new Set<(projectId: number) => void>()
const tabListeners = new Set<() => void>()
/** ⌘Q is closing every window: stop recording tabs so the session survives the teardown. */
let quitting = false

/**
 * Subscribe to project teardown so a feature module can dispose per-project
 * resources (ptys, WebContentsViews, watchers). Fires when a project tab closes
 * (or its window does) AND on a full renderer reload (ErrorBoundary "Reload",
 * View → Force Reload): the new document re-creates everything it needs, so
 * the old shells/views would otherwise leak — each reload spawning another set.
 */
export function onWindowClosed(cb: (projectId: number) => void): void {
  closeListeners.add(cb)
}

/** Subscribe to any tab change (open, close, switch, move) — Dock menu upkeep. */
export function onProjectTabsChanged(cb: () => void): void {
  tabListeners.add(cb)
}

function disposeWindowResources(projectId: number): void {
  awaitingProjects.delete(projectId)
  for (const cb of closeListeners) cb(projectId)
}

/**
 * Refuse top-level navigations away from the app document (see
 * navigationGuard.shouldBlockNavigation) — most importantly Chromium's default
 * for a file dropped on the DOM, which would replace the IDE with `file://…`.
 */
function guardNavigation(wc: WebContents): void {
  wc.on('will-navigate', (event, url) => {
    if (shouldBlockNavigation(wc.getURL(), url)) event.preventDefault()
  })
}

export function projectWindowFor(sender: WebContents): ProjectWindow | undefined {
  return byWebContentsId.get(sender.id)
}

export function allProjectWindows(): ProjectWindow[] {
  return [...byWebContentsId.values()]
}

/**
 * Every renderer running Caret UI (project tabs + the welcome screen), for
 * app-wide broadcasts. Host windows' own webContents are empty and excluded.
 */
export function allAppWebContents(): WebContents[] {
  const out = allProjectWindows().map((pw) => pw.wc)
  if (welcomeWindow && !welcomeWindow.isDestroyed()) out.push(welcomeWindow.webContents)
  return out.filter((wc) => !wc.isDestroyed())
}

/** The native window a renderer is shown in (a project's host, or the welcome window). */
export function windowForSender(sender: WebContents): BrowserWindow | null {
  return projectWindowFor(sender)?.win ?? BrowserWindow.fromWebContents(sender)
}

export function projectInfo(pw: ProjectWindow): ProjectInfo {
  return { root: pw.root, name: pw.name, mode: pw.mode }
}

function hostOf(pw: ProjectWindow): HostWindow | undefined {
  return hosts.get(pw.win.id)
}

function activeOf(host: HostWindow): ProjectWindow | undefined {
  return host.tabs.find((t) => t.id === host.activeId) ?? host.tabs[0]
}

/** True when `pw` is the visible tab of its window. */
export function isActiveTab(pw: ProjectWindow): boolean {
  return hostOf(pw)?.activeId === pw.id
}

function tabsState(host: HostWindow, selfId: number): ProjectTabsState {
  return {
    tabs: host.tabs.map((t) => ({
      id: t.id,
      root: t.root,
      name: t.name,
      mode: t.mode,
      awaiting: awaitingProjects.has(t.id)
    })),
    activeId: host.activeId,
    selfId
  }
}

/** The tab strip as seen from `sender`'s project. */
export function projectTabsFor(sender: WebContents): ProjectTabsState | null {
  const pw = projectWindowFor(sender)
  const host = pw && hostOf(pw)
  return pw && host ? tabsState(host, pw.id) : null
}

function broadcastTabs(host: HostWindow): void {
  for (const t of host.tabs) {
    if (!t.wc.isDestroyed()) t.wc.send(IPC.evtProjectTabs, tabsState(host, t.id))
  }
  for (const cb of tabListeners) cb()
  persistSession()
}

function savedWindowOf(host: HostWindow): SavedWindow {
  const projects = host.tabs.filter((t) => t.mode === 'project')
  const active = activeOf(host)
  return { roots: projects.map((t) => t.root), active: active && active.mode === 'project' ? active.root : null }
}

function projectHosts(): HostWindow[] {
  return [...hosts.values()].filter((h) => !h.terminal)
}

/**
 * Record the open project tabs for the next launch. A window mid-close counts
 * with the tabs it had when the close began (its tabs leave one by one), and
 * nothing is recorded while quitting.
 */
function persistSession(): void {
  if (quitting) return
  const windows = projectHosts()
    .map((h) => h.frozen ?? savedWindowOf(h))
    .filter((w) => w.roots.length > 0)
  try {
    saveSession(windows)
  } catch {
    // Disk trouble: the next launch just opens what it opened before.
  }
}

/** The app is quitting (before-quit): freeze the recorded session. */
export function markQuitting(): void {
  quitting = true
}

/** Flag `pw`'s tab as awaiting input (or not); re-pushes the strip only on a change. */
export function setProjectAwaiting(pw: ProjectWindow, awaiting: boolean): void {
  if (awaitingProjects.has(pw.id) === awaiting) return
  if (awaiting) awaitingProjects.add(pw.id)
  else awaitingProjects.delete(pw.id)
  const host = hostOf(pw)
  if (host) broadcastTabs(host)
}

/** Size every project view to the window's content area (views don't auto-resize). */
function layoutHost(host: HostWindow): void {
  if (host.win.isDestroyed()) return
  const { width, height } = host.win.getContentBounds()
  for (const t of host.tabs) t.view.setBounds({ x: 0, y: 0, width, height })
}

function syncTitle(host: HostWindow): void {
  const active = activeOf(host)
  if (active && !host.win.isDestroyed()) host.win.setTitle(titles.get(active.id) || active.name)
}

/** Show `pw` in its window, hide its siblings, and tell every tab. */
export function activateProject(pw: ProjectWindow): void {
  const host = hostOf(pw)
  if (!host) return
  host.activeId = pw.id
  for (const t of host.tabs) t.view.setVisible(t.id === pw.id)
  syncTitle(host)
  if (!host.win.isDestroyed() && host.win.isFocused() && !pw.wc.isDestroyed()) pw.wc.focus()
  broadcastTabs(host)
}

/** Bring a project's window to the front with its tab selected. */
export function focusProject(pw: ProjectWindow): void {
  activateProject(pw)
  if (pw.win.isDestroyed()) return
  if (pw.win.isMinimized()) pw.win.restore()
  pw.win.focus()
  if (!pw.wc.isDestroyed()) pw.wc.focus()
}

/** The renderer that should receive a native-menu command: the focused window's visible tab. */
export function menuTargetWebContents(): WebContents | undefined {
  const focused = BrowserWindow.getFocusedWindow()
  if (focused) {
    const host = hosts.get(focused.id)
    if (!host) return focused.webContents // welcome screen
    return activeOf(host)?.wc
  }
  const host = defaultHost() ?? [...hosts.values()][0]
  return host && activeOf(host)?.wc
}

function attach(pw: ProjectWindow, host: HostWindow, index = host.tabs.length): void {
  pw.win = host.win
  host.tabs.splice(index, 0, pw)
  host.win.contentView.addChildView(pw.view)
  layoutHost(host)
}

/** Take `pw` out of its window, handing the active slot to a neighbour. */
function detach(pw: ProjectWindow, host: HostWindow): void {
  const next = neighborAfterClose(
    host.tabs.map((t) => t.id),
    pw.id
  )
  host.tabs = host.tabs.filter((t) => t !== pw)
  if (host.activeId === pw.id) host.activeId = next
  if (!host.win.isDestroyed()) {
    try {
      host.win.contentView.removeChildView(pw.view)
    } catch {
      /* not attached */
    }
  }
}

/** After a tab left `host`: close the window if it's empty, else show the new active tab. */
function settleHost(host: HostWindow): void {
  if (host.win.isDestroyed()) return
  if (host.tabs.length === 0) {
    host.win.close()
    return
  }
  const active = activeOf(host)
  if (active) activateProject(active)
}

function createHost(opts: { terminal?: boolean; near?: BrowserWindow } = {}): HostWindow {
  const terminal = opts.terminal === true
  const size = terminal ? getTerminalWindowSize() : { width: 1440, height: 900 }
  const near = opts.near && !opts.near.isDestroyed() ? opts.near.getPosition() : null
  const win = new BrowserWindow({
    ...size,
    ...(near ? { x: near[0] + 32, y: near[1] + 32 } : {}),
    minWidth: 720,
    minHeight: 480,
    show: false,
    title: terminal ? 'Terminal' : 'Caret',
    backgroundColor: startupBackgroundColor(),
    // macOS native look (spec §9.3): traffic lights inset, draggable top strip in renderer.
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 14 },
    // Nothing is ever loaded here; the project views carry the UI.
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
  })
  // Captured up front: win.id can't be read once the window is destroyed.
  const windowId = win.id
  const host: HostWindow = { win, tabs: [], activeId: null, terminal, closing: false }
  hosts.set(windowId, host)

  win.on('resize', () => layoutHost(host))
  // Keystrokes follow the visible tab, not the host's empty page.
  win.on('focus', () => {
    lastFocusedHostId = windowId
    const active = activeOf(host)
    if (active && !active.wc.isDestroyed()) active.wc.focus()
  })

  // A terminal-mode window remembers its own size (project windows keep the
  // fixed default). Saved on resize-end, not per frame.
  if (terminal) {
    let resizeTimer: ReturnType<typeof setTimeout> | null = null
    win.on('resize', () => {
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        resizeTimer = null
        if (win.isDestroyed() || win.isMaximized() || win.isFullScreen()) return
        const [width, height] = win.getSize()
        saveTerminalWindowSize({ width, height })
      }, 300)
    })
  }

  // Unsaved-changes guard (traffic light, Close Window, ⌘Q — which closes every
  // window and is cancelled if any close is prevented). Each tab is asked in
  // turn (see askNextTab); the window really closes once none are left.
  win.on('close', (event) => {
    if (host.tabs.length === 0) return
    event.preventDefault()
    if (host.closing) return
    host.closing = true
    host.frozen = savedWindowOf(host)
    askNextTab(host)
  })

  win.on('closed', () => {
    // Like the welcome screen, a terminal window going away shouldn't quit the
    // app on macOS: the Dock brings a fresh one back (Terminal.app convention).
    lastClosedWasWelcome = terminal
    hosts.delete(windowId)
    if (lastFocusedHostId === windowId) lastFocusedHostId = null
    // Normally empty by now; a window destroyed some other way takes its tabs with it.
    for (const pw of [...host.tabs]) destroyProject(pw)
    for (const cb of tabListeners) cb()
    // Closing the last project window (traffic light, ⌘⇧W) quits the app:
    // keep it in the session so it reopens. Closing one of several, or a
    // window its last tab's ✕ emptied, drops it.
    const lastWindowClosed = !!host.frozen && projectHosts().length === 0
    if (!lastWindowClosed) persistSession()
  })

  return host
}

/** Where a project opened from outside any window (welcome, Dock, CLI) goes as a tab. */
function defaultHost(): HostWindow | undefined {
  const usable = (h: HostWindow | undefined): h is HostWindow => !!h && !h.terminal && !h.win.isDestroyed()
  const focused = BrowserWindow.getFocusedWindow()
  const candidates = [focused ? hosts.get(focused.id) : undefined, lastFocusedHostId === null ? undefined : hosts.get(lastFocusedHostId)]
  return candidates.find(usable) ?? [...hosts.values()].find(usable)
}

/**
 * Ask a project to close: it prompts for unsaved editors and answers through
 * `replyClose`. A renderer that can't answer (loading, crashed) is closed
 * outright so a wedged tab can always go away.
 */
function askToClose(pw: ProjectWindow): void {
  const wc = pw.wc
  if (wc.isDestroyed() || wc.isCrashed() || wc.isLoadingMainFrame()) {
    destroyProject(pw)
    return
  }
  // Show the tab so its "save changes?" prompt has context.
  activateProject(pw)
  wc.send(IPC.evtWindowCloseRequested)
}

function askNextTab(host: HostWindow): void {
  const next = activeOf(host)
  if (next) askToClose(next)
  else if (!host.win.isDestroyed()) host.win.close()
}

/** Close a project tab (asking about unsaved work first). */
export function requestCloseProject(pw: ProjectWindow): void {
  askToClose(pw)
}

/**
 * Renderer's answer to a close request. `true` closes that project's tab (and
 * carries on through the window if the whole window is closing); `false`
 * cancels — including the rest of a window close.
 */
export function replyClose(sender: WebContents, ok: boolean): void {
  const pw = byWebContentsId.get(sender.id)
  if (!pw) return
  const host = hostOf(pw)
  if (!ok) {
    if (host) {
      host.closing = false
      host.frozen = undefined
    }
    // A cancelled close also cancels ⌘Q; record tab changes again.
    quitting = false
    return
  }
  destroyProject(pw)
}

/** Tear a project down now: dispose its resources, drop its tab, close its renderer. */
function destroyProject(pw: ProjectWindow): void {
  if (byWebContentsId.get(pw.id) !== pw) return
  const host = hostOf(pw)
  byWebContentsId.delete(pw.id)
  if (byPath.get(workspaceKey(pw)) === pw) byPath.delete(workspaceKey(pw))
  titles.delete(pw.id)
  disposeWindowResources(pw.id)
  if (host) detach(pw, host)
  // View webContents aren't owned by the window; they must be closed by hand.
  if (!pw.wc.isDestroyed()) pw.wc.close()
  if (!host) return
  if (host.closing && host.tabs.length > 0) askNextTab(host)
  else settleHost(host)
}

/** If the project (or, for TERMINAL_WORKSPACE_KEY, the terminal window) is already open, focus it and return true. */
export function focusIfOpen(root: string): boolean {
  const existing = byPath.get(root)
  if (!existing) return false
  focusProject(existing)
  return true
}

export interface CreateProjectOptions {
  mode?: WindowMode
  /**
   * Open as a tab: in `into`'s window when given (the sender of "+"), else the
   * window the user was last in. Without it the project gets a new window.
   */
  tabbed?: boolean
  into?: WebContents
  /** Always start a new window (session restore: the first tab of each saved window). */
  newWindow?: boolean
}

export function createProjectWindow(root: string, opts: CreateProjectOptions = {}): ProjectWindow {
  const mode: WindowMode = opts.mode ?? 'project'
  const terminal = mode === 'terminal'
  const name = terminal ? 'Terminal' : basename(root)

  const sender = opts.into ? projectWindowFor(opts.into) : undefined
  const senderHost = sender && hostOf(sender)
  const target =
    !terminal && opts.tabbed && !opts.newWindow
      ? senderHost && !senderHost.terminal
        ? senderHost
        : defaultHost()
      : undefined
  const host = target ?? createHost({ terminal })

  const view = new WebContentsView({
    webPreferences: {
      // electron-vite emits the preload as ESM (.mjs) because package.json is "type":"module".
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  view.setBackgroundColor(startupBackgroundColor())
  const wc = view.webContents
  const pw: ProjectWindow = { id: wc.id, root, name, win: host.win, view, wc, extraRoots: [], mode }
  byWebContentsId.set(pw.id, pw)
  byPath.set(workspaceKey(pw), pw)

  // Open real external links (not app-internal target=_blank browser tabs) in the OS browser.
  wc.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  guardNavigation(wc)

  // A full renderer reload tears down the old document: dispose its ptys and
  // browser views now, exactly as if the project had closed (bug: each reload
  // used to leak a set of shells + Chromium renderers).
  wc.on('did-start-navigation', (details) => {
    if (details.isMainFrame && !details.isSameDocument) disposeWindowResources(pw.id)
  })

  // The renderer's document.title (OSC 7 cwd in terminal mode) becomes the
  // window title while this tab is showing.
  wc.on('page-title-updated', (_e, title) => {
    titles.set(pw.id, title)
    const h = hostOf(pw)
    if (h && h.activeId === pw.id) syncTitle(h)
  })

  // A crashed renderer can't answer close requests; drop it from the strip.
  wc.on('render-process-gone', () => destroyProject(pw))

  attach(pw, host)
  activateProject(pw)

  if (!host.win.isVisible()) {
    const show = (): void => {
      if (host.win.isDestroyed() || host.win.isVisible()) return
      host.win.show()
      if (!wc.isDestroyed()) wc.focus()
    }
    wc.once('did-finish-load', show)
    wc.once('did-fail-load', show)
  } else {
    focusProject(pw)
  }

  // The `#terminal` hash tells the renderer to boot in terminal mode before any
  // store hydrates (same mechanism as `#welcome`).
  loadRenderer(wc, terminal ? 'terminal' : undefined)

  return pw
}

/**
 * Open the terminal-mode window (a project window rooted at home, see spec
 * §3.2), or focus it if one is already open. One at a time: a second `~`
 * window is a listed follow-up (§7.2).
 */
export function createOrFocusTerminalWindow(): ProjectWindow {
  const existing = byPath.get(TERMINAL_WORKSPACE_KEY)
  if (existing) {
    focusProject(existing)
    return existing
  }
  return createProjectWindow(app.getPath('home'), { mode: 'terminal' })
}

/** Show the tab `id` of `sender`'s window. */
export function activateTab(sender: WebContents, id: number): void {
  const pw = projectWindowFor(sender)
  const target = byWebContentsId.get(id)
  if (pw && target && target.win === pw.win) activateProject(target)
}

/** Step `sender`'s window to its next / previous tab. */
export function cycleTab(sender: WebContents, dir: 1 | -1): void {
  const pw = projectWindowFor(sender)
  const host = pw && hostOf(pw)
  if (!host) return
  const id = cycleId(
    host.tabs.map((t) => t.id),
    host.activeId,
    dir
  )
  const next = id === null ? undefined : byWebContentsId.get(id)
  if (next) activateProject(next)
}

/** Close tab `id` of `sender`'s window. */
export function closeTab(sender: WebContents, id: number): void {
  const pw = projectWindowFor(sender)
  const target = byWebContentsId.get(id)
  if (pw && target && target.win === pw.win) requestCloseProject(target)
}

export function reorderTabs(sender: WebContents, order: unknown): void {
  const pw = projectWindowFor(sender)
  const host = pw && hostOf(pw)
  if (!host || !Array.isArray(order)) return
  const ids = reorderIds(
    host.tabs.map((t) => t.id),
    order
  )
  host.tabs = ids.map((id) => byWebContentsId.get(id)).filter((t): t is ProjectWindow => !!t)
  broadcastTabs(host)
}

/** Pull tab `id` into a new window of its own (no-op when it is already alone). */
export function detachTab(sender: WebContents, id: number): void {
  const pw = projectWindowFor(sender)
  const target = byWebContentsId.get(id)
  const from = target && hostOf(target)
  if (!pw || !target || !from || target.win !== pw.win || from.tabs.length < 2) return
  const to = createHost({ terminal: from.terminal, near: from.win })
  detach(target, from)
  attach(target, to)
  activateProject(target)
  settleHost(from)
  to.win.show()
  focusProject(target)
}

/** Move every other (non-terminal) window's tabs into `sender`'s window. */
export function mergeAllWindows(sender: WebContents): void {
  const pw = projectWindowFor(sender)
  const into = pw && hostOf(pw)
  if (!pw || !into || into.terminal) return
  for (const host of [...hosts.values()]) {
    if (host === into || host.terminal) continue
    for (const t of [...host.tabs]) {
      detach(t, host)
      attach(t, into)
      t.view.setVisible(false)
    }
    settleHost(host)
  }
  activateProject(pw)
}

/**
 * Load the renderer into a project view or the welcome window. An optional URL
 * hash (e.g. `welcome`) lets the same bundle boot into a different top-level
 * view without a separate html.
 */
function loadRenderer(wc: WebContents, hash?: string): void {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    wc.loadURL(process.env['ELECTRON_RENDERER_URL'] + (hash ? `#${hash}` : ''))
  } else {
    wc.loadFile(join(__dirname, '../renderer/index.html'), hash ? { hash } : undefined)
  }
}

// The welcome screen is project-less, so it lives OUTSIDE the project-window
// maps (feature IPC keyed on a project window never resolves it). At most one
// exists at a time.
let welcomeWindow: BrowserWindow | null = null

/**
 * True when the most recently closed window was the welcome screen or a
 * terminal-mode window. Consulted by `window-all-closed`: dismissing either
 * shouldn't quit the app on macOS (Dock/`activate` brings one back), whereas
 * closing the last project window does.
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

  guardNavigation(win.webContents)
  win.on('ready-to-show', () => win.show())
  win.on('closed', () => {
    lastClosedWasWelcome = true
    if (welcomeWindow === win) welcomeWindow = null
  })

  loadRenderer(win.webContents, 'welcome')
  return win
}

/** Close the welcome window if open (called after it launches a project). */
export function closeWelcomeWindow(): void {
  if (welcomeWindow && !welcomeWindow.isDestroyed()) welcomeWindow.close()
  welcomeWindow = null
}
