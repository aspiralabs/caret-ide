// Small greedy fuzzy subsequence matcher for the command palette (⌘P).
// Not optimal (no backtracking) but fast and good enough for file/command lists:
// every query char must appear in order; scoring rewards matches at word
// boundaries, consecutive runs, and camelCase humps, and prefers shorter targets.

export interface FuzzyResult {
  score: number
  /** Indices into `target` that matched — used to bold the matched chars. */
  matches: number[]
}

function isBoundary(prev: string): boolean {
  return prev === '/' || prev === '\\' || prev === '-' || prev === '_' || prev === '.' || prev === ' '
}

/**
 * Score `query` against `target`. Returns null if not all query chars match (in
 * order). An empty query matches everything with score 0.
 */
export function fuzzyMatch(query: string, target: string): FuzzyResult | null {
  if (!query) return { score: 0, matches: [] }
  if (query.length > target.length) return null

  const q = query.toLowerCase()
  const t = target.toLowerCase()
  const matches: number[] = []
  let score = 0
  let qi = 0
  let prevMatch = -2

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] !== q[qi]) continue

    let bonus = 1
    if (prevMatch === ti - 1) bonus += 5 // consecutive run
    const prevChar = ti > 0 ? target[ti - 1] : ''
    if (ti === 0 || isBoundary(prevChar)) {
      bonus += 10 // start of a path segment / word
    } else if (
      prevChar &&
      prevChar === prevChar.toLowerCase() &&
      target[ti] !== target[ti].toLowerCase()
    ) {
      bonus += 8 // camelCase hump (e.g. the "P" in "CommandPalette")
    }

    score += bonus
    matches.push(ti)
    prevMatch = ti
    qi++
  }

  if (qi < q.length) return null // ran out of target before matching all of query
  // Tie-breaker: prefer shorter targets and earlier first match.
  score -= target.length * 0.05
  score -= matches[0] * 0.1
  return { score, matches }
}
