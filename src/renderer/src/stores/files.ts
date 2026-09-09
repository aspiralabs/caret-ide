import { create } from 'zustand'
import { basename, dirname } from '../lib/path'
import type { DirEntry, FsChangeEvent, WorkspaceState } from '@shared/types'

interface FilesStore {
  /** path -> its immediate children (undefined = not loaded yet). */
  children: Record<string, DirEntry[] | undefined>
  expanded: Set<string>
  loading: Set<string>
  selectedPath: string | null

  loadChildren: (path: string) => Promise<DirEntry[]>
  toggleDir: (path: string) => Promise<void>
  expandDir: (path: string) => Promise<void>
  collapseDir: (path: string) => void
  isExpanded: (path: string) => boolean
  setSelected: (path: string | null) => void
  /** React to a chokidar event: refresh the affected parent directory if loaded. */
  handleFsChange: (e: FsChangeEvent) => Promise<void>
  expandedList: () => string[]
  hydrate: (ws: WorkspaceState) => Promise<void>
}

export const useFilesStore = create<FilesStore>((set, get) => ({
  children: {},
  expanded: new Set(),
  loading: new Set(),
  selectedPath: null,

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
  setSelected: (path) => set({ selectedPath: path }),

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

  hydrate: async (ws) => {
    set({ expanded: new Set(ws.expandedDirs) })
    // Eagerly load children for restored expanded dirs so the tree renders open.
    await Promise.all(ws.expandedDirs.map((p) => get().loadChildren(p).catch(() => [])))
  }
}))
