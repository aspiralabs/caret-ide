import { EditorView } from '@codemirror/view'
import { syntaxHighlighting } from '@codemirror/language'
import type { Extension } from '@codemirror/state'
import { inkHighlightStyle } from './highlight'

// CodeMirror runs inside the app DOM, so referencing `rgb(var(--ink-*))` lets
// the editor track the same light/dark palette as everything else. We still
// rebuild on theme change so CM's internal `dark` flag (selection-layer
// contrast) updates. No gutter / line numbers — Obsidian-style clean surface.
const baseTheme = (dark: boolean): Extension =>
  EditorView.theme(
    {
      '&': {
        height: '100%',
        color: 'rgb(var(--ink-text))',
        backgroundColor: 'rgb(var(--ink-panel))',
        fontSize: '14px'
      },
      '.cm-scroller': {
        fontFamily:
          'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        lineHeight: '1.7',
        overflow: 'auto'
      },
      '.cm-content': {
        caretColor: 'rgb(var(--ink-accent))',
        maxWidth: '48rem',
        margin: '0 auto',
        padding: '2rem 2.5rem 40vh'
      },
      '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'rgb(var(--ink-accent))' },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
        backgroundColor: 'rgb(var(--ink-active))'
      },
      '.cm-activeLine': { backgroundColor: 'transparent' },
      '&.cm-focused': { outline: 'none' },

      // Inline code + fenced code blocks (monospace + subtle background).
      '.cm-content code, .tok-monospace': {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace'
      },

      // Heading line sizes (applied via Decoration.line in livePreview.ts).
      '.cm-h1': { fontSize: '1.8em', fontWeight: '700', lineHeight: '1.3' },
      '.cm-h2': { fontSize: '1.5em', fontWeight: '700', lineHeight: '1.3' },
      '.cm-h3': { fontSize: '1.3em', fontWeight: '600', lineHeight: '1.3' },
      '.cm-h4': { fontSize: '1.15em', fontWeight: '600' },
      '.cm-h5': { fontSize: '1.05em', fontWeight: '600' },
      '.cm-h6': { fontSize: '1em', fontWeight: '600', color: 'rgb(var(--ink-muted))' },

      '.cm-blockquote': {
        borderLeft: '3px solid rgb(var(--ink-border))',
        paddingLeft: '0.75rem',
        color: 'rgb(var(--ink-muted))'
      },

      // Fenced code: a full-width monospace band with normal (not inline-code
      // pink) text. `cm-code-block` is a line decoration from livePreview.ts.
      '.cm-code-block': {
        backgroundColor: 'rgb(var(--ink-elevated))',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: '0.88em'
      },
      '.cm-code-block span': { color: 'rgb(var(--ink-text))' },

      // Rich-widget styling (checkboxes, links, images, tables) rendered by
      // livePreview.ts widgets.
      '.cm-md-checkbox': {
        marginRight: '0.4rem',
        verticalAlign: 'middle',
        cursor: 'pointer',
        accentColor: 'rgb(var(--ink-accent))'
      },
      '.cm-md-link': { color: 'rgb(var(--ink-accent))', cursor: 'pointer', textDecoration: 'none' },
      '.cm-md-link:hover': { textDecoration: 'underline' },
      '.cm-md-image': {
        display: 'inline-block',
        maxWidth: '100%',
        maxHeight: '480px',
        borderRadius: '6px',
        verticalAlign: 'top',
        margin: '0.25rem 0'
      },
      '.cm-md-table': {
        borderCollapse: 'collapse',
        margin: '0.25rem 0',
        fontSize: '0.95em'
      },
      '.cm-md-table th, .cm-md-table td': {
        border: '1px solid rgb(var(--ink-border))',
        padding: '0.3rem 0.6rem',
        textAlign: 'left'
      },
      '.cm-md-table th': { backgroundColor: 'rgb(var(--ink-hover))', fontWeight: '600' },

      // Native scrollbar sizing to match the rest of the app (index.css).
      '.cm-scroller::-webkit-scrollbar': { width: '10px', height: '10px' },
      '.cm-scroller::-webkit-scrollbar-thumb': {
        backgroundColor: 'rgb(var(--ink-border))',
        borderRadius: '5px'
      },
      '.cm-scroller::-webkit-scrollbar-thumb:hover': {
        backgroundColor: 'rgb(var(--ink-muted))'
      }
    },
    { dark }
  )

/** Full theming extension: editor chrome + syntax highlighting. */
export function cmTheme(effective: 'light' | 'dark'): Extension {
  return [baseTheme(effective === 'dark'), syntaxHighlighting(inkHighlightStyle)]
}
