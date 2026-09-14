import { describe, expect, it } from 'vitest'
import { flattenNavTree, markdownHeadings } from './symbols'

describe('markdownHeadings (#20)', () => {
  it('lists headings with levels, skipping fenced code', () => {
    const md = '# Title\n\n## Setup\n```md\n# not a heading\n```\n### Deep ###\ntext\n'
    expect(markdownHeadings(md)).toEqual([
      { name: 'Title', kind: 'heading', line: 1, depth: 0 },
      { name: 'Setup', kind: 'heading', line: 3, depth: 1 },
      { name: 'Deep', kind: 'heading', line: 7, depth: 2 }
    ])
  })
})

describe('flattenNavTree', () => {
  it('walks children depth-first, skipping the <global> module node', () => {
    const tree = {
      text: '<global>',
      kind: 'module',
      spans: [{ start: 0 }],
      childItems: [
        {
          text: 'App',
          kind: 'class',
          spans: [{ start: 10 }],
          childItems: [{ text: 'render', kind: 'method', spans: [{ start: 40 }] }]
        },
        { text: 'helper', kind: 'function', spans: [{ start: 80 }] }
      ]
    }
    const lineOf = (o: number): number => Math.floor(o / 10) + 1
    expect(flattenNavTree(tree, lineOf)).toEqual([
      { name: 'App', kind: 'class', line: 2, depth: 0 },
      { name: 'render', kind: 'method', line: 5, depth: 1 },
      { name: 'helper', kind: 'function', line: 9, depth: 0 }
    ])
    expect(flattenNavTree(null, lineOf)).toEqual([])
  })
})
