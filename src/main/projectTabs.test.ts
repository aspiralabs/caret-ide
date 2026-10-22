import { describe, expect, it } from 'vitest'
import { cycleId, neighborAfterClose, reorderIds } from './projectTabs'

describe('neighborAfterClose', () => {
  it('prefers the tab to the right', () => {
    expect(neighborAfterClose([1, 2, 3], 2)).toBe(3)
  })
  it('falls back to the left at the end', () => {
    expect(neighborAfterClose([1, 2, 3], 3)).toBe(2)
  })
  it('is null for the last tab', () => {
    expect(neighborAfterClose([1], 1)).toBeNull()
  })
  it('returns the first tab when the id is unknown', () => {
    expect(neighborAfterClose([4, 5], 9)).toBe(4)
  })
})

describe('cycleId', () => {
  it('steps forward and wraps', () => {
    expect(cycleId([1, 2, 3], 2, 1)).toBe(3)
    expect(cycleId([1, 2, 3], 3, 1)).toBe(1)
  })
  it('steps backward and wraps', () => {
    expect(cycleId([1, 2, 3], 1, -1)).toBe(3)
  })
  it('handles empty and unknown', () => {
    expect(cycleId([], null, 1)).toBeNull()
    expect(cycleId([7, 8], 99, 1)).toBe(7)
  })
})

describe('reorderIds', () => {
  it('applies a full permutation', () => {
    expect(reorderIds([1, 2, 3], [3, 1, 2])).toEqual([3, 1, 2])
  })
  it('drops unknown, duplicate and non-number ids', () => {
    expect(reorderIds([1, 2, 3], [2, 2, 'x', 9, 1])).toEqual([2, 1, 3])
  })
  it('keeps tabs missing from the order at the end', () => {
    expect(reorderIds([1, 2, 3], [3])).toEqual([3, 1, 2])
  })
})
