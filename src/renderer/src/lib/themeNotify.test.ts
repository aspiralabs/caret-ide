import { describe, expect, it } from 'vitest'
import { themeNotifyChange, themeReport } from './themeNotify'

describe('themeReport', () => {
  it('encodes dark as 1 and light as 2', () => {
    expect(themeReport('dark')).toBe('\x1b[?997;1n')
    expect(themeReport('light')).toBe('\x1b[?997;2n')
  })
})

describe('themeNotifyChange', () => {
  it('tracks set and reset of mode 2031', () => {
    expect(themeNotifyChange([2031], true)).toBe(true)
    expect(themeNotifyChange([2031], false)).toBe(false)
  })
  it('finds 2031 among several modes', () => {
    expect(themeNotifyChange([1000, 1006, 2031], true)).toBe(true)
  })
  it('ignores sequences without it', () => {
    expect(themeNotifyChange([2004], true)).toBeNull()
    expect(themeNotifyChange([[2031]], true)).toBeNull()
  })
})
