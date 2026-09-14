import type { DirEntry } from '@shared/types'
import { dirname } from './path'

/** Depth-first list of visible entry paths (expanded dirs descend) in display order. */
export function visibleOrder(
  root: string,
  children: Record<string, DirEntry[] | undefined>,
  expanded: ReadonlySet<string>,
  isShown: (e: DirEntry) => boolean = () => true
): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    for (const e of children[dir] ?? []) {
      if (!isShown(e)) continue
      out.push(e.path)
      if (e.isDir && expanded.has(e.path)) walk(e.path)
    }
  }
  walk(root)
  return out
}

/** Visible rows (entry + depth) in display order — the virtualised tree renders from this. */
export function visibleRows(
  root: string,
  children: Record<string, DirEntry[] | undefined>,
  expanded: ReadonlySet<string>,
  isShown: (e: DirEntry) => boolean = () => true
): Array<{ entry: DirEntry; depth: number }> {
  const out: Array<{ entry: DirEntry; depth: number }> = []
  const walk = (dir: string, depth: number): void => {
    for (const e of children[dir] ?? []) {
      if (!isShown(e)) continue
      out.push({ entry: e, depth })
      if (e.isDir && expanded.has(e.path)) walk(e.path, depth + 1)
    }
  }
  walk(root, 0)
  return out
}

/** Paths between two entries (inclusive) in display order; just `target` when the anchor is unknown. */
export function rangeBetween(order: readonly string[], anchor: string | null, target: string): string[] {
  const a = anchor ? order.indexOf(anchor) : -1
  const t = order.indexOf(target)
  if (a === -1 || t === -1) return [target]
  const [lo, hi] = a < t ? [a, t] : [t, a]
  return order.slice(lo, hi + 1)
}

/** The directory a drop on `entry` lands in: the dir itself, or a file's parent. */
export function dropDirFor(entry: { path: string; isDir: boolean }): string {
  return entry.isDir ? entry.path : dirname(entry.path)
}

/** Entry visibility per the explorer toggles. */
export function entryShown(e: DirEntry, opts: { showIgnored: boolean; showDotfiles: boolean }): boolean {
  if (!opts.showDotfiles && e.name.startsWith('.')) return false
  if (!opts.showIgnored && e.ignored) return false
  return true
}

/**
 * Moving `src` into `destDir` is a no-op or nonsense when it's already there
 * or `destDir` is `src` / inside it.
 */
export function canMoveInto(src: string, destDir: string): boolean {
  if (dirname(src) === destDir) return false
  if (destDir === src) return false
  return !destDir.startsWith(src.endsWith('/') ? src : src + '/')
}

/** Simple case-insensitive substring filter over project-relative paths. */
export function filterPaths(rels: readonly string[], query: string, max = 200): string[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const out: string[] = []
  // Basename hits first, then anywhere in the path.
  for (const r of rels) {
    const base = r.slice(r.lastIndexOf('/') + 1).toLowerCase()
    if (base.includes(q)) out.push(r)
    if (out.length >= max) return out
  }
  for (const r of rels) {
    if (out.length >= max) break
    if (!out.includes(r) && r.toLowerCase().includes(q)) out.push(r)
  }
  return out
}
