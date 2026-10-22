import { create } from 'zustand'
import type { ProjectTab } from '@shared/types'

/**
 * The project tabs of the window this renderer is shown in. Main owns the
 * list (a window hosts several project renderers, one per tab) and pushes
 * every change to all of them, so each tab's title bar draws the same strip.
 */
interface ProjectTabsStore {
  tabs: ProjectTab[]
  activeId: number | null
  /** This renderer's own tab. */
  selfId: number | null
  /** Fetch the current strip and follow main's updates. Returns the unsubscribe fn. */
  init: () => () => void
  /** Optimistic local reorder, then main (which echoes the result to every tab). */
  move: (id: number, toIndex: number) => void
}

export const useProjectTabsStore = create<ProjectTabsStore>((set, get) => ({
  tabs: [],
  activeId: null,
  selfId: null,

  init: () => {
    const off = window.ide.projectTabs.onChanged((s) => set(s))
    void window.ide.projectTabs.get().then((s) => {
      if (s) set(s)
    })
    return off
  },

  move: (id, toIndex) => {
    const rest = get().tabs.filter((t) => t.id !== id)
    const moved = get().tabs.find((t) => t.id === id)
    if (!moved) return
    rest.splice(toIndex, 0, moved)
    set({ tabs: rest })
    void window.ide.projectTabs.reorder(rest.map((t) => t.id))
  }
}))
