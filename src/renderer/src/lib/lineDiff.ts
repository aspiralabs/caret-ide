// Line-level diff (Myers O(ND)) for the editor's gutter change markers and
// the Changes view. Operates on arrays of lines; returns hunks in terms of
// 1-based line numbers so they map straight onto editor decorations.

export interface Hunk {
  /** First changed line in the ORIGINAL (1-based); for a pure insertion, the line after which it inserts (0 = top). */
  origStart: number
  /** Lines removed from the original. */
  origLines: number
  /** First changed line in the MODIFIED (1-based); for a pure deletion, the line after which it deleted (0 = top). */
  modStart: number
  /** Lines added in the modified. */
  modLines: number
}

/** Safety cap: beyond this many lines we skip diffing (gutter goes blank). */
export const MAX_DIFF_LINES = 20000

type Op = 'eq' | 'del' | 'ins'

/** Myers shortest-edit-script over two sequences; returns the op sequence. */
function myers(a: readonly string[], b: readonly string[]): Op[] {
  const n = a.length
  const m = b.length
  const max = n + m
  if (max === 0) return []
  const offset = max
  // v[k + offset] = furthest x on diagonal k; keep a trace per step for backtracking.
  const trace: Int32Array[] = []
  let v = new Int32Array(2 * max + 2)
  v[offset + 1] = 0
  let found = false
  for (let d = 0; d <= max && !found; d++) {
    trace.push(v.slice())
    const next = v.slice()
    for (let k = -d; k <= d; k += 2) {
      let x: number
      if (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])) x = v[offset + k + 1]
      else x = v[offset + k - 1] + 1
      let y = x - k
      while (x < n && y < m && a[x] === b[y]) {
        x++
        y++
      }
      next[offset + k] = x
      if (x >= n && y >= m) {
        found = true
        break
      }
    }
    v = next
  }
  // Backtrack.
  const ops: Op[] = []
  let x = n
  let y = m
  for (let d = trace.length - 1; d >= 0; d--) {
    const vd = trace[d]
    const k = x - y
    let prevK: number
    if (k === -d || (k !== d && vd[offset + k - 1] < vd[offset + k + 1])) prevK = k + 1
    else prevK = k - 1
    const prevX = vd[offset + prevK]
    const prevY = prevX - prevK
    while (x > prevX && y > prevY) {
      ops.push('eq')
      x--
      y--
    }
    if (d > 0) {
      if (x === prevX) {
        ops.push('ins')
        y--
      } else {
        ops.push('del')
        x--
      }
    }
  }
  return ops.reverse()
}

/** Split text into lines the way editors count them (trailing newline → no extra line). */
export function splitLines(text: string): string[] {
  if (text === '') return []
  const lines = text.split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  return lines
}

/** Diff two texts into hunks. Returns [] when either side exceeds MAX_DIFF_LINES. */
export function diffLines(original: string, modified: string): Hunk[] {
  const a = splitLines(original)
  const b = splitLines(modified)
  if (a.length > MAX_DIFF_LINES || b.length > MAX_DIFF_LINES) return []
  const ops = myers(a, b)
  const hunks: Hunk[] = []
  let ai = 0
  let bi = 0
  let cur: Hunk | null = null
  for (const op of ops) {
    if (op === 'eq') {
      cur = null
      ai++
      bi++
      continue
    }
    if (!cur) {
      cur = { origStart: ai + 1, origLines: 0, modStart: bi + 1, modLines: 0 }
      hunks.push(cur)
    }
    if (op === 'del') {
      cur.origLines++
      ai++
    } else {
      cur.modLines++
      bi++
    }
  }
  // Normalise pure insertions/deletions to "after line N" anchors.
  for (const h of hunks) {
    if (h.origLines === 0) h.origStart -= 1
    if (h.modLines === 0) h.modStart -= 1
  }
  return hunks
}

export type GutterKind = 'added' | 'modified' | 'deleted'

/**
 * Per-line gutter markers for the MODIFIED text: `added` / `modified` on the
 * lines a hunk covers, `deleted` pinned to the line after which lines were
 * removed (line 0 → shown on line 1).
 */
export function gutterMarkers(hunks: readonly Hunk[]): Array<{ line: number; kind: GutterKind }> {
  const out: Array<{ line: number; kind: GutterKind }> = []
  for (const h of hunks) {
    if (h.modLines === 0) {
      out.push({ line: Math.max(1, h.modStart), kind: 'deleted' })
      continue
    }
    const kind: GutterKind = h.origLines === 0 ? 'added' : 'modified'
    for (let i = 0; i < h.modLines; i++) out.push({ line: h.modStart + i, kind })
  }
  return out
}
