// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { chordParts, eventToChord, formatChord, isValidChord, keyFromCode } from './keybindings'

const ev = (init: KeyboardEventInit): KeyboardEvent => new KeyboardEvent('keydown', init)

describe('eventToChord', () => {
  it('builds canonical chords', () => {
    expect(eventToChord(ev({ key: 'd', metaKey: true }))).toBe('mod+d')
    expect(eventToChord(ev({ key: 'Tab', ctrlKey: true, shiftKey: true }))).toBe('ctrl+shift+tab')
    expect(eventToChord(ev({ key: ' ', metaKey: true }))).toBe('mod+space')
    expect(eventToChord(ev({ key: 'Shift', shiftKey: true }))).toBeNull()
  })

  it('uses the physical key for shifted punctuation so ⌘⇧] is "mod+shift+]"', () => {
    expect(eventToChord(ev({ key: '}', code: 'BracketRight', metaKey: true, shiftKey: true }))).toBe(
      'mod+shift+]'
    )
    expect(eventToChord(ev({ key: '{', code: 'BracketLeft', metaKey: true, shiftKey: true }))).toBe(
      'mod+shift+['
    )
    expect(eventToChord(ev({ key: '!', code: 'Digit1', metaKey: true, shiftKey: true }))).toBe(
      'mod+shift+1'
    )
    expect(eventToChord(ev({ key: 'P', code: 'KeyP', metaKey: true, shiftKey: true }))).toBe(
      'mod+shift+p'
    )
    // Unshifted: the key itself is right already.
    expect(eventToChord(ev({ key: ']', code: 'BracketRight', metaKey: true }))).toBe('mod+]')
    expect(eventToChord(ev({ key: '`', code: 'Backquote', ctrlKey: true }))).toBe('ctrl+`')
  })
})

describe('keyFromCode', () => {
  it('maps letters, digits and punctuation, and returns null otherwise', () => {
    expect(keyFromCode('KeyA')).toBe('a')
    expect(keyFromCode('Digit7')).toBe('7')
    expect(keyFromCode('Equal')).toBe('=')
    expect(keyFromCode('ArrowUp')).toBeNull()
    expect(keyFromCode(undefined)).toBeNull()
  })
})

describe('formatChord / chordParts / isValidChord', () => {
  it('renders glyphs', () => {
    expect(formatChord('mod+shift+t')).toBe('⌘⇧T')
    expect(chordParts('ctrl+`')).toEqual(['⌃', '`'])
    expect(formatChord('mod+shift+]')).toBe('⌘⇧]')
  })
  it('validates', () => {
    expect(isValidChord('mod+d')).toBe(true)
    expect(isValidChord('hyper+d')).toBe(false)
    expect(isValidChord('')).toBe(false)
  })
})
