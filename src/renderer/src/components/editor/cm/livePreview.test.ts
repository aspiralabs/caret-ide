// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { EditorState, EditorSelection } from '@codemirror/state'
import { ensureSyntaxTree } from '@codemirror/language'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { buildDecorations, type LivePreviewContext } from './livePreview'

const ctx: LivePreviewContext = { resolveAsset: async () => null, openLink: () => {} }

/** Ranges hidden by `replace` decorations, as [from, to] pairs. */
function hidden(doc: string, caret: number): Array<[number, number]> {
  const state = EditorState.create({
    doc,
    selection: EditorSelection.single(caret),
    extensions: [markdown({ base: markdownLanguage })]
  })
  ensureSyntaxTree(state, doc.length, 5000)
  const out: Array<[number, number]> = []
  buildDecorations(state, ctx).between(0, doc.length, (from, to, deco) => {
    // `replace` decorations without a widget are the hide markers.
    if (deco.spec.widget === undefined && from !== to) out.push([from, to])
  })
  return out
}

describe('live preview: blockquotes (IDEAS bug 1)', () => {
  const doc = '> Hello **bold** and `code`\n>\n> second\n\nplain **b**\n'

  it('hides the > markers (and their space) plus inline markers when the caret is elsewhere', () => {
    const h = hidden(doc, doc.length - 1)
    // "> " on line 1, ">" on line 2, "> " on line 3
    expect(h).toContainEqual([0, 2])
    expect(h).toContainEqual([28, 29])
    expect(h).toContainEqual([30, 32])
    // **bold** markers and `code` marks inside the quote
    expect(h).toContainEqual([8, 10])
    expect(h).toContainEqual([14, 16])
    expect(h).toContainEqual([21, 22])
    expect(h).toContainEqual([26, 27])
  })

  it('reveals the > marker on the caret line only', () => {
    const h = hidden(doc, 4) // caret inside "Hello"
    expect(h).not.toContainEqual([0, 2])
    expect(h).toContainEqual([28, 29])
    expect(h).toContainEqual([30, 32])
  })
})
