import { useEffect, useMemo, useRef } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'
import { useTabsStore } from '../../stores/tabs'
import { applyBlockRule, applyInlineRule, applyEnterRule } from './markdownInputRules'

// `breaks: true` renders a single newline as a line break (GitHub-comment /
// notes-app behavior) instead of collapsing it to a space, so consecutive lines
// like a bold label followed by its description stay on separate lines.
marked.setOptions({ gfm: true, breaks: true })

// Render GFM task-list checkboxes so they're interactive in the editable
// preview. Two things the default renderer gets wrong for our case:
//   - `disabled` — a disabled input never fires a click.
//   - inside a `contentEditable` region the browser treats a bare form control
//     as caret-placement, not activation, so clicks are swallowed. Marking the
//     input `contenteditable="false"` turns it into a non-editable atom the
//     browser will actually activate.
// A native `change` listener (below) then syncs the `checked` *attribute* so
// the toggle survives the Turndown round-trip.
marked.use({
  renderer: {
    checkbox({ checked }: { checked: boolean }): string {
      return `<input type="checkbox" contenteditable="false"${checked ? ' checked=""' : ''}> `
    }
  }
})

// HTML -> markdown serializer for the WYSIWYG edit path. Configured to match
// the flavor `marked` emits (ATX headings, fenced code, `-` bullets) so the
// round-trip stays as stable as possible.
const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '*',
  strongDelimiter: '**',
  // Serialize <br> back to a plain newline rather than Turndown's default
  // trailing-space hard break. Paired with `breaks: true` above this makes the
  // WYSIWYG round-trip stable: a soft newline renders as <br> and serializes
  // back to the same single newline, leaving the raw source unchanged.
  br: ''
})
turndown.use(gfm)

const toHtml = (markdown: string): string =>
  DOMPurify.sanitize(marked.parse(markdown, { async: false }) as string, {
    // Keep `contenteditable="false"` on task-list checkboxes (see the checkbox
    // renderer above) — DOMPurify would otherwise strip it as unexpected.
    ADD_ATTR: ['contenteditable']
  })

interface MarkdownPreviewProps {
  content: string
  /** When true the rendered output is directly editable (WYSIWYG). */
  editable?: boolean
  /** Fired (debounced) with re-serialized markdown as the user edits. */
  onChange?: (markdown: string) => void
}

/**
 * Rendered markdown preview. Parses with `marked`, then sanitizes with
 * DOMPurify before injecting (defense-in-depth — the CSP already blocks inline
 * scripts, but files from cloned repos are still untrusted).
 *
 * When `editable`, the rendered HTML is `contentEditable`: the user types on the
 * rendered output and we serialize the DOM back to markdown with Turndown,
 * emitting it through `onChange`. While editing, the DOM is the source of truth
 * — we deliberately avoid re-seeding `innerHTML` from `content` so the caret
 * doesn't jump. Non-http(s) editing is normalized markdown (WYSIWYG is lossy by
 * nature); links open in an in-app browser tab only when not editing.
 */
export default function MarkdownPreview({
  content,
  editable = false,
  onChange
}: MarkdownPreviewProps): JSX.Element {
  const bodyRef = useRef<HTMLDivElement | null>(null)
  // The last markdown we emitted, so an echoed `content` prop update doesn't
  // reset innerHTML (and the caret) mid-edit.
  const lastEmitted = useRef<string | null>(null)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Only true once the user has actually typed. Guards against a pure
  // focus→blur (no edit) re-serializing normalized markdown and spuriously
  // marking the file dirty — WYSIWYG round-tripping is lossy, so re-emitting
  // untouched content would differ from the saved baseline.
  const edited = useRef(false)

  const initialHtml = useMemo(() => toHtml(content), [])

  // Seed / re-seed innerHTML when the content changes from the outside (e.g. an
  // external reload or a fresh open), but never when it merely echoes our own
  // last emission — that would clobber the caret while typing.
  useEffect(() => {
    if (content === lastEmitted.current) return
    const el = bodyRef.current
    if (!el) return
    el.innerHTML = toHtml(content)
  }, [content])

  const emit = (): void => {
    const el = bodyRef.current
    if (!el || !onChange) return
    const markdown = turndown.turndown(el.innerHTML).trimEnd() + '\n'
    lastEmitted.current = markdown
    onChange(markdown)
  }

  // Flush a pending edit (on blur / unmount) — but never emit if the user never
  // typed, so opening the preview and clicking away leaves the file untouched.
  const flush = (): void => {
    if (debounce.current) {
      clearTimeout(debounce.current)
      debounce.current = null
    }
    if (edited.current) emit()
  }

  const scheduleEmit = (): void => {
    edited.current = true
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => {
      debounce.current = null
      emit()
    }, 200)
  }

  const onInput = (e: React.FormEvent<HTMLDivElement>): void => {
    // Skip while an IME composition is in flight — reformatting mid-compose
    // would corrupt the candidate text.
    if (!(e.nativeEvent as InputEvent).isComposing) {
      const el = bodyRef.current
      if (el) applyInlineRule(el)
    }
    scheduleEmit()
  }

  useEffect(() => {
    return () => flush()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Block-level input rules (headings / lists / blockquote) fire on Space. We
  // use a native `beforeinput` listener so we can preventDefault the space and
  // read the reliable inputType/data before the browser inserts it.
  useEffect(() => {
    const el = bodyRef.current
    if (!editable || !el) return
    const onBeforeInput = (e: InputEvent): void => {
      if (e.isComposing) return
      if (e.inputType === 'insertText' && e.data === ' ' && applyBlockRule(el)) {
        e.preventDefault()
        scheduleEmit()
      } else if (e.inputType === 'insertParagraph' && applyEnterRule(el)) {
        // Plain Enter in a paragraph → soft line break, not a paragraph split.
        e.preventDefault()
        scheduleEmit()
      }
    }
    // ⌘/Ctrl+B / +I toggle bold / italic on the selection (or the next typed
    // text). execCommand emits <b>/<i>, which Turndown serializes to **/* — the
    // same flavor `marked` re-renders. stopPropagation keeps the global ⌘B
    // sidebar toggle from also firing while the preview owns focus.
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.isComposing || e.altKey || !(e.metaKey || e.ctrlKey)) return
      const cmd = e.key === 'b' ? 'bold' : e.key === 'i' ? 'italic' : null
      if (!cmd) return
      e.preventDefault()
      e.stopPropagation()
      document.execCommand('styleWithCSS', false, 'false') // prefer <b>/<i> tags
      document.execCommand(cmd)
      scheduleEmit()
    }
    el.addEventListener('beforeinput', onBeforeInput)
    el.addEventListener('keydown', onKeyDown)
    return () => {
      el.removeEventListener('beforeinput', onBeforeInput)
      el.removeEventListener('keydown', onKeyDown)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable])

  const onClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    const anchor = (e.target as HTMLElement).closest('a')
    if (!anchor) return
    // While editing, let clicks place the caret instead of navigating away.
    if (editable) return
    e.preventDefault()
    const href = anchor.getAttribute('href') ?? ''
    if (/^https?:\/\//i.test(href)) useTabsStore.getState().newBrowserTab(href)
  }

  // Task-list checkbox toggling. The checkboxes are `contenteditable="false"`
  // atoms (see the checkbox renderer), so they toggle natively and fire a
  // `change`. We listen on `change` — it fires *after* the `checked` property
  // has settled — and sync the `checked` *attribute* to match, because only the
  // attribute survives `el.innerHTML` serialization into Turndown (which reads
  // `node.checked` to emit `[x]`/`[ ]`). Then re-serialize like any other edit.
  useEffect(() => {
    const el = bodyRef.current
    if (!editable || !el) return
    const onChange = (e: Event): void => {
      const t = e.target
      if (!(t instanceof HTMLInputElement) || t.type !== 'checkbox') return
      if (t.checked) t.setAttribute('checked', '')
      else t.removeAttribute('checked')
      scheduleEmit()
    }
    el.addEventListener('change', onChange)
    return () => el.removeEventListener('change', onChange)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable])

  return (
    <div className="h-full w-full overflow-auto bg-ink-panel" onClick={onClick}>
      <div
        ref={bodyRef}
        className="markdown-body mx-auto max-w-3xl px-10 py-8 focus:outline-none"
        contentEditable={editable}
        suppressContentEditableWarning
        spellCheck={false}
        onInput={editable ? onInput : undefined}
        onBlur={editable ? flush : undefined}
        dangerouslySetInnerHTML={{ __html: initialHtml }}
      />
    </div>
  )
}
