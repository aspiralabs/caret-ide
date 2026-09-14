// Pure operations on the recent-projects list (see recentProjects.ts for
// persistence). Pinned projects are never evicted and sort first; groups are
// free-form labels shown as sections on the welcome screen.

import { basename } from 'path'
import type { RecentProject } from '../shared/types'

/** How many UNPINNED recent projects to remember. */
export const MAX_RECENT = 10

export function addRecent(list: RecentProject[], root: string, openedAt: number): RecentProject[] {
  const prev = list.find((p) => p.root === root)
  const entry: RecentProject = { ...prev, root, name: basename(root), lastOpened: openedAt }
  const rest = list.filter((p) => p.root !== root)
  const next = [entry, ...rest]
  // Cap only the unpinned tail.
  let unpinned = 0
  return next.filter((p) => p.pinned || ++unpinned <= MAX_RECENT)
}

export function removeRecent(list: RecentProject[], root: string): RecentProject[] {
  return list.filter((p) => p.root !== root)
}

export function setPinned(list: RecentProject[], root: string, pinned: boolean): RecentProject[] {
  return list.map((p) => (p.root === root ? { ...p, pinned: pinned || undefined } : p))
}

export function setGroup(list: RecentProject[], root: string, group: string | null): RecentProject[] {
  const g = group?.trim() || undefined
  return list.map((p) => (p.root === root ? { ...p, group: g } : p))
}

export { groupRecent, sortRecent } from '../shared/recentGroups'
