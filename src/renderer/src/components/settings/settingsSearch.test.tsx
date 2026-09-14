// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { rowMatches } from './SettingsView'

describe('settings search (#52)', () => {
  it('matches every word against title + description, case-insensitively', () => {
    expect(rowMatches('', 'Font size', 'Editor font')).toBe(true)
    expect(rowMatches('font', 'Font size', 'Editor font size in pixels')).toBe(true)
    expect(rowMatches('editor pixels', 'Font size', 'Editor font size in pixels')).toBe(true)
    expect(rowMatches('terminal', 'Font size', 'Editor font size in pixels')).toBe(false)
  })
})
