import { syntaxTree } from '@codemirror/language'
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view'
import { StateField, type EditorState, type Extension, type Range } from '@codemirror/state'

// Obsidian-style live preview: the document stays pure markdown; we paint
// decorations over the Lezer syntax tree to render it. Decorations are provided
// from a StateField (not a ViewPlugin) because rendered tables are *block*
// widgets, which plugins may not supply. Everything is rebuilt on doc or
// selection change; markers/widgets are hidden UNLESS the cursor is on that line
// (the whole-line reveal rule), so you edit raw markdown by moving the caret in.

/** Host-provided hooks: asset resolution (for images) and link opening. */
export interface LivePreviewContext {
  /** Resolve an image src to a loadable URL (http(s)/data pass through; local → data URL), or null. */
  resolveAsset: (src: string) => Promise<string | null>
  /** Open a link target (only http(s) actually navigates; see MarkdownEditor). */
  openLink: (href: string) => void
}

const HEADING_RE = /^ATXHeading([1-6])$/
const MARKER_NODES = new Set(['EmphasisMark', 'CodeMark', 'StrikethroughMark'])

class CheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly from: number,
    readonly to: number
  ) {
    super()
  }
  eq(o: CheckboxWidget): boolean {
    return o.checked === this.checked && o.from === this.from && o.to === this.to
  }
  toDOM(view: EditorView): HTMLElement {
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.checked = this.checked
    box.className = 'cm-md-checkbox'
    box.setAttribute('contenteditable', 'false')
    box.addEventListener('mousedown', (e) => e.preventDefault())
    box.addEventListener('click', () => {
      view.dispatch({
        changes: { from: this.from, to: this.to, insert: this.checked ? '[ ]' : '[x]' }
      })
    })
    return box
  }
  ignoreEvent(): boolean {
    return true
  }
}

class LinkWidget extends WidgetType {
  constructor(
    readonly text: string,
    readonly href: string,
    readonly open: (href: string) => void
  ) {
    super()
  }
  eq(o: LinkWidget): boolean {
    return o.text === this.text && o.href === this.href
  }
  toDOM(): HTMLElement {
    const a = document.createElement('span')
    a.textContent = this.text
    a.title = this.href
    a.className = 'cm-md-link'
    a.setAttribute('contenteditable', 'false')
    a.addEventListener('mousedown', (e) => e.preventDefault())
    a.addEventListener('click', () => this.open(this.href))
    return a
  }
  ignoreEvent(): boolean {
    return true
  }
}

class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
    readonly resolve: (src: string) => Promise<string | null>
  ) {
    super()
  }
  eq(o: ImageWidget): boolean {
    return o.src === this.src && o.alt === this.alt
  }
  toDOM(): HTMLElement {
    const img = document.createElement('img')
    img.className = 'cm-md-image'
    img.alt = this.alt
    img.setAttribute('contenteditable', 'false')
    void this.resolve(this.src).then((url) => {
      if (url) img.src = url
    })
    return img
  }
  ignoreEvent(): boolean {
    return false
  }
}

class TableWidget extends WidgetType {
  constructor(readonly raw: string) {
    super()
  }
  eq(o: TableWidget): boolean {
    return o.raw === this.raw
  }
  toDOM(): HTMLElement {
    const wrap = document.createElement('div')
    wrap.setAttribute('contenteditable', 'false')
    const table = document.createElement('table')
    table.className = 'cm-md-table'
    const cellsOf = (line: string): string[] => {
      let s = line.trim()
      if (s.startsWith('|')) s = s.slice(1)
      if (s.endsWith('|')) s = s.slice(0, -1)
      return s.split('|').map((c) => c.trim())
    }
    const rows = this.raw.split('\n').filter((l) => l.trim().length > 0)
    const thead = table.createTHead()
    const tbody = table.createTBody()
    rows.forEach((line, i) => {
      if (i === 1) return // the |---|---| delimiter row
      const tr = document.createElement('tr')
      for (const cell of cellsOf(line)) {
        const el = document.createElement(i === 0 ? 'th' : 'td')
        el.textContent = cell
        tr.appendChild(el)
      }
      ;(i === 0 ? thead : tbody).appendChild(tr)
    })
    wrap.appendChild(table)
    return wrap
  }
  ignoreEvent(): boolean {
    return false
  }
}

function buildDecorations(state: EditorState, ctx: LivePreviewContext): DecorationSet {
  const decos: Range<Decoration>[] = []

  const activeLines = new Set<number>()
  for (const r of state.selection.ranges) {
    const first = state.doc.lineAt(r.from).number
    const last = state.doc.lineAt(r.to).number
    for (let n = first; n <= last; n++) activeLines.add(n)
  }
  const lineActive = (pos: number): boolean => activeLines.has(state.doc.lineAt(pos).number)
  const rangeActive = (from: number, to: number): boolean => {
    const first = state.doc.lineAt(from).number
    const last = state.doc.lineAt(to).number
    for (let n = first; n <= last; n++) if (activeLines.has(n)) return true
    return false
  }
  // Node-precise reveal: does any selection range touch [from, to] (inclusive of
  // the edges, so a caret resting just after a bold run still reveals it to edit)?
  const nodeActive = (from: number, to: number): boolean =>
    state.selection.ranges.some((r) => r.from <= to && r.to >= from)

  syntaxTree(state).iterate({
    enter: (node) => {
      const name = node.name

      const heading = HEADING_RE.exec(name)
      if (heading) {
        const line = state.doc.lineAt(node.from)
        decos.push(Decoration.line({ class: `cm-h${heading[1]}` }).range(line.from))
        return
      }
      if (name === 'SetextHeading1' || name === 'SetextHeading2') {
        const line = state.doc.lineAt(node.from)
        decos.push(
          Decoration.line({ class: name === 'SetextHeading1' ? 'cm-h1' : 'cm-h2' }).range(line.from)
        )
        return
      }

      if (name === 'Blockquote') {
        let pos = node.from
        while (pos <= node.to) {
          const line = state.doc.lineAt(pos)
          decos.push(Decoration.line({ class: 'cm-blockquote' }).range(line.from))
          if (line.to + 1 > node.to) break
          pos = line.to + 1
        }
        return
      }

      // Rendered table (block widget) when the cursor is outside it.
      if (name === 'Table') {
        if (rangeActive(node.from, node.to)) return false
        const start = state.doc.lineAt(node.from).from
        const end = state.doc.lineAt(node.to).to
        decos.push(
          Decoration.replace({
            widget: new TableWidget(state.sliceDoc(start, end)),
            block: true
          }).range(start, end)
        )
        return false // don't descend into cells
      }

      // Inline image → rendered <img> unless the caret is within it.
      if (name === 'Image') {
        if (nodeActive(node.from, node.to)) return false
        const m = /^!\[([^\]]*)\]\(\s*(<[^>]*>|[^)\s]*)/.exec(state.sliceDoc(node.from, node.to))
        if (m) {
          const src = m[2].replace(/^<|>$/g, '')
          decos.push(
            Decoration.replace({ widget: new ImageWidget(src, m[1], ctx.resolveAsset) }).range(
              node.from,
              node.to
            )
          )
        }
        return false
      }

      // Inline link → clickable text unless the caret is within it.
      if (name === 'Link') {
        if (nodeActive(node.from, node.to)) return false
        const m = /^\[([^\]]*)\]\(\s*(<[^>]*>|[^)\s]*)/.exec(state.sliceDoc(node.from, node.to))
        if (m) {
          const href = m[2].replace(/^<|>$/g, '')
          decos.push(
            Decoration.replace({ widget: new LinkWidget(m[1], href, ctx.openLink) }).range(
              node.from,
              node.to
            )
          )
        }
        return false
      }

      // GFM task checkbox.
      if (name === 'TaskMarker') {
        if (lineActive(node.from)) return
        const checked = /[xX]/.test(state.sliceDoc(node.from, node.to))
        decos.push(
          Decoration.replace({ widget: new CheckboxWidget(checked, node.from, node.to) }).range(
            node.from,
            node.to
          )
        )
        return
      }

      // Heading `#` markers reveal on the whole heading line (a heading *is* the
      // line, so line-based reveal is what you want when editing it).
      if (name === 'HeaderMark') {
        if (lineActive(node.from)) return
        let end = node.to
        while (end < state.doc.length && state.doc.sliceString(end, end + 1) === ' ') end++
        if (end > node.from) decos.push(Decoration.replace({}).range(node.from, end))
        return
      }

      // Inline formatting markers (**, *, `, ~~) reveal only when the caret is
      // within their formatting node — not merely somewhere else on the line.
      if (MARKER_NODES.has(name)) {
        const parent = node.node.parent
        const from = parent ? parent.from : node.from
        const to = parent ? parent.to : node.to
        if (nodeActive(from, to)) return
        if (node.to > node.from) decos.push(Decoration.replace({}).range(node.from, node.to))
      }
      return
    }
  })

  return Decoration.set(decos, true)
}

/** Build the live-preview decoration extension bound to a host context. */
export function livePreview(ctx: LivePreviewContext): Extension {
  return StateField.define<DecorationSet>({
    create: (state) => buildDecorations(state, ctx),
    update: (deco, tr) =>
      tr.docChanged || tr.selection ? buildDecorations(tr.state, ctx) : deco.map(tr.changes),
    provide: (f) => EditorView.decorations.from(f)
  })
}
