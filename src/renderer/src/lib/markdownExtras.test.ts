import { describe, expect, it } from 'vitest'
import { resolveMarkdownLink } from './markdownLinks'
import { adjacentCellOffset, isTableRow } from './tableNav'
import { extForMime, pastedImageName, pastedImageTarget } from './imagePaste'

describe('resolveMarkdownLink (#24)', () => {
  const md = '/p/docs/guide.md'
  it('routes external, anchor-only and file links', () => {
    expect(resolveMarkdownLink('https://x.y/', md, '/p')).toEqual({ kind: 'external', url: 'https://x.y/' })
    expect(resolveMarkdownLink('#setup', md, '/p')).toEqual({ kind: 'none' })
    expect(resolveMarkdownLink('./api.md', md, '/p')).toEqual({ kind: 'file', path: '/p/docs/api.md', anchor: undefined })
    expect(resolveMarkdownLink('../README.md#usage', md, '/p')).toEqual({ kind: 'file', path: '/p/README.md', anchor: 'usage' })
    expect(resolveMarkdownLink('/src/App.tsx', md, '/p')).toEqual({ kind: 'file', path: '/p/src/App.tsx', anchor: undefined })
    expect(resolveMarkdownLink('my%20file.md', md, '/p')).toMatchObject({ path: '/p/docs/my file.md' })
    expect(resolveMarkdownLink('  ', md, '/p')).toEqual({ kind: 'none' })
  })
})

describe('table navigation', () => {
  const row = '| Name | Age | City |'
  it('moves to the next / previous cell content', () => {
    expect(isTableRow(row)).toBe(true)
    expect(isTableRow('plain')).toBe(false)
    expect(adjacentCellOffset(row, 3, 1)).toBe(9) // "Age"
    expect(adjacentCellOffset(row, 10, 1)).toBe(15) // "City"
    expect(adjacentCellOffset(row, 16, 1)).toBeNull() // last cell
    expect(adjacentCellOffset(row, 16, -1)).toBe(9)
    expect(adjacentCellOffset(row, 3, -1)).toBeNull()
    expect(adjacentCellOffset('no pipes', 0, 1)).toBeNull()
  })
})

describe('image paste naming', () => {
  it('names and places pasted images beside the file', () => {
    const name = pastedImageName(new Date(2026, 8, 14, 4, 15, 30))
    expect(name).toBe('pasted-2026-09-14-041530.png')
    expect(pastedImageTarget('/p/docs/a.md', name)).toEqual({
      absPath: '/p/docs/assets/pasted-2026-09-14-041530.png',
      markdown: '![pasted-2026-09-14-041530.png](assets/pasted-2026-09-14-041530.png)'
    })
    expect(extForMime('image/jpeg')).toBe('jpg')
    expect(extForMime('image/svg+xml')).toBe('svg')
    expect(extForMime('text/plain')).toBe('png')
  })
})
