// Markdown "input rules" for the WYSIWYG preview (contentEditable). These make
// shorthand transform live, the way Typora / Notion / Obsidian do:
//   - block rules fire on Space:  `## ` -> <h2>, `- ` -> bullet, `1. ` -> list,
//     `> ` -> blockquote
//   - inline rules fire on the closing delimiter: **bold**, *italic*/_italic_,
//     `code`
// They mutate the DOM directly (the browser insertion is prevented for block
// rules; inline rules run just after the closing char lands). Caveat: because
// these are manual DOM edits, native ⌘Z undo of a *rule application* isn't
// tracked — undo still works for ordinary typing.

/** The top-level block element (direct child of `root`) containing `node`. */
function topBlock(root: HTMLElement, node: Node): HTMLElement | null {
  let el: Node | null = node.nodeType === Node.TEXT_NODE ? node.parentNode : node
  if (!el) return null
  while (el.parentNode && el.parentNode !== root) el = el.parentNode
  return el.parentNode === root && el instanceof HTMLElement ? el : null
}

/** Collapse the selection to the very start of `el`. */
function caretAtStart(el: HTMLElement): void {
  const range = document.createRange()
  range.setStart(el, 0)
  range.collapse(true)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
}

/** Move all children of `from` into `to` (preserving order). */
function moveChildren(from: HTMLElement, to: HTMLElement): void {
  while (from.firstChild) to.appendChild(from.firstChild)
}

/**
 * Try to apply a block rule at the caret. Returns true if it transformed the
 * block (in which case the caller should preventDefault the triggering Space).
 */
export function applyBlockRule(root: HTMLElement): boolean {
  const sel = window.getSelection()
  if (!sel || !sel.isCollapsed || sel.rangeCount === 0) return false
  const range = sel.getRangeAt(0)
  const block = topBlock(root, range.startContainer)
  if (!block) return false
  // Don't re-fire inside existing lists / code blocks.
  if (block.closest('li, pre, code')) return false

  // Text from the block start up to the caret — the pending marker.
  const pre = range.cloneRange()
  pre.selectNodeContents(block)
  pre.setEnd(range.startContainer, range.startOffset)
  const marker = pre.toString()

  let tag: string | null = null
  let list: 'ul' | 'ol' | null = null
  if (/^#{1,6}$/.test(marker)) tag = `h${marker.length}`
  else if (marker === '-' || marker === '*' || marker === '+') list = 'ul'
  else if (/^\d+\.$/.test(marker)) list = 'ol'
  else if (marker === '>') tag = 'blockquote'
  else return false

  // Strip the marker characters we just matched.
  pre.deleteContents()

  if (list) {
    const listEl = document.createElement(list)
    const li = document.createElement('li')
    moveChildren(block, li)
    listEl.appendChild(li)
    block.replaceWith(listEl)
    caretAtStart(li)
  } else if (tag) {
    const el = document.createElement(tag)
    moveChildren(block, el)
    block.replaceWith(el)
    caretAtStart(el)
  }
  return true
}

interface InlineRule {
  re: RegExp
  tag: 'strong' | 'em' | 'code'
}

// Anchored at the caret (`$`). Lookbehind keeps a single `*`/`_` from matching
// inside a half-typed `**` (e.g. `**bold*` must NOT italicize before the 2nd
// closing star arrives). `[^*\s]` forbids leading whitespace so `a * b` is left
// alone. `strong`/`code` are checked before `em`.
const INLINE_RULES: InlineRule[] = [
  { re: /\*\*([^*]+)\*\*$/, tag: 'strong' },
  { re: /__([^_]+)__$/, tag: 'strong' },
  { re: /`([^`]+)`$/, tag: 'code' },
  { re: /(?<!\*)\*([^*\s][^*]*)\*$/, tag: 'em' },
  { re: /(?<!_)_([^_\s][^_]*)_$/, tag: 'em' }
]

/**
 * Try to apply an inline rule at the caret (call after a character was typed).
 * Replaces the matched `**text**` / `*text*` / `` `text` `` run with the styled
 * element and places the caret just after it.
 */
export function applyInlineRule(root: HTMLElement): boolean {
  const sel = window.getSelection()
  if (!sel || !sel.isCollapsed || sel.rangeCount === 0) return false
  const range = sel.getRangeAt(0)
  const node = range.startContainer
  if (node.nodeType !== Node.TEXT_NODE || !root.contains(node)) return false
  // Never reformat inside a code span / code block.
  const parent = (node as Text).parentElement
  if (parent?.closest('code, pre')) return false

  const offset = range.startOffset
  const text = (node.textContent ?? '').slice(0, offset)

  for (const rule of INLINE_RULES) {
    const m = rule.re.exec(text)
    if (!m) continue
    const full = m[0]
    const inner = m[1]
    const start = offset - full.length

    const target = document.createRange()
    target.setStart(node, start)
    target.setEnd(node, offset)
    target.deleteContents()

    const el = document.createElement(rule.tag)
    el.textContent = inner
    target.insertNode(el)

    // Caret just after the new element, at the block level so further typing
    // stays outside the formatting.
    const after = document.createRange()
    after.setStartAfter(el)
    after.collapse(true)
    sel.removeAllRanges()
    sel.addRange(after)
    return true
  }
  return false
}
