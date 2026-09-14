import { describe, expect, it } from 'vitest'
import { chordToAccelerator } from './menu'

describe('chordToAccelerator (#49)', () => {
  it('maps modifiers and keys to Electron accelerators', () => {
    expect(chordToAccelerator('mod+shift+p')).toBe('CmdOrCtrl+Shift+P')
    expect(chordToAccelerator('mod+arrowup')).toBe('CmdOrCtrl+Up')
    expect(chordToAccelerator('ctrl+`')).toBe('Control+`')
    expect(chordToAccelerator('mod+=')).toBe('CmdOrCtrl+=')
    expect(chordToAccelerator('alt+shift+f')).toBe('Alt+Shift+F')
    expect(chordToAccelerator('hyper+x')).toBeNull()
    expect(chordToAccelerator('mod+f13')).toBeNull()
  })
})
