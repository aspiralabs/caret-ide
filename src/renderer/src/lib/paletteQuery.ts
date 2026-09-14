/** Palette modes keyed by a leading prefix character (VS Code convention). */
export type PaletteMode = 'files' | 'commands' | 'line' | 'symbols' | 'search'

export const PALETTE_PREFIX: Record<Exclude<PaletteMode, 'files'>, string> = {
  commands: '>',
  line: ':',
  symbols: '@',
  search: '#'
}

/** Split a raw palette query into its mode and the term to match. */
export function parsePaletteQuery(raw: string): { mode: PaletteMode; term: string } {
  const first = raw[0]
  for (const [mode, prefix] of Object.entries(PALETTE_PREFIX) as Array<[Exclude<PaletteMode, 'files'>, string]>) {
    if (first === prefix) return { mode, term: raw.slice(1).trim() }
  }
  return { mode: 'files', term: raw.trim() }
}

/** `:12` / `:12:4` → line (and column); null when not a number. */
export function parseLineTerm(term: string): { line: number; column?: number } | null {
  const m = /^(\d+)(?:[:,](\d+))?$/.exec(term.trim())
  if (!m) return null
  const line = Number(m[1])
  if (line < 1) return null
  return m[2] ? { line, column: Math.max(1, Number(m[2])) } : { line }
}

/** Commands ordered with the most recently run first (stable for the rest). */
export function orderByRecent<T extends { id: string }>(items: readonly T[], recentIds: readonly string[]): T[] {
  const rank = new Map(recentIds.map((id, i) => [id, i]))
  return [...items].sort((a, b) => {
    const ra = rank.get(a.id) ?? Infinity
    const rb = rank.get(b.id) ?? Infinity
    return ra - rb
  })
}
