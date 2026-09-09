// ---------------------------------------------------------------------------
// Browser-preview IPC (spec §5.3) — the careful one.
//
// Each browser tab owns exactly one main-process `WebContentsView` for its
// lifetime. Views float above the renderer's DOM. Normally one view is visible,
// but split view can show SEVERAL at once — each positioned by its own bounds
// rect (`setVisible` takes the full set of tabs that should be attached). Every
// other view is detached (but kept alive, preserving its page). Closing a tab
// DESTROYS its view — leaking Chromium renderers is the memory bug called out in
// the spec.
//
// DevTools are shown INLINE: toggling opens a second WebContentsView that hosts
// the devtools, and the preview area is split (page on top, devtools docked at
// the bottom). The renderer still reports a single bounds rect; main splits it.
// ---------------------------------------------------------------------------

import { ipcMain, WebContentsView, type IpcMainInvokeEvent } from 'electron'
import { IPC } from '../../shared/ipc'
import type {
  BrowserFaviconEvent,
  BrowserFindOptions,
  BrowserFoundEvent,
  BrowserNavEvent,
  BrowserNewTabEvent,
  BrowserOpenFindEvent,
  BrowserOpenPaletteEvent,
  BrowserStopFindAction,
  BrowserTitleEvent,
  PickedElement,
  Rect
} from '../../shared/types'
import { onWindowClosed, projectWindowFor, type ProjectWindow } from '../window'
import { PICKER_SOURCE } from './elementPicker'

interface WindowBrowsers {
  /** tabId → page view. */
  views: Map<string, WebContentsView>
  /** tabId → inline devtools host view (only while devtools are open). */
  devtools: Map<string, WebContentsView>
  /** tabId → last full bounds reported by the renderer (used to re-split). */
  bounds: Map<string, Rect>
  /** The currently-attached/visible tabIds (more than one in split view). */
  visibleTabIds: Set<string>
}

/** Fraction of the preview height the inline devtools occupy. */
const DEVTOOLS_FRACTION = 0.4
const DEVTOOLS_MIN_HEIGHT = 160

const perWindow = new Map<number, WindowBrowsers>()

function requireWindow(event: IpcMainInvokeEvent): ProjectWindow {
  const pw = projectWindowFor(event.sender)
  if (!pw) throw new Error('No project window for sender')
  return pw
}

function stateFor(windowId: number): WindowBrowsers {
  let s = perWindow.get(windowId)
  if (!s) {
    s = { views: new Map(), devtools: new Map(), bounds: new Map(), visibleTabIds: new Set() }
    perWindow.set(windowId, s)
  }
  return s
}

/** True if the view's webContents is still usable. */
function alive(view: WebContentsView | undefined): view is WebContentsView {
  return !!view && !view.webContents.isDestroyed()
}

function detach(pw: ProjectWindow, view: WebContentsView | undefined): void {
  if (!alive(view) || pw.win.isDestroyed()) return
  try {
    pw.win.contentView.removeChildView(view)
  } catch {
    /* not attached */
  }
}

function attach(pw: ProjectWindow, view: WebContentsView | undefined): void {
  if (!alive(view) || pw.win.isDestroyed()) return
  pw.win.contentView.addChildView(view)
}

/**
 * Position the page view (and its inline devtools, if open) for a tab using the
 * last full bounds the renderer reported. When devtools are open the rect is
 * split vertically: page on top, devtools docked at the bottom.
 */
function applyLayout(pw: ProjectWindow, tabId: string): void {
  const state = stateFor(pw.id)
  const view = state.views.get(tabId)
  const rect = state.bounds.get(tabId)
  if (!alive(view) || !rect) return

  const x = Math.round(rect.x)
  const y = Math.round(rect.y)
  const width = Math.round(rect.width)
  const height = Math.round(rect.height)

  const dt = state.devtools.get(tabId)
  if (alive(dt)) {
    const dtHeight = Math.min(
      Math.max(DEVTOOLS_MIN_HEIGHT, Math.round(height * DEVTOOLS_FRACTION)),
      Math.max(0, height - 80)
    )
    const pageHeight = Math.max(0, height - dtHeight)
    view.setBounds({ x, y, width, height: pageHeight })
    dt.setBounds({ x, y: y + pageHeight, width, height: dtHeight })
  } else {
    view.setBounds({ x, y, width, height })
  }
}

/** Emit the current navigation snapshot for a tab (used by many wc events). */
function emitNav(pw: ProjectWindow, tabId: string, view: WebContentsView): void {
  if (pw.win.isDestroyed() || view.webContents.isDestroyed()) return
  const wc = view.webContents
  const payload: BrowserNavEvent = {
    tabId,
    url: wc.getURL(),
    canGoBack: wc.navigationHistory.canGoBack(),
    canGoForward: wc.navigationHistory.canGoForward(),
    isLoading: wc.isLoadingMainFrame()
  }
  pw.win.webContents.send(IPC.evtBrowserNav, payload)
}

function createView(pw: ProjectWindow, tabId: string, url: string): void {
  const state = stateFor(pw.id)
  if (state.views.has(tabId)) return // idempotent — no-op if it already exists

  const view = new WebContentsView({ webPreferences: {} })
  const wc = view.webContents
  state.views.set(tabId, view)

  // Navigation state changes → renderer keeps its URL bar / nav buttons in sync.
  wc.on('did-navigate', () => emitNav(pw, tabId, view))
  wc.on('did-navigate-in-page', () => emitNav(pw, tabId, view))
  wc.on('did-start-loading', () => emitNav(pw, tabId, view))
  wc.on('did-stop-loading', () => emitNav(pw, tabId, view))

  wc.on('page-title-updated', (_e, title) => {
    if (pw.win.isDestroyed()) return
    const payload: BrowserTitleEvent = { tabId, title }
    pw.win.webContents.send(IPC.evtBrowserTitle, payload)
  })

  wc.on('page-favicon-updated', (_e, favicons) => {
    if (pw.win.isDestroyed()) return
    const payload: BrowserFaviconEvent = { tabId, favicons }
    pw.win.webContents.send(IPC.evtBrowserFavicon, payload)
  })

  // Find-in-page results (⌘F) → renderer keeps its find bar's "3/12" in sync.
  wc.on('found-in-page', (_e, result) => {
    if (pw.win.isDestroyed()) return
    const payload: BrowserFoundEvent = {
      tabId,
      activeMatchOrdinal: result.activeMatchOrdinal,
      matches: result.matches,
      finalUpdate: result.finalUpdate
    }
    pw.win.webContents.send(IPC.evtBrowserFound, payload)
  })

  // ⌘F / ⌘P pressed WHILE the native page holds keyboard focus: the renderer's
  // own keydown listener never fires (focus is in Chromium, not our DOM), so we
  // intercept the chords here and ask the renderer to act. Without this, find and
  // the command palette are dead whenever a browser tab has focus.
  wc.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || input.alt) return
    const mod = process.platform === 'darwin' ? input.meta : input.control
    if (!mod) return
    const key = input.key.toLowerCase()
    if (key === 'f' && !input.shift) {
      event.preventDefault()
      if (pw.win.isDestroyed()) return
      const payload: BrowserOpenFindEvent = { tabId }
      pw.win.webContents.send(IPC.evtBrowserOpenFind, payload)
    } else if (key === 'p') {
      event.preventDefault()
      if (pw.win.isDestroyed()) return
      const payload: BrowserOpenPaletteEvent = { commandMode: input.shift }
      pw.win.webContents.send(IPC.evtBrowserOpenPalette, payload)
    }
  })

  // target=_blank / window.open opens an in-app browser tab, not an OS window.
  wc.setWindowOpenHandler(({ url: newUrl }) => {
    if (!pw.win.isDestroyed()) {
      const payload: BrowserNewTabEvent = { url: newUrl }
      pw.win.webContents.send(IPC.evtBrowserNewTab, payload)
    }
    return { action: 'deny' }
  })

  wc.loadURL(url).catch(() => {
    /* bad URL / offline — the renderer shows the error page in the view */
  })
}

/**
 * Attach exactly the given tabs (page + inline devtools) and detach the rest.
 * In normal mode this is a single id; in split view it's every browser tab.
 * Idempotent per-view so repeated calls during resize don't thrash the z-order.
 */
function setVisible(pw: ProjectWindow, tabIds: string[]): void {
  const state = stateFor(pw.id)
  const want = new Set(tabIds.filter((id) => alive(state.views.get(id))))

  // Detach any currently-visible tab that should no longer be shown.
  for (const id of state.visibleTabIds) {
    if (!want.has(id)) {
      detach(pw, state.views.get(id))
      detach(pw, state.devtools.get(id))
    }
  }

  // Attach any newly-wanted tab and (re)position it.
  for (const id of want) {
    if (!state.visibleTabIds.has(id)) {
      attach(pw, state.views.get(id))
      attach(pw, state.devtools.get(id))
    }
    applyLayout(pw, id)
  }

  state.visibleTabIds = want
}

function closeDevtools(pw: ProjectWindow, tabId: string): void {
  const state = stateFor(pw.id)
  const dt = state.devtools.get(tabId)
  const view = state.views.get(tabId)
  if (alive(view)) {
    try {
      view.webContents.closeDevTools()
    } catch {
      /* already closed */
    }
  }
  if (dt) {
    detach(pw, dt)
    if (alive(dt)) dt.webContents.close()
    state.devtools.delete(tabId)
  }
}

function destroyView(pw: ProjectWindow, tabId: string): void {
  const state = perWindow.get(pw.id)
  if (!state) return
  closeDevtools(pw, tabId)
  const view = state.views.get(tabId)
  if (view) {
    detach(pw, view)
    // Destroy the live Chromium renderer (spec §5.3 memory-leak fix).
    if (alive(view)) view.webContents.close()
    state.views.delete(tabId)
  }
  state.bounds.delete(tabId)
  state.visibleTabIds.delete(tabId)
}

export function registerBrowserIpc(): void {
  ipcMain.handle(IPC.browserCreate, (event, tabId: string, url: string) => {
    const pw = requireWindow(event)
    createView(pw, tabId, url)
  })

  ipcMain.handle(IPC.browserDestroy, (event, tabId: string) => {
    const pw = requireWindow(event)
    destroyView(pw, tabId)
  })

  // Bounds updates are frequent (ResizeObserver-driven); keep them on `.on`.
  ipcMain.on(IPC.browserSetBounds, (event, tabId: string, rect: Rect) => {
    const pw = projectWindowFor(event.sender)
    if (!pw) return
    const state = stateFor(pw.id)
    if (!alive(state.views.get(tabId))) return
    state.bounds.set(tabId, rect)
    applyLayout(pw, tabId)
  })

  ipcMain.handle(IPC.browserSetVisible, (event, tabIds: string[]) => {
    const pw = requireWindow(event)
    setVisible(pw, tabIds)
  })

  ipcMain.handle(IPC.browserNavigate, (event, tabId: string, url: string) => {
    const pw = requireWindow(event)
    const view = perWindow.get(pw.id)?.views.get(tabId)
    if (!alive(view)) return
    view.webContents.loadURL(url).catch(() => {})
  })

  ipcMain.handle(IPC.browserBack, (event, tabId: string) => {
    const pw = requireWindow(event)
    const view = perWindow.get(pw.id)?.views.get(tabId)
    if (!alive(view)) return
    if (view.webContents.navigationHistory.canGoBack()) view.webContents.navigationHistory.goBack()
  })

  ipcMain.handle(IPC.browserForward, (event, tabId: string) => {
    const pw = requireWindow(event)
    const view = perWindow.get(pw.id)?.views.get(tabId)
    if (!alive(view)) return
    if (view.webContents.navigationHistory.canGoForward()) {
      view.webContents.navigationHistory.goForward()
    }
  })

  ipcMain.handle(IPC.browserReload, (event, tabId: string) => {
    const pw = requireWindow(event)
    const view = perWindow.get(pw.id)?.views.get(tabId)
    if (!alive(view)) return
    view.webContents.reload()
  })

  // Find-in-page. Fired per keystroke, so kept on `.on` (fire-and-forget); the
  // match count comes back asynchronously via the `found-in-page` event. Empty
  // text clears any existing highlight instead of searching for "".
  ipcMain.on(
    IPC.browserFind,
    (event, tabId: string, text: string, opts: BrowserFindOptions = {}) => {
      const pw = projectWindowFor(event.sender)
      if (!pw) return
      const view = perWindow.get(pw.id)?.views.get(tabId)
      if (!alive(view)) return
      if (!text) {
        view.webContents.stopFindInPage('clearSelection')
        return
      }
      view.webContents.findInPage(text, opts)
    }
  )

  ipcMain.on(
    IPC.browserStopFind,
    (event, tabId: string, action: BrowserStopFindAction = 'clearSelection') => {
      const pw = projectWindowFor(event.sender)
      if (!pw) return
      const view = perWindow.get(pw.id)?.views.get(tabId)
      if (!alive(view)) return
      view.webContents.stopFindInPage(action)
    }
  )

  // "Select element" (spec: browser → Claude Code reference). Inject the picker
  // into the page's main world and await its result. executeJavaScript resolves
  // a returned promise, so the click's descriptor comes straight back — no extra
  // channel. We focus the view first so Escape/keys reach the page, not the IDE.
  ipcMain.handle(IPC.browserPickElement, async (event, tabId: string) => {
    const pw = requireWindow(event)
    const view = perWindow.get(pw.id)?.views.get(tabId)
    if (!alive(view)) return null
    try {
      view.webContents.focus()
      const result = await view.webContents.executeJavaScript(PICKER_SOURCE, true)
      // Hand keyboard focus back to the app renderer so the terminal can take it
      // (the native browser view held focus during the pick).
      if (!pw.win.isDestroyed()) pw.win.webContents.focus()
      return (result ?? null) as PickedElement | null
    } catch {
      // Page navigated away / view destroyed mid-pick.
      return null
    }
  })

  // Toggle INLINE devtools: hosts them in a second WebContentsView and splits
  // the preview area, rather than a detached window (spec §5.3 escape valve).
  ipcMain.handle(IPC.browserOpenDevTools, (event, tabId: string) => {
    const pw = requireWindow(event)
    const state = stateFor(pw.id)
    const view = state.views.get(tabId)
    if (!alive(view)) return

    if (state.devtools.has(tabId)) {
      closeDevtools(pw, tabId)
      applyLayout(pw, tabId) // page reclaims the full area
      return
    }

    const dt = new WebContentsView({ webPreferences: {} })
    state.devtools.set(tabId, dt)
    // Attach the host view and size it BEFORE opening devtools, then point the
    // page's devtools at our view and open detached so Electron renders the
    // devtools UI INTO our view instead of a separate window.
    attach(pw, dt)
    applyLayout(pw, tabId)
    view.webContents.setDevToolsWebContents(dt.webContents)
    view.webContents.openDevTools({ mode: 'detach' })
  })

  // Destroy ALL views (page + devtools) for a window on close.
  onWindowClosed((windowId) => {
    const state = perWindow.get(windowId)
    if (!state) return
    for (const dt of state.devtools.values()) {
      if (!dt.webContents.isDestroyed()) dt.webContents.close()
    }
    for (const view of state.views.values()) {
      if (!view.webContents.isDestroyed()) view.webContents.close()
    }
    perWindow.delete(windowId)
  })
}
