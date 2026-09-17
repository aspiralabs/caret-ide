import { create } from 'zustand'
import type { ProjectInfo, WindowMode } from '@shared/types'

interface ProjectStore {
  info: ProjectInfo | null
  /**
   * `terminal` for a terminal-mode window (spec: docs/specs/terminal-mode.md).
   * Known from the `#terminal` URL hash before `info` arrives, so nothing
   * project-only renders or starts during boot.
   */
  mode: WindowMode
  /** Extra workspace folders (multi-root), shown as more explorer sections. */
  extraRoots: string[]
  /**
   * The folder that relative paths, package scripts, the scratchpad and
   * `.caret/settings.json` key off: the project root, or — in terminal mode,
   * where the root is `~` — the first adopted folder (null until one is).
   */
  workspaceRoot: string | null
  setInfo: (info: ProjectInfo) => void
  /** Pick a folder (native dialog) and add it; main allows fs access to it. */
  addRoot: () => Promise<void>
  removeRoot: (root: string) => Promise<void>
  /** Restore extra roots from workspace state (main validates them). */
  hydrateRoots: (roots: string[]) => Promise<void>
  /**
   * Adopt a folder as an extra root if it isn't already inside one (Switch to
   * IDE). Resolves the containing root either way, or null if main refused it.
   */
  adoptRoot: (dir: string) => Promise<string | null>
}

/** True when `path` is `root` or lies beneath it. */
export function isInsideRoot(path: string, root: string): boolean {
  if (path === root) return true
  const prefix = root.endsWith('/') ? root : root + '/'
  return path.startsWith(prefix)
}

/** The root in `roots` containing `path`, if any. */
export function containingRoot(path: string, roots: readonly string[]): string | null {
  return roots.find((r) => isInsideRoot(path, r)) ?? null
}

function deriveWorkspaceRoot(mode: WindowMode, info: ProjectInfo | null, extraRoots: string[]): string | null {
  if (mode === 'terminal') return extraRoots[0] ?? null
  return info?.root ?? null
}

/** This window's project (root + name) and any extra workspace folders. */
export const useProjectStore = create<ProjectStore>((set, get) => {
  const setRoots = (extraRoots: string[]): void =>
    set((s) => ({ extraRoots, workspaceRoot: deriveWorkspaceRoot(s.mode, s.info, extraRoots) }))
  return {
    info: null,
    mode: 'project',
    extraRoots: [],
    workspaceRoot: null,
    setInfo: (info) =>
      set((s) => ({ info, mode: info.mode, workspaceRoot: deriveWorkspaceRoot(info.mode, info, s.extraRoots) })),

    addRoot: async () => {
      const dir = await window.ide.project.addRoot()
      if (!dir || get().extraRoots.includes(dir)) return
      setRoots([...get().extraRoots, dir])
    },

    removeRoot: async (root) => {
      const next = get().extraRoots.filter((r) => r !== root)
      setRoots(next)
      await window.ide.project.setRoots(next)
    },

    hydrateRoots: async (roots) => {
      const valid = await window.ide.project.setRoots(roots)
      setRoots(valid)
    },

    adoptRoot: async (dir) => {
      const { extraRoots, info, mode } = get()
      // Already browsable: inside an adopted folder, or (project windows) the project itself.
      const existing = containingRoot(dir, mode === 'terminal' ? extraRoots : [...(info ? [info.root] : []), ...extraRoots])
      if (existing) return existing
      const valid = await window.ide.project.setRoots([...extraRoots, dir])
      setRoots(valid)
      return valid.includes(dir) ? dir : null
    }
  }
})
