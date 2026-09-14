import { describe, expect, it } from 'vitest'
import { duplicateName, splitExt, uniqueName } from './fsNames'

describe('splitExt', () => {
  it('splits the last extension and leaves dotfiles alone', () => {
    expect(splitExt('a.tar.gz')).toEqual({ stem: 'a.tar', ext: '.gz' })
    expect(splitExt('.env')).toEqual({ stem: '.env', ext: '' })
    expect(splitExt('README')).toEqual({ stem: 'README', ext: '' })
  })
})

describe('uniqueName / duplicateName (#29, #32)', () => {
  it('numbers collisions case-insensitively', () => {
    expect(uniqueName('a.ts', [])).toBe('a.ts')
    expect(uniqueName('a.ts', ['A.TS'])).toBe('a 2.ts')
    expect(uniqueName('a.ts', ['a.ts', 'a 2.ts'])).toBe('a 3.ts')
    expect(uniqueName('dir', ['dir'])).toBe('dir 2')
  })
  it('uses Finder-style "copy" names', () => {
    expect(duplicateName('a.ts', ['a.ts'])).toBe('a copy.ts')
    expect(duplicateName('a.ts', ['a.ts', 'a copy.ts'])).toBe('a copy 2.ts')
    expect(duplicateName('.env', ['.env'])).toBe('.env copy')
  })
})
