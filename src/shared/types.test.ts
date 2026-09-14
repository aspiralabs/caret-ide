import { describe, expect, it } from 'vitest'
import { defaultSettings, normalizeSettings } from './types'

describe('normalizeSettings', () => {
  it('reads the global wordWrap setting (bug #20) and defaults it off', () => {
    expect(defaultSettings().wordWrap).toBe(false)
    expect(normalizeSettings({ wordWrap: true }).wordWrap).toBe(true)
    expect(normalizeSettings({ wordWrap: 'yes' }).wordWrap).toBe(false)
    expect(normalizeSettings(null).wordWrap).toBe(false)
  })

  it('keeps defaults for unknown or malformed fields', () => {
    const s = normalizeSettings({ theme: 'neon', layoutPresets: 'nope', keybindings: { a: 'x', b: ['mod+b', 3] } })
    expect(s.theme).toBe('system')
    expect(s.layoutPresets).toEqual(defaultSettings().layoutPresets)
    expect(s.keybindings).toEqual({ b: ['mod+b'] })
  })
})
