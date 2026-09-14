import { describe, expect, it } from 'vitest'
import { defaultSettings, normalizeSettings } from '@shared/types'
import { monacoOptionsFromSettings } from './editorOptions'

describe('editor options from settings (#21)', () => {
  it('maps every toggle', () => {
    const o = monacoOptionsFromSettings({
      wordWrap: true,
      editorFontSize: 15,
      editorMinimap: true,
      editorBracketPairs: false,
      editorStickyScroll: false
    })
    expect(o).toMatchObject({
      wordWrap: 'on',
      fontSize: 15,
      minimap: { enabled: true },
      bracketPairColorization: { enabled: false },
      stickyScroll: { enabled: false }
    })
  })
  it('has sensible defaults and clamps the font size', () => {
    expect(monacoOptionsFromSettings(defaultSettings())).toMatchObject({ fontSize: 13, minimap: { enabled: false } })
    expect(normalizeSettings({ editorFontSize: 2 }).editorFontSize).toBe(8)
    expect(normalizeSettings({ editorFontSize: 99 }).editorFontSize).toBe(32)
    expect(normalizeSettings({ editorFontSize: '14' }).editorFontSize).toBe(13)
    expect(normalizeSettings({ editorMinimap: true }).editorMinimap).toBe(true)
  })
})
