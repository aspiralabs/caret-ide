import { relativePath } from './claudeRefs'

export interface Crumb {
  /** Segment label (dir or file name). */
  name: string
  /** Absolute path of the segment. */
  path: string
  isDir: boolean
}

/** The directories from `root` down to the parent of `path` (exclusive of root). */
export function ancestorsWithin(path: string, root: string): string[] {
  const rel = relativePath(path, root)
  if (rel === path || rel === '.') return []
  const parts = rel.split('/').filter(Boolean)
  const out: string[] = []
  let cur = root.endsWith('/') ? root.slice(0, -1) : root
  for (const seg of parts.slice(0, -1)) {
    cur = `${cur}/${seg}`
    out.push(cur)
  }
  return out
}

/** Breadcrumb segments for a file: each project-relative dir, then the file. */
export function crumbsFor(path: string, root: string): Crumb[] {
  const rel = relativePath(path, root)
  const parts = (rel === path ? path.replace(/^\//, '') : rel).split('/').filter(Boolean)
  const base = rel === path ? '' : root.endsWith('/') ? root.slice(0, -1) : root
  let cur = base
  return parts.map((name, i) => {
    cur = `${cur}/${name}`
    return { name, path: cur, isDir: i < parts.length - 1 }
  })
}
