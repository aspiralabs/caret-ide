// ---------------------------------------------------------------------------
// Recent projects — a small persisted MRU list powering the welcome screen.
//
// Stored in its own electron-store (`recent.json`) as a flat array, newest
// first. Roots are absolute paths, so — like the workspace store — we keep them
// as VALUES inside a single top-level `recent` key rather than as key paths
// (electron-store would otherwise split dotted paths into nested objects).
// ---------------------------------------------------------------------------

import { statSync } from 'fs'
import Store from 'electron-store'
import type { RecentProject } from '../shared/types'
import { addRecent, removeRecent, setGroup, setPinned, sortRecent } from './recentList'

interface StoreSchema {
  recent: RecentProject[]
}

const store = new Store<StoreSchema>({ name: 'recent' })

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

/** The list, newest first, with any folders that no longer exist pruned out. */
export function getRecentProjects(): RecentProject[] {
  const all = store.get('recent', [] as RecentProject[])
  const live = all.filter((p) => isDir(p.root))
  // Persist the pruned list so stale entries don't accumulate.
  if (live.length !== all.length) store.set('recent', live)
  return sortRecent(live)
}

/** Record a project open: move it to the front (dedup by root) and cap the unpinned tail. */
export function addRecentProject(root: string, openedAt: number): void {
  store.set('recent', addRecent(store.get('recent', [] as RecentProject[]), root, openedAt))
}

export function removeRecentProject(root: string): void {
  store.set('recent', removeRecent(store.get('recent', [] as RecentProject[]), root))
}

export function pinRecentProject(root: string, pinned: boolean): void {
  store.set('recent', setPinned(store.get('recent', [] as RecentProject[]), root, pinned))
}

export function groupRecentProject(root: string, group: string | null): void {
  store.set('recent', setGroup(store.get('recent', [] as RecentProject[]), root, group))
}
