import { HighlightStyle } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

// Maps Lezer markdown highlight tags to styles. Colors are `rgb(var(--ink-*))`
// so they resolve against the cascade and flip automatically with `.theme-light`
// (no need to rebuild the style on theme change). Heading *sizing* can't live
// here — HighlightStyle is token-level, not line-level — so it's done with line
// decorations in livePreview.ts. This just handles weight / style / color.
export const inkHighlightStyle = HighlightStyle.define([
  { tag: t.heading, fontWeight: '600', color: 'rgb(var(--ink-text))' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.monospace, color: 'var(--code-inline)' },
  { tag: [t.link, t.url], color: 'rgb(var(--ink-accent))' },
  { tag: t.quote, color: 'rgb(var(--ink-muted))' },
  // The literal markers (#, *, `, >, -) when they *are* shown (Source mode, or
  // the active line in Live Preview) — dimmed so content reads first.
  { tag: [t.processingInstruction, t.contentSeparator], color: 'rgb(var(--ink-muted))' },
  { tag: t.list, color: 'rgb(var(--ink-muted))' }
])
