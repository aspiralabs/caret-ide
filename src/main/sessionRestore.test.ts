import { describe, expect, it } from 'vitest'
import { normalizeSession } from './sessionRestore'

describe('session restore: normalizeSession', () => {
  const all = (): boolean => true

  it('keeps windows, tab order and the active tab', () => {
    const saved = [
      { roots: ['/a', '/b'], active: '/b' },
      { roots: ['/c'], active: '/c' }
    ]
    expect(normalizeSession(saved, all)).toEqual(saved)
  })

  it('drops folders that are gone and fixes up the active tab', () => {
    const exists = (d: string): boolean => d !== '/b'
    expect(normalizeSession([{ roots: ['/a', '/b'], active: '/b' }], exists)).toEqual([{ roots: ['/a'], active: '/a' }])
    expect(normalizeSession([{ roots: ['/b'], active: '/b' }, { roots: ['/c'], active: null }], exists)).toEqual([
      { roots: ['/c'], active: '/c' }
    ])
  })

  it('opens a root once, in its first window', () => {
    expect(normalizeSession([{ roots: ['/a', '/b'], active: '/a' }, { roots: ['/b', '/c'], active: '/b' }], all)).toEqual([
      { roots: ['/a', '/b'], active: '/a' },
      { roots: ['/c'], active: '/c' }
    ])
  })

  it('ignores junk', () => {
    expect(normalizeSession(undefined, all)).toEqual([])
    expect(normalizeSession({ roots: ['/a'] }, all)).toEqual([])
    expect(normalizeSession([null, 3, { roots: 'x' }, { roots: [4, 'rel/path', ''] }], all)).toEqual([])
  })
})
