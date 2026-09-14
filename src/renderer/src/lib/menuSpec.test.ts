import { describe, expect, it } from 'vitest'
import { buildMenuSpec } from './menuSpec'

describe('buildMenuSpec (#49)', () => {
  it('lists command items with their live chords', () => {
    const spec = buildMenuSpec({})
    const file = spec.find((m) => m.label === 'File')!
    const save = file.items.find((i) => i.type === 'command' && i.id === 'save-file')
    expect(save).toMatchObject({ chord: 'mod+s', label: 'Save' })
    const go = spec.find((m) => m.label === 'Go')!
    expect(go.items).toContainEqual({ type: 'command', id: 'command-palette', label: 'Command Palette…', chord: 'mod+shift+p' })
  })
  it('leaves editor-first chords (⌘B, ⌘D) without accelerators', () => {
    const view = buildMenuSpec({}).find((m) => m.label === 'View')!
    expect(view.items.find((i) => i.type === 'command' && i.id === 'toggle-left')).toMatchObject({ chord: undefined })
    const term = buildMenuSpec({}).find((m) => m.label === 'Terminal')!
    expect(term.items.find((i) => i.type === 'command' && i.id === 'new-terminal-tab')).toMatchObject({ chord: undefined })
  })
  it('follows user rebinds', () => {
    const spec = buildMenuSpec({ 'save-file': ['mod+alt+w'] })
    const file = spec.find((m) => m.label === 'File')!
    expect(file.items.find((i) => i.type === 'command' && i.id === 'save-file')).toMatchObject({ chord: 'mod+alt+w' })
  })
})

import { COMMANDS } from './commands'
import { isValidChord } from './keybindings'

describe('command default chords', () => {
  it('are all canonical (mod, ctrl, alt, shift order) so they can actually match keydowns', () => {
    const order = ['mod', 'ctrl', 'alt', 'shift']
    for (const c of COMMANDS) {
      for (const chord of c.defaultKeybindings ?? []) {
        expect(isValidChord(chord)).toBe(true)
        const mods = chord.split('+').slice(0, -1)
        const idx = mods.map((m) => order.indexOf(m))
        expect([...idx].sort((a, b) => a - b)).toEqual(idx)
      }
    }
  })
})
