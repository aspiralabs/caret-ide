import { describe, expect, it } from 'vitest'
import { parseGrepOutput, searchText } from './searchParse'

describe('parseGrepOutput (#19)', () => {
  it('parses path:line:col:text and makes paths absolute', () => {
    const out = 'src/a.ts:12:5:  const x = useTabsStore()\nREADME.md:1:1:# Caret\nbad line\n'
    expect(parseGrepOutput(out, '/p')).toEqual([
      { path: '/p/src/a.ts', line: 12, column: 5, text: '  const x = useTabsStore()' },
      { path: '/p/README.md', line: 1, column: 1, text: '# Caret' }
    ])
  })
  it('caps results and clips long lines', () => {
    const out = Array.from({ length: 10 }, (_, i) => `f.ts:${i + 1}:1:${'x'.repeat(400)}`).join('\n')
    const res = parseGrepOutput(out, '/p', 3)
    expect(res).toHaveLength(3)
    expect(res[0].text.length).toBe(301)
  })
  it('keeps colons inside the text', () => {
    expect(parseGrepOutput('a.ts:3:2:const t = "a:b:c"', '/p')[0].text).toBe('const t = "a:b:c"')
  })
})

describe('searchText fallback', () => {
  it('finds case-insensitive substrings with 1-based positions', () => {
    const files = [{ path: '/p/a.ts', text: 'Hello\nworld hello\n' }]
    expect(searchText(files, 'hello')).toEqual([
      { path: '/p/a.ts', line: 1, column: 1, text: 'Hello' },
      { path: '/p/a.ts', line: 2, column: 7, text: 'world hello' }
    ])
    expect(searchText(files, '')).toEqual([])
  })
})
