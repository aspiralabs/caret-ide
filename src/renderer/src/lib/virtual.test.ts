import { describe, expect, it } from 'vitest'
import { visibleRange } from './virtual'

describe('visibleRange (#59)', () => {
  it('windows rows with overscan and padding that preserves total height', () => {
    const r = visibleRange(2400, 480, 24, 1000, 8)
    expect(r.start).toBe(100 - 8)
    expect(r.end).toBe(100 + 21 + 8)
    expect(r.topPad + (r.end - r.start) * 24 + r.bottomPad).toBe(1000 * 24)
  })
  it('clamps at both ends and handles empty lists', () => {
    expect(visibleRange(0, 480, 24, 10)).toEqual({ start: 0, end: 10, topPad: 0, bottomPad: 0 })
    expect(visibleRange(0, 480, 24, 0)).toEqual({ start: 0, end: 0, topPad: 0, bottomPad: 0 })
    const r = visibleRange(100000, 480, 24, 50)
    expect(r.end).toBe(50)
  })
})
