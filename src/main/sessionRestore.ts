// ---------------------------------------------------------------------------
// Reopen last session's project tabs at launch (pure; no fs / electron).
//
// window.ts reports the open project windows (tab roots in order + the active
// one) whenever the tabs change; windowState persists that list. At launch the
// saved list is validated here — folders that no longer exist are dropped, a
// root open in two windows keeps its first — and index.ts reopens it.
// ---------------------------------------------------------------------------

/** One project window: its tabs' roots in display order and the visible one. */
export interface SavedWindow {
  roots: string[]
  active: string | null
}

/** Clean a persisted value into windows worth reopening (empty when there's nothing). */
export function normalizeSession(raw: unknown, exists: (dir: string) => boolean): SavedWindow[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: SavedWindow[] = []
  for (const w of raw) {
    if (!w || typeof w !== 'object') continue
    const { roots, active } = w as { roots?: unknown; active?: unknown }
    if (!Array.isArray(roots)) continue
    const kept: string[] = []
    for (const r of roots) {
      if (typeof r !== 'string' || !r.startsWith('/') || seen.has(r) || !exists(r)) continue
      seen.add(r)
      kept.push(r)
    }
    if (kept.length === 0) continue
    out.push({ roots: kept, active: typeof active === 'string' && kept.includes(active) ? active : kept[0] })
  }
  return out
}
