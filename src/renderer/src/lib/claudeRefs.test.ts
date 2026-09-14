import { describe, expect, it } from 'vitest'
import { fencedSnippet, fileReference, lineReference, relativePath } from './claudeRefs'

const root = '/Users/me/proj'

describe('relativePath / fileReference', () => {
  it('strips the root and never a sibling prefix', () => {
    expect(relativePath('/Users/me/proj/src/App.tsx', root)).toBe('src/App.tsx')
    expect(relativePath('/Users/me/proj/src/App.tsx', root + '/')).toBe('src/App.tsx')
    expect(relativePath('/Users/me/proj-two/x.ts', root)).toBe('/Users/me/proj-two/x.ts')
    expect(relativePath(root, root)).toBe('.')
    expect(relativePath('/x/y.ts', '')).toBe('/x/y.ts')
    expect(fileReference('/Users/me/proj/README.md', root)).toBe('@README.md')
  })
})

describe('lineReference', () => {
  it('formats a single line and an ordered range', () => {
    expect(lineReference('/Users/me/proj/a.ts', root, 7, 7)).toBe('@a.ts#L7')
    expect(lineReference('/Users/me/proj/a.ts', root, 20, 10)).toBe('@a.ts#L10-L20')
  })
})

describe('fencedSnippet', () => {
  it('fences with a language and strips one trailing newline', () => {
    expect(fencedSnippet('const x = 1\n', 'ts')).toBe('```ts\nconst x = 1\n```')
  })
  it('picks a longer fence when the snippet contains backtick fences', () => {
    const md = 'text\n```js\ncode\n```\n'
    expect(fencedSnippet(md, 'md')).toBe('````md\ntext\n```js\ncode\n```\n````')
  })
})
