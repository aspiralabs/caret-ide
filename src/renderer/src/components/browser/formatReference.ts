import type { PickedElement } from '@shared/types'

// ---------------------------------------------------------------------------
// Format a picked DOM element into a reference for a Claude Code session.
//
// We send it as a BRACKETED PASTE (see `asBracketedPaste`): Claude Code collapses
// a multi-line paste into a compact chip in its input (like `[Pasted text #1]` /
// `[Image #1]`) while keeping the full text for the model. That lets the on-wire
// reference be rich and multi-line without submitting the prompt on newlines.
// ---------------------------------------------------------------------------

// Per-session pick counter, so markers read [button #1], [div #2], … like
// Claude Code's own [Image #1]. Module-level so it survives component remounts.
let pickCount = 0

/**
 * Shorten an absolute source path to something repo-relative-ish and readable:
 * the tail from the last `/src/` segment (which Claude can still resolve), else
 * the basename.
 */
function shortenPath(fileName: string): string {
  const i = fileName.lastIndexOf('/src/')
  if (i !== -1) return fileName.slice(i + 1) // -> "src/components/Nav.tsx"
  return fileName.split('/').pop() || fileName
}

/**
 * Our own visible marker: leads with the element tag + a running number, and
 * folds in the source `path:line` when React exposed it (dev builds), e.g.
 * `[button #1 · src/components/Nav.tsx:42]`. Falls back to `[button #1]`.
 */
export function nextRefMarker(el: PickedElement): string {
  pickCount += 1
  if (el.source) {
    return `[${el.tag} #${pickCount} · ${shortenPath(el.source.fileName)}:${el.source.lineNumber}]`
  }
  return `[${el.tag} #${pickCount}]`
}

/** The human/model-readable reference body (multi-line). */
export function formatReference(el: PickedElement): string {
  const idPart = el.id ? '#' + el.id : ''
  const classPart = el.classes.slice(0, 4).map((c) => '.' + c).join('')
  const descriptor = `<${el.tag}${idPart}${classPart}>`

  const lines: string[] = ['Browser element reference:']
  if (el.source) {
    const col = el.source.columnNumber != null ? ':' + el.source.columnNumber : ''
    lines.push(`- Source: ${el.source.fileName}:${el.source.lineNumber}${col}`)
  }
  if (el.componentName) lines.push(`- Component: <${el.componentName}>`)
  lines.push(`- Element: ${descriptor}`)
  if (el.text) lines.push(`- Text: "${el.text}"`)
  lines.push(`- Selector: ${el.selector}`)
  lines.push(`- URL: ${el.url}`)

  return lines.join('\n')
}

// Bracketed-paste control sequences (terminal DECSET 2004). Claude Code enables
// bracketed paste at its prompt, so wrapping our text in these makes it arrive
// as a single paste and get condensed into a chip.
const PASTE_START = '[200~'
const PASTE_END = '[201~'

/** Wrap text so a terminal app (Claude Code) treats it as one pasted block. */
export function asBracketedPaste(text: string): string {
  return PASTE_START + text + PASTE_END
}
