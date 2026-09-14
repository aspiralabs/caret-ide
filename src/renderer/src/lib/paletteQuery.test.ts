import { describe, expect, it } from 'vitest'
import { orderByRecent, parseLineTerm, parsePaletteQuery } from './paletteQuery'

describe('parsePaletteQuery (#50)', () => {
  it('routes by prefix', () => {
    expect(parsePaletteQuery('')).toEqual({ mode: 'files', term: '' })
    expect(parsePaletteQuery('app')).toEqual({ mode: 'files', term: 'app' })
    expect(parsePaletteQuery('> save')).toEqual({ mode: 'commands', term: 'save' })
    expect(parsePaletteQuery(':42')).toEqual({ mode: 'line', term: '42' })
    expect(parsePaletteQuery('@render')).toEqual({ mode: 'symbols', term: 'render' })
    expect(parsePaletteQuery('#useTabs')).toEqual({ mode: 'search', term: 'useTabs' })
  })
})

describe('parseLineTerm', () => {
  it('reads line and optional column', () => {
    expect(parseLineTerm('42')).toEqual({ line: 42 })
    expect(parseLineTerm('42:7')).toEqual({ line: 42, column: 7 })
    expect(parseLineTerm('0')).toBeNull()
    expect(parseLineTerm('abc')).toBeNull()
    expect(parseLineTerm('')).toBeNull()
  })
})

describe('orderByRecent', () => {
  it('puts recently run commands first, keeping the rest in order', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]
    expect(orderByRecent(items, ['c', 'a']).map((i) => i.id)).toEqual(['c', 'a', 'b', 'd'])
    expect(orderByRecent(items, []).map((i) => i.id)).toEqual(['a', 'b', 'c', 'd'])
  })
})
