import { create } from 'zustand'
import type { ProjectInfo } from '@shared/types'

interface ProjectStore {
  info: ProjectInfo | null
  setInfo: (info: ProjectInfo) => void
}

/** This window's project (root + name). Set once during boot. */
export const useProjectStore = create<ProjectStore>((set) => ({
  info: null,
  setInfo: (info) => set({ info })
}))
