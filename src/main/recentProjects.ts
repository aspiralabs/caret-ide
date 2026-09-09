// ---------------------------------------------------------------------------
// Recent projects — a small persisted MRU list powering the welcome screen.
//
// Stored in its own electron-store (`recent.json`) as a flat array, newest
// first. Roots are absolute paths, so — like the workspace store — we keep them
// as VALUES inside a single top-level `recent` key rather than as key paths
// (electron-store would otherwise split dotted paths into nested objects).
// ---------------------------------------------------------------------------

import { statSync } from 'fs'
import { basename } from 'path'
import Store from 'electron-store'
import type { RecentProject } from '../shared/types'

interface StoreSchema {
  recent: RecentProject[]
}

/** How many recent projects to remember. */
const MAX_RECENT = 10

const store = new Store<StoreSchema>({ name: 'recent' })

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

/** MRU list, newest first, with any folders that no longer exist pruned out. */
export function getRecentProjects(): RecentProject[] {
  const all = store.get('recent', [] as RecentProject[])
  const live = all.filter((p) => isDir(p.root))
  // Persist the pruned list so stale entries don't accumulate.
  if (live.length !== all.length) store.set('recent', live)
  return live
}

/** Record a project open: move it to the front (dedup by root) and cap the list. */
export function addRecentProject(root: string, openedAt: number): void {
  const existing = store.get('recent', [] as RecentProject[])
  const entry: RecentProject = { root, name: basename(root), lastOpened: openedAt }
  const next = [entry, ...existing.filter((p) => p.root !== root)].slice(0, MAX_RECENT)
  store.set('recent', next)
}
