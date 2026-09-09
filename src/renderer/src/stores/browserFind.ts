import { create } from 'zustand'

// ---------------------------------------------------------------------------
// browserFind — tracks which browser tab currently has its ⌘F find bar open.
//
// Only one find bar is ever visible (the active browser tab's), so a single
// `openTabId` suffices. Opening is triggered from two places: the renderer's
// global ⌘F handler (when app chrome has focus) and a main→renderer event (when
// the native page held focus and main intercepted ⌘F). The find bar itself owns
// its query text and match counts locally.
// ---------------------------------------------------------------------------

interface BrowserFindState {
  /** Tab whose find bar is open, or null when no find bar is showing. */
  openTabId: string | null
  open: (tabId: string) => void
  close: () => void
}

export const useBrowserFindStore = create<BrowserFindState>((set) => ({
  openTabId: null,
  open: (tabId) => set({ openTabId: tabId }),
  close: () => set({ openTabId: null })
}))
