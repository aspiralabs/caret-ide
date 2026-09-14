import type { RecentProject } from './types'

/** Display order: pinned first (by last open), then the rest by last open. */
export function sortRecent(list: RecentProject[]): RecentProject[] {
  return [...list].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.lastOpened - a.lastOpened)
}

/** Group name → projects, for the welcome screen's sections (ungrouped last, under ''). */
export function groupRecent(list: RecentProject[]): Array<{ group: string; projects: RecentProject[] }> {
  const by = new Map<string, RecentProject[]>()
  for (const p of sortRecent(list)) {
    const key = p.group ?? ''
    if (!by.has(key)) by.set(key, [])
    by.get(key)!.push(p)
  }
  const named = [...by.entries()].filter(([g]) => g).sort(([a], [b]) => a.localeCompare(b))
  const rest = by.get('') ? [['', by.get('')!] as [string, RecentProject[]]] : []
  return [...named, ...rest].map(([group, projects]) => ({ group, projects }))
}
