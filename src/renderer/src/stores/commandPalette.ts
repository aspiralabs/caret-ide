import { create } from 'zustand'
import { basename } from '../lib/path'
import { useProjectStore } from './project'

export interface FileItem {
  /** Absolute path (used to open the file). */
  path: string
  /** Path relative to the project root (shown + fuzzy-matched). */
  rel: string
  /** Basename (fuzzy-matched with priority). */
  name: string
}

const RECENT_LIMIT = 8

/** Build a FileItem from an absolute path using the current project root. */
export function fileItemFor(path: string): FileItem {
  const root = useProjectStore.getState().info?.root ?? ''
  const prefix = root.endsWith('/') ? root : root + '/'
  return { path, rel: path.startsWith(prefix) ? path.slice(prefix.length) : path, name: basename(path) }
}

interface CommandPaletteStore {
  open: boolean
  /** Prefilled query when opening (e.g. '>' to jump straight to commands). */
  initialQuery: string
  /** Cached flat file list; null until first load, invalidated on fs changes. */
  files: FileItem[] | null
  /** Most-recently-opened file paths (newest first), for the "Recent" section. */
  recent: string[]

  openPalette: (initialQuery?: string) => void
  close: () => void
  /** Load the project file list into cache if not already present. */
  ensureFiles: () => Promise<void>
  /** Drop the cache so the next open re-reads the tree (files added/removed). */
  invalidate: () => void
  /** Record a file as recently opened (deduped, capped). */
  pushRecent: (path: string) => void
}

export const useCommandPaletteStore = create<CommandPaletteStore>((set, get) => ({
  open: false,
  initialQuery: '',
  files: null,
  recent: [],

  openPalette: (initialQuery = '') => set({ open: true, initialQuery }),
  close: () => set({ open: false }),

  ensureFiles: async () => {
    if (get().files) return
    const root = useProjectStore.getState().info?.root
    if (!root) return
    const paths = await window.ide.fs.listFiles()
    set({ files: paths.map(fileItemFor) })
  },

  invalidate: () => set({ files: null }),

  pushRecent: (path) =>
    set((s) => ({ recent: [path, ...s.recent.filter((p) => p !== path)].slice(0, RECENT_LIMIT) }))
}))
