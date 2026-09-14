import { describe, expect, it } from 'vitest'
import { ancestorsWithin, crumbsFor } from './breadcrumbs'

describe('ancestorsWithin (#26)', () => {
  it('lists each directory between the root and the file', () => {
    expect(ancestorsWithin('/p/src/a/b.ts', '/p')).toEqual(['/p/src', '/p/src/a'])
    expect(ancestorsWithin('/p/top.ts', '/p')).toEqual([])
    expect(ancestorsWithin('/p/src/a/b.ts', '/p/')).toEqual(['/p/src', '/p/src/a'])
    expect(ancestorsWithin('/elsewhere/x.ts', '/p')).toEqual([])
  })
})

describe('crumbsFor', () => {
  it('builds clickable segments with absolute paths', () => {
    expect(crumbsFor('/p/src/a/b.ts', '/p')).toEqual([
      { name: 'src', path: '/p/src', isDir: true },
      { name: 'a', path: '/p/src/a', isDir: true },
      { name: 'b.ts', path: '/p/src/a/b.ts', isDir: false }
    ])
    expect(crumbsFor('/p/README.md', '/p')).toEqual([{ name: 'README.md', path: '/p/README.md', isDir: false }])
  })
  it('falls back to the absolute path outside the root', () => {
    expect(crumbsFor('/x/y.ts', '/p').map((c) => c.path)).toEqual(['/x', '/x/y.ts'])
  })
})
