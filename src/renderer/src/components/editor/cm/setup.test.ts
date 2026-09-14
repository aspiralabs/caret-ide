// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { appKeymap } from './setup'

describe('appKeymap (bug #7)', () => {
  it('stops propagation on every handled chord so the global handler never double-fires', () => {
    const bindings = appKeymap({ onSave: () => {} })
    expect(bindings.map((b) => b.key)).toEqual(['Mod-s', 'Mod-b', 'Mod-i'])
    for (const b of bindings) {
      expect(b.preventDefault).toBe(true)
      expect(b.stopPropagation).toBe(true)
    }
  })
})
