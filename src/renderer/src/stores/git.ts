import { create } from 'zustand'
import type { GitStatus } from '@shared/types'

interface GitStore {
  status: GitStatus | null
  /** Fetch a fresh `git status` snapshot. Coalesces overlapping calls. */
  refresh: () => Promise<void>
}

// Module-level so overlapping refresh() calls (boot kick + status-bar mount +
// fs-change debounce) collapse into one in-flight request.
let inFlight = false

/** Cheap structural equality so an unchanged snapshot doesn't re-render the bar. */
function sameStatus(a: GitStatus | null, b: GitStatus): boolean {
  return a !== null && JSON.stringify(a) === JSON.stringify(b)
}

export const useGitStore = create<GitStore>((set, get) => ({
  status: null,
  refresh: async () => {
    if (inFlight) return
    inFlight = true
    try {
      const s = await window.ide.git.status()
      // Only publish a NEW object when the status actually changed. Claude in
      // auto-accept mode writes files continuously, firing an fs event (and this
      // refresh) every ~400ms; without this guard each one replaced the store
      // object and re-rendered the status bar, making it flicker as you work.
      if (!sameStatus(get().status, s)) set({ status: s })
    } catch {
      // Never let a status read take down the UI.
    } finally {
      inFlight = false
    }
  }
}))

/**
 * The repository label for the status bar's right edge. `repo` falls back to
 * the folder basename when there's no origin remote, which would just repeat
 * the project name already shown on the left — so only surface it for a real
 * repo whose name differs from the project's.
 */
export function repoLabel(status: GitStatus | null, projectName: string): string | null {
  if (!status || !status.isRepo) return null
  if (!status.repo || status.repo === projectName) return null
  return status.repo
}
