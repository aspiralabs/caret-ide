import { describe, expect, it } from 'vitest'
import { allThemes, BUNDLED_THEMES, cssVarsFor, hexToTriplet, resolvePalette, validateTheme } from './themes'

describe('themes (#51)', () => {
  it('bundles the expected palettes with unique ids and full colour sets', () => {
    const ids = BUNDLED_THEMES.map((t) => t.id)
    expect(ids).toEqual(['caret-dark', 'caret-light', 'one-dark', 'solarized-dark', 'solarized-light', 'github-dark', 'github-light'])
    for (const t of BUNDLED_THEMES) {
      for (const v of Object.values(t.ink)) expect(v).toMatch(/^#[0-9a-f]{6}$/i)
      for (const v of Object.values(t.ansi)) expect(v).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('converts hex to CSS triplets', () => {
    expect(hexToTriplet('#228df2')).toBe('34 141 242')
    expect(cssVarsFor(BUNDLED_THEMES[0])['--ink-bg']).toBe('24 24 24')
    expect(cssVarsFor(BUNDLED_THEMES[0])['--code-inline']).toBe('#e394dc')
  })

  it('validates custom themes, filling gaps from the bundled base', () => {
    const t = validateTheme({ id: 'mine', name: 'Mine', appearance: 'dark', ink: { bg: '#000000', bogus: '#ffffff', accent: 'red' } })
    expect(t?.ink.bg).toBe('#000000')
    expect(t?.ink.accent).toBe(BUNDLED_THEMES[0].ink.accent) // invalid hex ignored
    expect(t?.ansi.red).toBe(BUNDLED_THEMES[0].ansi.red)
    expect(validateTheme({ id: 'x', name: 'x', appearance: 'blue' })).toBeNull()
    expect(validateTheme('nope')).toBeNull()
  })

  it('merges custom themes (shadowing by id) and resolves per appearance with fallbacks', () => {
    const themes = allThemes([{ id: 'one-dark', name: 'My One Dark', appearance: 'dark' }, 'junk'])
    expect(themes.filter((t) => t.id === 'one-dark')).toHaveLength(1)
    expect(themes.find((t) => t.id === 'one-dark')?.name).toBe('My One Dark')
    expect(resolvePalette(themes, 'dark', 'one-dark', 'caret-light').id).toBe('one-dark')
    expect(resolvePalette(themes, 'light', 'one-dark', 'github-light').id).toBe('github-light')
    // A dark id asked for in light mode falls back to the bundled light default.
    expect(resolvePalette(themes, 'light', 'x', 'one-dark').id).toBe('caret-light')
  })
})
