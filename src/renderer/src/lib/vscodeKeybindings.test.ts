import { describe, expect, it } from 'vitest'
import { importVscodeKeybindings, vscodeKeyToChord } from './vscodeKeybindings'

describe('vscodeKeyToChord (#53)', () => {
  it('normalises modifiers and keys', () => {
    expect(vscodeKeyToChord('cmd+shift+p')).toBe('mod+shift+p')
    expect(vscodeKeyToChord('shift+cmd+f')).toBe('mod+shift+f')
    expect(vscodeKeyToChord('ctrl+`')).toBe('ctrl+`')
    expect(vscodeKeyToChord('cmd+oem_4')).toBe('mod+[')
    expect(vscodeKeyToChord('cmd+up')).toBe('mod+arrowup')
    expect(vscodeKeyToChord('ctrl+k ctrl+s')).toBeNull()
    expect(vscodeKeyToChord('hyper+x')).toBeNull()
  })
})

describe('importVscodeKeybindings', () => {
  it('maps known commands, tolerates comments, and reports skips', () => {
    const json = `// my keys
[
  { "key": "cmd+shift+f", "command": "workbench.action.findInFiles", "when": "x" },
  { "key": "cmd+k cmd+s", "command": "workbench.action.files.saveAll" },
  { "key": "cmd+e", "command": "some.extension.command" },
  { "key": "cmd+s", "command": "-workbench.action.files.save" },
  { "key": "cmd+alt+s", "command": "workbench.action.files.save" },
]`
    const r = importVscodeKeybindings(json)
    expect(r.bindings).toEqual({ 'find-in-project': ['mod+shift+f'], 'save-file': ['mod+alt+s'] })
    expect(r.skipped.map((s) => s.reason)).toEqual(['unsupported key', 'no matching Caret command'])
  })
  it('rejects non-arrays and garbage', () => {
    expect(() => importVscodeKeybindings('{}')).toThrow(/array/)
    expect(() => importVscodeKeybindings('nope')).toThrow(/valid/)
  })
})
