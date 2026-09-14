// Pure helpers for project search (no electron / child_process imports).

import { join } from 'path'
import type { SearchMatch } from '../../shared/types'

/**
 * Parse `git grep -n --column` output (`path:line:col:text`, one match per
 * line) into matches with absolute paths. Lines that don't fit are skipped.
 */
export function parseGrepOutput(out: string, root: string, max = 500): SearchMatch[] {
  const matches: SearchMatch[] = []
  for (const line of out.split('\n')) {
    if (!line) continue
    const m = /^(.+?):(\d+):(\d+):(.*)$/.exec(line)
    if (!m) continue
    matches.push({
      path: join(root, m[1]),
      line: Number(m[2]),
      column: Number(m[3]),
      text: m[4].length > 300 ? m[4].slice(0, 300) + '…' : m[4]
    })
    if (matches.length >= max) break
  }
  return matches
}

/**
 * Fallback search over in-memory file contents (used when the project isn't
 * a git repo). Case-insensitive substring; reports the first occurrence's
 * column per line.
 */
export function searchText(
  files: ReadonlyArray<{ path: string; text: string }>,
  query: string,
  max = 500
): SearchMatch[] {
  const q = query.toLowerCase()
  if (!q) return []
  const out: SearchMatch[] = []
  for (const f of files) {
    const lines = f.text.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const col = lines[i].toLowerCase().indexOf(q)
      if (col === -1) continue
      out.push({ path: f.path, line: i + 1, column: col + 1, text: lines[i].slice(0, 300) })
      if (out.length >= max) return out
    }
  }
  return out
}
