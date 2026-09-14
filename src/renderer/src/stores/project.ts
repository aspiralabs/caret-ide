import { create } from 'zustand'
import type { ProjectInfo } from '@shared/types'

interface ProjectStore {
  info: ProjectInfo | null
  /** Extra workspace folders (multi-root), shown as more explorer sections. */
  extraRoots: string[]
  setInfo: (info: ProjectInfo) => void
  /** Pick a folder (native dialog) and add it; main allows fs access to it. */
  addRoot: () => Promise<void>
  removeRoot: (root: string) => Promise<void>
  /** Restore extra roots from workspace state (main validates them). */
  hydrateRoots: (roots: string[]) => Promise<void>
}

/** This window's project (root + name) and any extra workspace folders. */
export const useProjectStore = create<ProjectStore>((set, get) => ({
  info: null,
  extraRoots: [],
  setInfo: (info) => set({ info }),

  addRoot: async () => {
    const dir = await window.ide.project.addRoot()
    if (!dir || get().extraRoots.includes(dir)) return
    set((s) => ({ extraRoots: [...s.extraRoots, dir] }))
  },

  removeRoot: async (root) => {
    const next = get().extraRoots.filter((r) => r !== root)
    set({ extraRoots: next })
    await window.ide.project.setRoots(next)
  },

  hydrateRoots: async (roots) => {
    const valid = await window.ide.project.setRoots(roots)
    set({ extraRoots: valid })
  }
}))
