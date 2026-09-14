import { describe, expect, it } from 'vitest'
import { inputToChord } from './inputChord'

describe('inputToChord (bug #9)', () => {
  it('matches the renderer chord format', () => {
    expect(inputToChord({ type: 'keyDown', key: 'P', meta: true, shift: true })).toBe('mod+shift+p')
    expect(inputToChord({ type: 'keyDown', key: 'r', meta: true })).toBe('mod+r')
    expect(inputToChord({ type: 'keyDown', key: 'Tab', control: true })).toBe('ctrl+tab')
    expect(inputToChord({ type: 'keyDown', key: '1', meta: true })).toBe('mod+1')
    expect(inputToChord({ type: 'keyDown', key: ' ', meta: true })).toBe('mod+space')
    expect(
      inputToChord({ type: 'keyDown', key: '}', code: 'BracketRight', meta: true, shift: true })
    ).toBe('mod+shift+]')
  })

  it('ignores key-ups, lone modifiers and unmodified keys', () => {
    expect(inputToChord({ type: 'keyUp', key: 'r', meta: true })).toBeNull()
    expect(inputToChord({ type: 'keyDown', key: 'Meta', meta: true })).toBeNull()
    expect(inputToChord({ type: 'keyDown', key: 'a' })).toBeNull()
    expect(inputToChord({ type: 'keyDown', key: 'a', shift: true })).toBeNull()
  })
})
