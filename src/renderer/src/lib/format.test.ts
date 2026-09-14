import { describe, expect, it } from 'vitest'
import { formatOutcomeMessage } from './format'

describe('formatOutcomeMessage (#22)', () => {
  const ok = { kind: 'formatted', formatted: 'x', cursorOffset: 0, changed: true, prettier: 'bundled', version: '3', config: 'defaults' } as const
  it('is quiet on success and on skips during save, chatty for explicit runs', () => {
    expect(formatOutcomeMessage(ok, true)).toBeNull()
    expect(formatOutcomeMessage({ ...ok, changed: false }, true)).toBe('Already formatted')
    expect(formatOutcomeMessage({ ...ok, changed: false }, false)).toBeNull()
    expect(formatOutcomeMessage({ kind: 'skipped', reason: 'ignored' }, false)).toBeNull()
    expect(formatOutcomeMessage({ kind: 'skipped', reason: 'no-parser' }, true)).toMatch(/no parser/)
    expect(formatOutcomeMessage({ kind: 'skipped', reason: 'too-large' }, true)).toMatch(/too large/)
  })
  it('always surfaces errors, first line only', () => {
    expect(formatOutcomeMessage({ kind: 'error', message: 'SyntaxError: x (1:3)\n> 1 | const' }, false)).toBe(
      'Prettier: SyntaxError: x (1:3)'
    )
  })
})
