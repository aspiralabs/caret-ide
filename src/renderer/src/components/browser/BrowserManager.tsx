import { useEffect, useRef } from 'react'
import { useTabsStore } from '../../stores/tabs'
import { useLayoutStore } from '../../stores/layout'
import { useBrowserFindStore } from '../../stores/browserFind'
import { useCommandPaletteStore } from '../../stores/commandPalette'
import { hostLabel } from './normalizeUrl'

// ---------------------------------------------------------------------------
// BrowserManager — headless coordinator for main-owned WebContentsViews.
//
// Always mounted (see App.tsx), renders nothing. It owns three concerns:
//   1. Lifecycle: create a view when a browser tab appears, destroy it on close.
//   2. Visibility: show exactly the active browser tab's view when the center
//      panel is visible; otherwise hide all views (so nothing paints over the
//      editor / a collapsed panel).
//   3. Event fan-in: map main→renderer browser events onto the tabs store.
//
// Keeping both the create-diff and the show/hide logic here (rather than in the
// per-tab pane) guarantees creation reliably precedes show(), even for a tab
// spawned by ⌘T that becomes active in the same render.
// ---------------------------------------------------------------------------

export default function BrowserManager(): null {
  // Subscribe to just the slices we need. Selecting `tabs` + `activeId`
  // re-runs the lifecycle/visibility effects whenever either changes.
  const tabs = useTabsStore((s) => s.tabs)
  const activeId = useTabsStore((s) => s.activeId)
  const centerVisible = useLayoutStore((s) => s.centerVisible)
  const centerSplit = useLayoutStore((s) => s.centerSplit)
  const centerResizing = useLayoutStore((s) => s.centerResizing)
  // Native WebContentsViews always paint above the renderer's DOM, so a DOM
  // overlay like the command palette would be hidden behind the browser preview.
  // Detach all browser views while the palette is open so the palette shows.
  const paletteOpen = useCommandPaletteStore((s) => s.open)

  // Ids of tabs we have already asked main to create a view for.
  const createdRef = useRef<Set<string>>(new Set())

  // -------------------------------------------------------------------------
  // 1 + 2. Lifecycle diff and visibility, run together so create precedes show.
  // -------------------------------------------------------------------------
  useEffect(() => {
    const created = createdRef.current
    const browserTabs = tabs.filter((t) => t.kind === 'browser')
    const liveIds = new Set(browserTabs.map((t) => t.id))

    // Destroy views for browser tabs that no longer exist (tab close). Main
    // leaks a Chromium renderer if we skip this.
    for (const id of created) {
      if (!liveIds.has(id)) {
        void window.ide.browser.destroy(id)
        created.delete(id)
      }
    }

    // Create any not-yet-created browser views. We must finish create() before
    // making a view visible, so this is async and ordered.
    let cancelled = false
    void (async () => {
      for (const tab of browserTabs) {
        if (!created.has(tab.id)) {
          created.add(tab.id) // mark before await so we don't double-create on re-entry
          try {
            await window.ide.browser.create(tab.id, tab.url ?? '')
          } catch {
            created.delete(tab.id) // creation failed — allow a retry next diff
          }
        }
      }
      if (cancelled) return

      // Visibility: which browser views should be attached right now.
      //   - center hidden / mid-resize → none (during a divider drag native
      //     views must detach so the DOM receives the mouse; ⌘E collapse hides).
      //   - split view → every browser tab tiles at once.
      //   - normal    → just the active browser tab.
      let visibleIds: string[] = []
      if (centerVisible && !centerResizing && !paletteOpen) {
        const createdBrowserTabs = browserTabs.filter((t) => created.has(t.id))
        if (centerSplit) {
          visibleIds = createdBrowserTabs.map((t) => t.id)
        } else {
          const active = createdBrowserTabs.find((t) => t.id === activeId)
          if (active) visibleIds = [active.id]
        }
      }
      void window.ide.browser.setVisible(visibleIds)
    })()

    return () => {
      cancelled = true
    }
  }, [tabs, activeId, centerVisible, centerSplit, centerResizing, paletteOpen])

  // -------------------------------------------------------------------------
  // 3. Subscribe once to main→renderer browser events; map onto the store.
  // -------------------------------------------------------------------------
  useEffect(() => {
    const { updateTab } = useTabsStore.getState()

    const offNav = window.ide.browser.onDidNavigate((e) => {
      updateTab(e.tabId, {
        url: e.url,
        canGoBack: e.canGoBack,
        canGoForward: e.canGoForward,
        isLoading: e.isLoading
      })
    })

    const offTitle = window.ide.browser.onTitleUpdated((e) => {
      // Label = page title; fall back to hostname:port derived from the tab url.
      const tab = useTabsStore.getState().getById(e.tabId)
      updateTab(e.tabId, { title: e.title || hostLabel(tab?.url) })
    })

    const offFavicon = window.ide.browser.onFaviconUpdated((e) => {
      updateTab(e.tabId, { favicon: e.favicons[0] })
    })

    const offNewTab = window.ide.browser.onNewTab((e) => {
      // target=_blank / window.open → open as a new app browser tab.
      useTabsStore.getState().newBrowserTab(e.url)
    })

    // ⌘F pressed while the native page held focus — main forwards it here since
    // the renderer's keydown listener can't see keys aimed at the Chromium view.
    const offOpenFind = window.ide.browser.onOpenFind((e) => {
      useBrowserFindStore.getState().open(e.tabId)
    })

    // ⌘P / ⌘⇧P forwarded from main for the same reason: keys aimed at the native
    // browser view never reach our DOM keydown listener.
    const offOpenPalette = window.ide.browser.onOpenPalette((e) => {
      useCommandPaletteStore.getState().openPalette(e.commandMode ? '>' : '')
    })

    return () => {
      offNav()
      offTitle()
      offFavicon()
      offNewTab()
      offOpenFind()
      offOpenPalette()
    }
  }, [])

  return null
}
