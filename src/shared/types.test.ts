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

describe('normalizeSettings — feature flags', () => {
  it('ships every flag off and forces the gated settings to their off shape', () => {
    const s = defaultSettings()
    expect(s.features.terminalMode).toBe(false)
    expect(s.startupMode).toBe('welcome')
    expect(s.layoutPresets.some((p) => p.id === TERMINAL_PRESET_ID)).toBe(false)
    expect(s.editorMinimap).toBe(false)
    expect(s.checkForUpdates).toBe(false)
  })

  it('reads `features` from the file and ignores junk', () => {
    expect(normalizeSettings({ features: { terminalMode: true } }).features.terminalMode).toBe(true)
    expect(normalizeSettings({ features: 'yes' }).features.terminalMode).toBe(false)
  })

  it('with terminalMode off: startupMode is always welcome and the Terminal preset is hidden', () => {
    expect(normalizeSettings({ startupMode: 'terminal' }).startupMode).toBe('welcome')
    const s = normalizeSettings({ layoutPresets: [terminalPreset(), { id: 'x', name: 'X' }] })
    expect(s.layoutPresets.map((p) => p.id)).toEqual(['x'])
  })

  it('with editorMinimap / checkForUpdates off the booleans are forced false', () => {
    const s = normalizeSettings({ editorMinimap: true, checkForUpdates: true })
    expect(s.editorMinimap).toBe(false)
    expect(s.checkForUpdates).toBe(false)
    const on = normalizeSettings({ features: { editorMinimap: true, checkForUpdates: true }, editorMinimap: true, checkForUpdates: true })
    expect(on.editorMinimap).toBe(true)
    expect(on.checkForUpdates).toBe(true)
  })
})

const TM = { features: { terminalMode: true } }

describe('normalizeSettings — startup mode and the Terminal preset (flag on)', () => {
  it('defaults startupMode to terminal and accepts only the two known values', () => {
    expect(normalizeSettings(TM).startupMode).toBe('terminal')
    expect(normalizeSettings({ ...TM, startupMode: 'welcome' }).startupMode).toBe('welcome')
    expect(normalizeSettings({ ...TM, startupMode: 'ide' }).startupMode).toBe('terminal')
  })

  it('ships the Terminal preset in the defaults', () => {
    const ids = defaultLayoutPresets().map((p) => p.id)
    expect(ids).toContain(TERMINAL_PRESET_ID)
    expect(defaultLayoutPresets().find((p) => p.id === TERMINAL_PRESET_ID)).toEqual(terminalPreset())
  })

  it('appends the Terminal preset for users with customised presets that lack it', () => {
    const custom = [{ id: 'mine', name: 'Mine', leftVisible: true, centerVisible: false, rightVisible: true, centerSplit: false, terminalSplit: false }]
    const s = normalizeSettings({ ...TM, layoutPresets: custom })
    expect(s.layoutPresets.map((p) => p.id)).toEqual(['mine', TERMINAL_PRESET_ID])
  })

  it('does not duplicate the Terminal preset when it is already there', () => {
    const s = normalizeSettings({ ...TM, layoutPresets: [terminalPreset(), { id: 'x', name: 'X' }] })
    expect(s.layoutPresets.filter((p) => p.id === TERMINAL_PRESET_ID)).toHaveLength(1)
  })

  it('honours a deliberate deletion once the preset has been seeded', () => {
    const s = normalizeSettings({ ...TM, layoutPresets: [{ id: 'x', name: 'X' }], terminalPresetSeeded: true })
    expect(s.layoutPresets.map((p) => p.id)).toEqual(['x'])
  })
})
