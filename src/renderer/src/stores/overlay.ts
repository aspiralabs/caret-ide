import { useEffect } from 'react'
import { create } from 'zustand'

/**
 * Count of DOM overlays (modals, context menus) currently open. Native
 * `WebContentsView`s always paint ABOVE the renderer's DOM, so while any
 * overlay is up the browser preview views are detached (see BrowserManager) —
 * otherwise a rename prompt or the Diagnostics modal renders underneath the
 * page. A counter (not a flag) so nested/overlapping overlays compose.
 */
interface OverlayStore {
  count: number
  /** Register an open overlay; returns the matching release fn. */
  acquire: () => () => void
}

export const useOverlayStore = create<OverlayStore>((set) => ({
  count: 0,
  acquire: () => {
    let released = false
    set((s) => ({ count: s.count + 1 }))
    return () => {
      if (released) return
      released = true
      set((s) => ({ count: Math.max(0, s.count - 1) }))
    }
  }
}))

/** Hold an overlay registration while `active` is true. */
export function useOverlay(active: boolean): void {
  useEffect(() => {
    if (!active) return
    return useOverlayStore.getState().acquire()
  }, [active])
}
