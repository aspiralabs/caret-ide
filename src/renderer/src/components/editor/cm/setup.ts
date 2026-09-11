import { EditorView, keymap, drawSelection, dropCursor } from '@codemirror/view'
import { EditorState, EditorSelection, Compartment, type Extension } from '@codemirror/state'
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab
} from '@codemirror/commands'
import { searchKeymap } from '@codemirror/search'
import { markdown, markdownLanguage, markdownKeymap } from '@codemirror/lang-markdown'
import { cmTheme } from './theme'

export interface Compartments {
  theme: Compartment
  wrap: Compartment
  live: Compartment
}

export interface BuildOptions {
  compartments: Compartments
  effectiveTheme: 'light' | 'dark'
  wordWrap: boolean
  /** Extension placed in the `live` compartment (livePreview decorations, or [] for Source mode). */
  previewExtension: Extension
  onSave: () => void
  onDocChanged: () => void
}

/** Wrap each selection range in `marker` (e.g. `**`), or insert an empty pair at the caret. */
function wrapSelection(view: EditorView, marker: string): boolean {
  const { state } = view
  const len = marker.length
  const changes = state.changeByRange((range) => {
    const text = state.sliceDoc(range.from, range.to)
    return {
      changes: { from: range.from, to: range.to, insert: marker + text + marker },
      // Empty selection → caret between the markers; otherwise keep the inner
      // text selected (shifted past the opening marker).
      range: EditorSelection.range(range.from + len, range.to + len)
    }
  })
  view.dispatch(state.update(changes, { scrollIntoView: true, userEvent: 'input' }))
  return true
}

/** Assemble the full CM6 extension set for a markdown document. */
export function buildExtensions(opts: BuildOptions): Extension {
  const { compartments: c } = opts
  return [
    history(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    EditorView.contentAttributes.of({ spellcheck: 'false' }),
    markdown({ base: markdownLanguage, codeLanguages: [] }),

    c.theme.of(cmTheme(opts.effectiveTheme)),
    c.wrap.of(opts.wordWrap ? EditorView.lineWrapping : []),
    c.live.of(opts.previewExtension),

    EditorView.updateListener.of((u) => {
      if (u.docChanged) opts.onDocChanged()
    }),

    // Our bindings take precedence over the defaults below. Cmd+P / Cmd+Shift+P
    // / Cmd+1-9 are intentionally NOT bound, so they bubble to the global
    // window handler (command palette + tab jumps).
    keymap.of([
      { key: 'Mod-s', preventDefault: true, run: () => (opts.onSave(), true) },
      { key: 'Mod-b', preventDefault: true, run: (v) => wrapSelection(v, '**') },
      { key: 'Mod-i', preventDefault: true, run: (v) => wrapSelection(v, '*') }
    ]),
    keymap.of([
      ...markdownKeymap,
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap,
      indentWithTab
    ])
  ]
}
