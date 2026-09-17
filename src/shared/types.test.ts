import { describe, expect, it } from 'vitest'
import { defaultLayoutPresets, defaultSettings, normalizeSettings, terminalPreset, TERMINAL_PRESET_ID } from './types'

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

describe('normalizeSettings — startup mode and the Terminal preset', () => {
  it('defaults startupMode to terminal and accepts only the two known values', () => {
    expect(defaultSettings().startupMode).toBe('terminal')
    expect(normalizeSettings({}).startupMode).toBe('terminal')
    expect(normalizeSettings({ startupMode: 'welcome' }).startupMode).toBe('welcome')
    expect(normalizeSettings({ startupMode: 'ide' }).startupMode).toBe('terminal')
  })

  it('ships the Terminal preset in the defaults', () => {
    const ids = defaultLayoutPresets().map((p) => p.id)
    expect(ids).toContain(TERMINAL_PRESET_ID)
    expect(defaultLayoutPresets().find((p) => p.id === TERMINAL_PRESET_ID)).toEqual(terminalPreset())
  })

  it('appends the Terminal preset for users with customised presets that lack it', () => {
    const custom = [{ id: 'mine', name: 'Mine', leftVisible: true, centerVisible: false, rightVisible: true, centerSplit: false, terminalSplit: false }]
    const s = normalizeSettings({ layoutPresets: custom })
    expect(s.layoutPresets.map((p) => p.id)).toEqual(['mine', TERMINAL_PRESET_ID])
  })

  it('does not duplicate the Terminal preset when it is already there', () => {
    const s = normalizeSettings({ layoutPresets: [terminalPreset(), { id: 'x', name: 'X' }] })
    expect(s.layoutPresets.filter((p) => p.id === TERMINAL_PRESET_ID)).toHaveLength(1)
  })

  it('honours a deliberate deletion once the preset has been seeded', () => {
    const s = normalizeSettings({ layoutPresets: [{ id: 'x', name: 'X' }], terminalPresetSeeded: true })
    expect(s.layoutPresets.map((p) => p.id)).toEqual(['x'])
  })
})
