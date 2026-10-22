// ---------------------------------------------------------------------------
// Pure tab-strip arithmetic for project tabs (one host window, many projects).
// Kept free of Electron so the ordering rules are unit-testable.
// ---------------------------------------------------------------------------

/**
 * Which tab becomes active when `closingId` goes away: the one to its right,
 * else the one to its left (browser convention). Null when it was the last.
 */
export function neighborAfterClose(ids: readonly number[], closingId: number): number | null {
  const i = ids.indexOf(closingId)
  if (i === -1) return ids[0] ?? null
  return ids[i + 1] ?? ids[i - 1] ?? null
}

/** The tab `dir` steps from `activeId`, wrapping at either end. */
export function cycleId(ids: readonly number[], activeId: number | null, dir: 1 | -1): number | null {
  if (ids.length === 0) return null
  const i = activeId === null ? -1 : ids.indexOf(activeId)
  if (i === -1) return ids[0]
  return ids[(i + dir + ids.length) % ids.length]
}

/**
 * Apply a renderer-requested order. Untrusted input: ids that aren't tabs are
 * dropped and any tab missing from `order` keeps its place at the end, so a
 * stale or malformed request can never lose or duplicate a tab.
 */
export function reorderIds(ids: readonly number[], order: readonly unknown[]): number[] {
  const known = new Set(ids)
  const seen = new Set<number>()
  const out: number[] = []
  for (const id of order) {
    if (typeof id !== 'number' || !known.has(id) || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  for (const id of ids) if (!seen.has(id)) out.push(id)
  return out
}
