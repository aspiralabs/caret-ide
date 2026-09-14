import type * as monaco from 'monaco-editor'
import type { AppSettings } from '@shared/types'

/**
 * The user-tunable slice of Monaco options, derived from settings. Shared by
 * the file editor, the settings.json editor and the diff view so they all
 * respond to the same toggles.
 */
export function monacoOptionsFromSettings(
  s: Pick<AppSettings, 'wordWrap' | 'editorFontSize' | 'editorMinimap' | 'editorBracketPairs' | 'editorStickyScroll'>
): monaco.editor.IEditorOptions & monaco.editor.IGlobalEditorOptions {
  return {
    wordWrap: s.wordWrap ? 'on' : 'off',
    fontSize: s.editorFontSize,
    minimap: { enabled: s.editorMinimap },
    bracketPairColorization: { enabled: s.editorBracketPairs },
    stickyScroll: { enabled: s.editorStickyScroll },
    // Multi-cursor (⌥-click / ⌘D) and column select (⇧⌥-drag) come free with Monaco.
    columnSelection: false,
    multiCursorModifier: 'alt'
  }
}
