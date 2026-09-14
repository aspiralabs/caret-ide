import { create } from 'zustand'
import { basename, dirname } from '../lib/path'
import { ancestorsWithin } from '../lib/breadcrumbs'
import { rangeBetween } from '../lib/treeOps'
import type { DirEntry, FsChangeEvent, WorkspaceState } from '@shared/types'

interface FilesStore {
  /** path -> its immediate children (undefined = not loaded yet). */
  children: Record<string, DirEntry[] | undefined>
  expanded: Set<string>
  loading: Set<string>
  /** Primary selection (anchor for ⇧-click ranges, target of single actions). */
  selectedPath: string | null
  /** Every selected path (multi-select via ⌘/⇧-click); always contains selectedPath. */
  selectedPaths: Set<string>
  /** Explorer type-to-filter text ('' = tree view). */
  filter: string
  /** Directory currently highlighted as a drop target during a drag. */
  dropTarget: string | null

  loadChildren: (path: string) => Promise<DirEntry[]>
  toggleDir: (path: string) => Promise<void>
  expandDir: (path: string) => Promise<void>
  collapseDir: (path: string) => void
  isExpanded: (path: string) => boolean
  setSelected: (path: string | null) => void
  /**
   * Click selection: plain click selects one; `toggle` (⌘) adds/removes;
   * `range` (⇧) selects from the anchor to `path` along `order`.
   */
  select: (path: string, opts: { toggle?: boolean; range?: boolean; order?: readonly string[] }) => void
  setFilter: (q: string) => void
  setDropTarget: (dir: string | null) => void
  collapseAll: () => void
  /** React to a chokidar event: refresh the affected parent directory if loaded. */
  handleFsChange: (e: FsChangeEvent) => Promise<void>
  expandedList: () => string[]
  /** Expand every ancestor of `path` (loading as needed) and select it. */
  revealPath: (path: string, root: string) => Promise<void>
  hydrate: (ws: WorkspaceState) => Promise<void>
}

export const useFilesStore = create<FilesStore>((set, get) => ({
  children: {},
  expanded: new Set(),
  loading: new Set(),
  selectedPath: null,
  selectedPaths: new Set(),
  filter: '',
  dropTarget: null,

  loadChildren: async (path) => {
    set((s) => ({ loading: new Set(s.loading).add(path) }))
    try {
      const entries = await window.ide.fs.readDir(path)
      set((s) => ({ children: { ...s.children, [path]: entries } }))
      return entries
    } finally {
      set((s) => {
        const loading = new Set(s.loading)
        loading.delete(path)
        return { loading }
      })
    }
  },

  toggleDir: async (path) => {
    if (get().expanded.has(path)) get().collapseDir(path)
    else await get().expandDir(path)
  },

  expandDir: async (path) => {
    if (get().children[path] === undefined) await get().loadChildren(path)
    set((s) => ({ expanded: new Set(s.expanded).add(path) }))
  },

  collapseDir: (path) =>
    set((s) => {
      const expanded = new Set(s.expanded)
      expanded.delete(path)
      return { expanded }
    }),

  isExpanded: (path) => get().expanded.has(path),
  setSelected: (path) => set({ selectedPath: path, selectedPaths: new Set(path ? [path] : []) }),

  select: (path, opts) =>
    set((s) => {
      if (opts.toggle) {
        const next = new Set(s.selectedPaths)
        if (next.has(path) && next.size > 1) {
          next.delete(path)
          return { selectedPaths: next, selectedPath: s.selectedPath === path ? [...next][0] : s.selectedPath }
        }
        next.add(path)
        return { selectedPaths: next, selectedPath: path }
      }
      if (opts.range && opts.order) {
        return { selectedPaths: new Set(rangeBetween(opts.order, s.selectedPath, path)) }
      }
      return { selectedPath: path, selectedPaths: new Set([path]) }
    }),

  setFilter: (filter) => set({ filter }),
  setDropTarget: (dropTarget) => set({ dropTarget }),
  collapseAll: () => set({ expanded: new Set() }),

  handleFsChange: async (e) => {
    // A .gitignore edit can flip ignore (grayed-out) status anywhere in the
    // tree, not just in its own directory — re-read every loaded dir so the
    // whole tree reflects the new rules.
    if (basename(e.path) === '.gitignore') {
      const loaded = Object.keys(get().children).filter((p) => get().children[p] !== undefined)
      await Promise.all(loaded.map((p) => get().loadChildren(p).catch(() => [])))
      return
    }

    const parent = dirname(e.path)
    // Only refresh directories we've actually loaded/expanded.
    if (get().children[parent] !== undefined) {
      await get().loadChildren(parent)
    }
  },

  expandedList: () => [...get().expanded],

  revealPath: async (path, root) => {
    for (const dir of ancestorsWithin(path, root)) {
      if (!get().expanded.has(dir)) await get().expandDir(dir).catch(() => {})
    }
    set({ selectedPath: path })
  },

  hydrate: async (ws) => {
    set({ expanded: new Set(ws.expandedDirs) })
    // Eagerly load children for restored expanded dirs so the tree renders open.
    await Promise.all(ws.expandedDirs.map((p) => get().loadChildren(p).catch(() => [])))
  }
}))
