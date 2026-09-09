// ---------------------------------------------------------------------------
// Element picker injected into a browser-preview page via executeJavaScript.
//
// `caretPicker()` is stringified (`.toString()`) and evaluated IN THE PAGE'S
// MAIN WORLD, so it can read React fiber expandos (`__reactFiber$…`) that an
// isolated-world preload could never see. It returns a Promise that resolves
// with the picked element's descriptor (a plain, structured-clone-safe object
// matching `PickedElement`) when the user clicks, or `null` on Escape / cancel.
//
// Because executeJavaScript awaits a returned thenable and serializes the
// resolved value back across IPC, no separate return channel (console hack /
// extra preload) is needed — the pick is just the promise's result.
// ---------------------------------------------------------------------------

/**
 * Runs in the page. Kept fully self-contained (all helpers nested) because only
 * the function body survives `.toString()` — it can close over nothing here.
 */
function caretPicker(): Promise<unknown> {
  // Tear down any previous picker session (double-click of the toolbar button).
  const prev = (window as unknown as { __caretPickerCancel?: () => void })
    .__caretPickerCancel
  if (prev) prev()

  const MAX_TEXT = 140
  const MAX_TAG = 300
  const ATTR_ALLOW = [
    'role',
    'type',
    'name',
    'href',
    'src',
    'alt',
    'title',
    'placeholder',
    'value',
    'aria-label',
    'data-testid',
    'data-test',
    'data-cy'
  ]

  return new Promise((resolve) => {
    // --- Overlay chrome: a highlight box + an info chip, both click-through. ---
    const box = document.createElement('div')
    box.style.cssText =
      'position:fixed;z-index:2147483646;pointer-events:none;border:2px solid #228df2;' +
      'background:rgba(34,141,242,0.12);border-radius:2px;transition:all 40ms ease-out;'

    const chip = document.createElement('div')
    chip.style.cssText =
      'position:fixed;z-index:2147483647;pointer-events:none;font:11px/1.4 ui-monospace,' +
      'SFMono-Regular,Menlo,monospace;color:#fff;background:#228df2;padding:2px 6px;' +
      'border-radius:3px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.4);'

    const cursorStyle = document.createElement('style')
    cursorStyle.textContent = '*{cursor:crosshair !important;}'

    document.documentElement.appendChild(box)
    document.documentElement.appendChild(chip)
    document.head.appendChild(cursorStyle)

    let current: Element | null = null

    function cleanup(): void {
      window.removeEventListener('mousemove', onMove, true)
      window.removeEventListener('click', onClick, true)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('scroll', onScroll, true)
      box.remove()
      chip.remove()
      cursorStyle.remove()
      delete (window as unknown as { __caretPickerCancel?: () => void }).__caretPickerCancel
    }

    // Element under the pointer, ignoring our own click-through overlay nodes.
    function elementAt(x: number, y: number): Element | null {
      const el = document.elementFromPoint(x, y)
      if (!el || el === box || el === chip) return null
      return el
    }

    function paint(el: Element): void {
      const r = el.getBoundingClientRect()
      box.style.left = r.left + 'px'
      box.style.top = r.top + 'px'
      box.style.width = r.width + 'px'
      box.style.height = r.height + 'px'

      const info = reactInfo(el)
      const tag = el.tagName.toLowerCase()
      const id = (el as HTMLElement).id ? '#' + (el as HTMLElement).id : ''
      const label =
        (info && info.componentName ? '<' + info.componentName + '> ' : '') +
        tag +
        id +
        '  ' +
        Math.round(r.width) +
        '×' +
        Math.round(r.height)
      chip.textContent = label

      // Prefer placing the chip just above the box; flip below if clipped at top.
      const top = r.top - 22 < 0 ? r.bottom + 4 : r.top - 22
      chip.style.top = Math.max(0, top) + 'px'
      chip.style.left = Math.max(0, r.left) + 'px'
    }

    // --- React fiber → component name + source (dev-build _debugSource). ---
    function getFiber(node: Element): Record<string, unknown> | null {
      const key = Object.keys(node).find(
        (k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')
      )
      return key
        ? ((node as unknown as Record<string, unknown>)[key] as Record<string, unknown>)
        : null
    }

    function reactInfo(
      node: Element
    ): { componentName?: string; source?: unknown } | null {
      let fiber = getFiber(node)
      if (!fiber) return null
      let componentName: string | undefined
      let source: unknown
      let f: Record<string, unknown> | null = fiber
      let guard = 0
      while (f && guard++ < 200) {
        if (!source && f._debugSource) source = f._debugSource
        if (!componentName) {
          const t = (f.type || f.elementType) as
            | { displayName?: string; name?: string }
            | string
            | undefined
          if (t && typeof t !== 'string') {
            const n = t.displayName || t.name || undefined
            // Ignore minified names. Production bundles mangle components to
            // 1–2 chars (e.g. `y`, `Xr`); only surface human-meaningful
            // PascalCase names so the chip/reference isn't noise like "<y>".
            if (n && /^[A-Z][A-Za-z0-9.]{2,}$/.test(n)) componentName = n
          }
        }
        if (source && componentName) break
        f = (f.return as Record<string, unknown>) || null
      }
      return { componentName, source }
    }

    // --- Stable-ish CSS selector path (id short-circuits; else nth-of-type). ---
    function cssPath(el: Element): string {
      const parts: string[] = []
      let node: Element | null = el
      let depth = 0
      while (node && node.nodeType === 1 && depth++ < 8) {
        const tag = node.tagName.toLowerCase()
        const id = (node as HTMLElement).id
        if (id && document.querySelectorAll('#' + CSS.escape(id)).length === 1) {
          parts.unshift('#' + CSS.escape(id))
          break
        }
        let seg = tag
        const parent: Element | null = node.parentElement
        if (parent) {
          const sameTag = Array.from(parent.children).filter(
            (c) => c.tagName === node!.tagName
          )
          if (sameTag.length > 1) {
            seg += ':nth-of-type(' + (sameTag.indexOf(node) + 1) + ')'
          }
        }
        parts.unshift(seg)
        node = parent
      }
      return parts.join(' > ')
    }

    function collectAttrs(el: Element): Record<string, string> {
      const out: Record<string, string> = {}
      for (const attr of Array.from(el.attributes)) {
        if (ATTR_ALLOW.includes(attr.name) || attr.name.startsWith('data-test')) {
          out[attr.name] = attr.value.slice(0, 120)
        }
      }
      return out
    }

    function describe(el: Element): unknown {
      const r = el.getBoundingClientRect()
      const info = reactInfo(el)
      const src = info && info.source ? (info.source as Record<string, number>) : null
      const classes =
        typeof (el as HTMLElement).className === 'string'
          ? (el as HTMLElement).className.split(/\s+/).filter(Boolean)
          : []
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT)
      const openingTag = (el.cloneNode(false) as Element).outerHTML.slice(0, MAX_TAG)

      return {
        framework: getFiber(el) ? 'react' : 'dom',
        tag: el.tagName.toLowerCase(),
        id: (el as HTMLElement).id || undefined,
        classes,
        selector: cssPath(el),
        text: text || undefined,
        attributes: collectAttrs(el),
        openingTag,
        rect: {
          x: Math.round(r.left),
          y: Math.round(r.top),
          width: Math.round(r.width),
          height: Math.round(r.height)
        },
        componentName: info && info.componentName ? info.componentName : undefined,
        source: src
          ? {
              fileName: String(src.fileName),
              lineNumber: Number(src.lineNumber),
              columnNumber:
                src.columnNumber != null ? Number(src.columnNumber) : undefined
            }
          : undefined,
        url: location.href
      }
    }

    function onMove(e: MouseEvent): void {
      const el = elementAt(e.clientX, e.clientY)
      if (!el || el === current) return
      current = el
      paint(el)
    }

    function onScroll(): void {
      if (current) paint(current)
    }

    function onClick(e: MouseEvent): void {
      e.preventDefault()
      e.stopPropagation()
      const el = elementAt(e.clientX, e.clientY) || current
      const payload = el ? describe(el) : null
      cleanup()
      resolve(payload)
    }

    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        cleanup()
        resolve(null)
      }
    }

    ;(window as unknown as { __caretPickerCancel?: () => void }).__caretPickerCancel = () => {
      cleanup()
      resolve(null)
    }

    window.addEventListener('mousemove', onMove, true)
    window.addEventListener('click', onClick, true)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('scroll', onScroll, true)
  })
}

/** The injectable source: an IIFE that returns the picker's promise. */
export const PICKER_SOURCE = `(${caretPicker.toString()})()`

/** A snippet that cancels an in-flight picker session (toolbar toggle-off). */
export const PICKER_CANCEL_SOURCE = `window.__caretPickerCancel && window.__caretPickerCancel()`
