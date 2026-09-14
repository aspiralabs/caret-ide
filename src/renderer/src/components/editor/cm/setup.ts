import { EditorView, keymap, drawSelection, dropCursor, type KeyBinding } from '@codemirror/view'
import { EditorState, EditorSelection, Compartment, type Extension } from '@codemirror/state'
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab
} from '@codemirror/commands'
import { searchKeymap } from '@codemirror/search'
import { markdown, markdownLanguage, markdownKeymap } from '@codemirror/lang-markdown'
import { languages as codeLanguages } from '@codemirror/language-data'
import { cmTheme } from './theme'

export interface Compartments {
  theme: Compartment
  wrap: Compartment
}

export interface BuildOptions {
  compartments: Compartments
  effectiveTheme: 'light' | 'dark'
  wordWrap: boolean
  /** The live-preview decoration extension (always on in the CM6 editor). */
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

/** The app-level bindings (save / bold / italic) layered over CM's defaults. */
export function appKeymap(opts: Pick<BuildOptions, 'onSave'>): KeyBinding[] {
  return [
    {
      key: 'Mod-s',
      preventDefault: true,
      stopPropagation: true,
      run: () => (opts.onSave(), true)
    },
    {
      key: 'Mod-b',
      preventDefault: true,
      stopPropagation: true,
      run: (v) => wrapSelection(v, '**')
    },
    {
      key: 'Mod-i',
      preventDefault: true,
      stopPropagation: true,
      run: (v) => wrapSelection(v, '*')
    }
  ]
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
    // Fenced code blocks get syntax highlighting for any language CodeMirror
    // knows (lazily loaded per language on first use).
    markdown({ base: markdownLanguage, codeLanguages }),

    c.theme.of(cmTheme(opts.effectiveTheme)),
    c.wrap.of(opts.wordWrap ? EditorView.lineWrapping : []),
    opts.previewExtension,

    EditorView.updateListener.of((u) => {
      if (u.docChanged) opts.onDocChanged()
    }),

    // Our bindings take precedence over the defaults below. Cmd+P / Cmd+Shift+P
    // / Cmd+1-9 are intentionally NOT bound, so they bubble to the global
    // window handler (command palette + tab jumps). `stopPropagation` keeps
    // the handled chords from ALSO reaching that handler — otherwise ⌘B bolds
    // and toggles the sidebar, and ⌘S saves twice.
    keymap.of(appKeymap(opts)),
    keymap.of([
      ...markdownKeymap,
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap,
      indentWithTab
    ])
  ]
}
