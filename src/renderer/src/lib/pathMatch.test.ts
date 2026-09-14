import { describe, expect, it } from 'vitest'
import { isSameOrUnder, rebasePath } from './pathMatch'

describe('isSameOrUnder', () => {
  it('matches the dir itself and descendants, not siblings with a shared prefix', () => {
    expect(isSameOrUnder('/p/src', '/p/src')).toBe(true)
    expect(isSameOrUnder('/p/src/a/b.ts', '/p/src')).toBe(true)
    expect(isSameOrUnder('/p/src-old/a.ts', '/p/src')).toBe(false)
    expect(isSameOrUnder('/p/other', '/p/src')).toBe(false)
    expect(isSameOrUnder('/p/src/a.ts', '/p/src/')).toBe(true)
  })
})

describe('rebasePath', () => {
  it('re-roots descendants and the dir itself', () => {
    expect(rebasePath('/p/src', '/p/src', '/p/lib')).toBe('/p/lib')
    expect(rebasePath('/p/src/a/b.ts', '/p/src', '/p/lib')).toBe('/p/lib/a/b.ts')
    expect(rebasePath('/p/src-old/a.ts', '/p/src', '/p/lib')).toBe('/p/src-old/a.ts')
    expect(rebasePath('/p/a.ts', '/p/a.ts', '/p/b.ts')).toBe('/p/b.ts')
  })
})
