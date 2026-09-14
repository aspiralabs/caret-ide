import { create } from 'zustand'
import { basename } from '../lib/path'
import { uid } from '../lib/id'
import { useLayoutStore } from './layout'
import { clearPreviewMode, retargetPreviewMode } from '../lib/markdownView'
import { mdClearDoc, mdRetarget } from '../lib/markdownDoc'
import { clearEditorDoc, retargetEditorDoc } from '../lib/editorModels'
import { isSameOrUnder, rebasePath } from '../lib/pathMatch'
import type { CenterTabKind, ConsoleEntry, WorkspaceState } from '@shared/types'

export interface CenterTab {
  id: string
  kind: CenterTabKind
  title: string

  // editor tabs
  filePath?: string
  dirty?: boolean

  // browser tabs
  url?: string
  favicon?: string
  canGoBack?: boolean
  canGoForward?: boolean
  isLoading?: boolean
  /** Inline devtools currently open for this browser tab (drives the toolbar toggle). */
  devtoolsOpen?: boolean
  /** Letterboxed preview width in CSS px (device preset); undefined/null = fluid. */
  previewWidth?: number | null
  /** Recent console errors from the page (newest last; cleared on navigation). */
  consoleErrors?: ConsoleEntry[]
}

interface TabsStore {
  tabs: CenterTab[]
  activeId: string | null

  /** Open a file as an editor tab, reusing an existing tab for the same path. */
  openFile: (filePath: string) => string
  /** Open a new browser tab (defaults to the project's default URL). */
  newBrowserTab: (url?: string) => string
  /** Open (or focus) a singleton tab of a special kind (Settings UI / JSON). */
  openSingleton: (kind: 'settings' | 'settingsJson') => string
  /** Open (or focus) the HEAD ↔ working-tree diff for a file. */
  openDiff: (filePath: string) => string
  closeTab: (id: string) => void
  /**
   * A file or directory was renamed/moved on disk: point every editor tab at
   * (or beneath) `oldPath` to its new location, carrying buffers + baselines.
   */
  retargetFile: (oldPath: string, newPath: string) => void
  /**
   * A file or directory was deleted: close its clean editor tabs. Dirty tabs
   * stay open (with their "deleted on disk" note) so unsaved work survives.
   * Returns the ids of the tabs that were closed.
   */
  closeFilesUnder: (path: string) => string[]
  setActive: (id: string) => void
  moveTab: (id: string, toIndex: number) => void
  updateTab: (id: string, patch: Partial<CenterTab>) => void
  setDirty: (id: string, dirty: boolean) => void
  getActive: () => CenterTab | null
  getById: (id: string) => CenterTab | undefined
  cycle: (dir: 1 | -1) => void
  activateIndex: (i: number) => void
  hydrate: (ws: WorkspaceState) => void
}

function pickNeighbor(tabs: CenterTab[], removedIndex: number): string | null {
  if (tabs.length === 0) return null
  const i = Math.min(removedIndex, tabs.length - 1)
  return tabs[i]?.id ?? null
}

export const useTabsStore = create<TabsStore>((set, get) => ({
  tabs: [],
  activeId: null,

  openFile: (filePath) => {
    const existing = get().tabs.find((t) => t.kind === 'editor' && t.filePath === filePath)
    if (existing) {
      set({ activeId: existing.id })
      return existing.id
    }
    const tab: CenterTab = {
      id: uid('tab'),
      kind: 'editor',
      title: basename(filePath),
      filePath,
      dirty: false
    }
    set((s) => ({ tabs: [...s.tabs, tab], activeId: tab.id }))
    return tab.id
  },

  newBrowserTab: (url) => {
    const target = url ?? useLayoutStore.getState().defaultBrowserUrl
    const tab: CenterTab = {
      id: uid('tab'),
      kind: 'browser',
      title: 'New Tab',
      url: target,
      canGoBack: false,
      canGoForward: false,
      isLoading: true
    }
    set((s) => ({ tabs: [...s.tabs, tab], activeId: tab.id }))
    return tab.id
  },

  openSingleton: (kind) => {
    const existing = get().tabs.find((t) => t.kind === kind)
    if (existing) {
      set({ activeId: existing.id })
      return existing.id
    }
    const tab: CenterTab = {
      id: uid('tab'),
      kind,
      title: kind === 'settings' ? 'Settings' : 'settings.json',
      dirty: false
    }
    set((s) => ({ tabs: [...s.tabs, tab], activeId: tab.id }))
    return tab.id
  },

  openDiff: (filePath) => {
    const existing = get().tabs.find((t) => t.kind === 'diff' && t.filePath === filePath)
    if (existing) {
      set({ activeId: existing.id })
      return existing.id
    }
    const tab: CenterTab = {
      id: uid('tab'),
      kind: 'diff',
      title: `${basename(filePath)} (diff)`,
      filePath
    }
    set((s) => ({ tabs: [...s.tabs, tab], activeId: tab.id }))
    return tab.id
  },

  closeTab: (id) =>
    set((s) => {
      const idx = s.tabs.findIndex((t) => t.id === id)
      if (idx === -1) return s
      const closing = s.tabs[idx]
      // Forget a markdown file's remembered raw/preview mode once its tab closes,
      // so reopening it honors the markdownDefaultOpenAs setting.
      if (closing.kind === 'editor' && closing.filePath) {
        clearPreviewMode(closing.filePath)
        mdClearDoc(closing.filePath)
        // Drop the Monaco model + baseline too, so reopening re-reads disk
        // (never stale text or resurrected discarded edits) and the TS worker
        // doesn't retain every file ever opened.
        clearEditorDoc(closing.filePath)
      }
      const tabs = s.tabs.filter((t) => t.id !== id)
      const activeId = s.activeId === id ? pickNeighbor(tabs, idx) : s.activeId
      return { tabs, activeId }
    }),

  retargetFile: (oldPath, newPath) =>
    set((s) => {
      let changed = false
      const tabs = s.tabs.map((t) => {
        if ((t.kind !== 'editor' && t.kind !== 'diff') || !t.filePath || !isSameOrUnder(t.filePath, oldPath)) return t
        const next = rebasePath(t.filePath, oldPath, newPath)
        if (next === t.filePath) return t
        changed = true
        if (t.kind === 'diff') return { ...t, filePath: next, title: `${basename(next)} (diff)` }
        retargetEditorDoc(t.filePath, next)
        mdRetarget(t.filePath, next)
        retargetPreviewMode(t.filePath, next)
        return { ...t, filePath: next, title: basename(next) }
      })
      return changed ? { tabs } : s
    }),

  closeFilesUnder: (path) => {
    const victims = get().tabs.filter(
      (t) =>
        (t.kind === 'editor' || t.kind === 'diff') &&
        !t.dirty &&
        !!t.filePath &&
        isSameOrUnder(t.filePath, path)
    )
    for (const t of victims) get().closeTab(t.id)
    return victims.map((t) => t.id)
  },

  setActive: (id) => set({ activeId: id }),

  moveTab: (id, toIndex) =>
    set((s) => {
      const from = s.tabs.findIndex((t) => t.id === id)
      if (from === -1) return s
      const tabs = [...s.tabs]
      const [moved] = tabs.splice(from, 1)
      tabs.splice(Math.max(0, Math.min(toIndex, tabs.length)), 0, moved)
      return { tabs }
    }),

  updateTab: (id, patch) =>
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),

  setDirty: (id, dirty) =>
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, dirty } : t)) })),

  getActive: () => {
    const { tabs, activeId } = get()
    return tabs.find((t) => t.id === activeId) ?? null
  },
  getById: (id) => get().tabs.find((t) => t.id === id),

  cycle: (dir) => {
    const { tabs, activeId } = get()
    if (tabs.length === 0) return
    const i = tabs.findIndex((t) => t.id === activeId)
    const next = (i + dir + tabs.length) % tabs.length
    set({ activeId: tabs[next].id })
  },

  activateIndex: (i) => {
    const { tabs } = get()
    if (tabs[i]) set({ activeId: tabs[i].id })
  },

  hydrate: (ws) => {
    const tabs: CenterTab[] = ws.centerTabs.map((t) => ({
      id: t.id,
      kind: t.kind,
      title: t.kind === 'editor' ? basename(t.filePath ?? '') : t.title ?? 'New Tab',
      filePath: t.filePath,
      url: t.url,
      dirty: false,
      canGoBack: false,
      canGoForward: false
    }))
    const activeId =
      ws.activeCenterTabId && tabs.some((t) => t.id === ws.activeCenterTabId)
        ? ws.activeCenterTabId
        : tabs[0]?.id ?? null
    set({ tabs, activeId })
  }
}))
