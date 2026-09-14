import { describe, expect, it } from 'vitest'
import { diffLines, gutterMarkers, splitLines } from './lineDiff'

describe('splitLines', () => {
  it('counts lines like an editor', () => {
    expect(splitLines('')).toEqual([])
    expect(splitLines('a')).toEqual(['a'])
    expect(splitLines('a\nb\n')).toEqual(['a', 'b'])
    expect(splitLines('a\n\nb')).toEqual(['a', '', 'b'])
  })
})

describe('diffLines (integration #14)', () => {
  it('reports no hunks for identical text', () => {
    expect(diffLines('a\nb\nc\n', 'a\nb\nc\n')).toEqual([])
  })

  it('finds a modified line', () => {
    expect(diffLines('a\nb\nc\n', 'a\nB\nc\n')).toEqual([
      { origStart: 2, origLines: 1, modStart: 2, modLines: 1 }
    ])
  })

  it('finds insertions (anchored after a line) and deletions', () => {
    expect(diffLines('a\nc\n', 'a\nb\nc\n')).toEqual([
      { origStart: 1, origLines: 0, modStart: 2, modLines: 1 }
    ])
    expect(diffLines('a\nb\nc\n', 'a\nc\n')).toEqual([
      { origStart: 2, origLines: 1, modStart: 1, modLines: 0 }
    ])
    expect(diffLines('', 'x\ny\n')).toEqual([{ origStart: 0, origLines: 0, modStart: 1, modLines: 2 }])
    expect(diffLines('x\n', '')).toEqual([{ origStart: 1, origLines: 1, modStart: 0, modLines: 0 }])
  })

  it('separates multiple hunks and handles duplicate lines', () => {
    const orig = ['import a', '', 'fn one() {', '  return 1', '}', '', 'fn two() {', '  return 2', '}'].join('\n')
    const mod = ['import a', 'import b', '', 'fn one() {', '  return 10', '}', '', 'fn three() {', '  return 3', '}', 'fn two() {', '  return 2', '}'].join('\n')
    const hunks = diffLines(orig, mod)
    expect(hunks.length).toBeGreaterThanOrEqual(3)
    // Every hunk's modified range must lie inside the modified text.
    const modLines = mod.split('\n').length
    for (const h of hunks) expect(h.modStart + h.modLines - 1).toBeLessThanOrEqual(modLines)
    // Applying the hunks to the original must reproduce the modified text.
    const a = orig.split('\n')
    const b = mod.split('\n')
    const rebuilt: string[] = []
    let ai = 0
    for (const h of hunks) {
      const eqUntil = h.origLines === 0 ? h.origStart : h.origStart - 1
      while (ai < eqUntil) rebuilt.push(a[ai++])
      ai += h.origLines
      for (let i = 0; i < h.modLines; i++) rebuilt.push(b[h.modStart - 1 + i])
    }
    while (ai < a.length) rebuilt.push(a[ai++])
    expect(rebuilt).toEqual(b)
  })

  it('is exact on a randomised round-trip', () => {
    let seed = 7
    const rnd = (): number => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
    for (let t = 0; t < 40; t++) {
      const a = Array.from({ length: Math.floor(rnd() * 30) }, () => String.fromCharCode(97 + Math.floor(rnd() * 4)))
      const b = a.map((l) => (rnd() < 0.3 ? String.fromCharCode(97 + Math.floor(rnd() * 4)) : l)).filter(() => rnd() > 0.15)
      if (rnd() < 0.5) b.splice(Math.floor(rnd() * b.length), 0, 'z')
      const hunks = diffLines(a.join('\n'), b.join('\n'))
      const rebuilt: string[] = []
      let ai = 0
      for (const h of hunks) {
        const eqUntil = h.origLines === 0 ? h.origStart : h.origStart - 1
        while (ai < eqUntil) rebuilt.push(a[ai++])
        ai += h.origLines
        for (let i = 0; i < h.modLines; i++) rebuilt.push(b[h.modStart - 1 + i])
      }
      while (ai < a.length) rebuilt.push(a[ai++])
      expect(rebuilt).toEqual(b)
    }
  })
})

describe('gutterMarkers', () => {
  it('maps hunks to per-line marker kinds', () => {
    expect(
      gutterMarkers([
        { origStart: 2, origLines: 1, modStart: 2, modLines: 1 },
        { origStart: 3, origLines: 0, modStart: 4, modLines: 2 },
        { origStart: 5, origLines: 2, modStart: 5, modLines: 0 },
        { origStart: 1, origLines: 1, modStart: 0, modLines: 0 }
      ])
    ).toEqual([
      { line: 2, kind: 'modified' },
      { line: 4, kind: 'added' },
      { line: 5, kind: 'added' },
      { line: 5, kind: 'deleted' },
      { line: 1, kind: 'deleted' }
    ])
  })
})
