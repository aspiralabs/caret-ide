import { useEffect, useRef, useState, type RefObject } from 'react'
import type { SearchAddon } from '@xterm/addon-search'
import { X } from 'lucide-react'

/** Find bar for a terminal's scrollback (⌘F with the terminal focused). */
export default function TerminalSearchBar({
  search,
  onClose
}: {
  search: RefObject<SearchAddon | null>
  onClose: () => void
}): JSX.Element {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    inputRef.current?.focus()
    return () => search.current?.clearDecorations()
  }, [search])

  const find = (next: boolean, q = query): void => {
    if (!q) {
      search.current?.clearDecorations()
      return
    }
    const opts = { decorations: { matchOverviewRuler: '#ffb454', activeMatchColorOverviewRuler: '#ffb454', matchBackground: '#7a5d1a', activeMatchBackground: '#c48a1f' } }
    if (next) search.current?.findNext(q, opts)
    else search.current?.findPrevious(q, opts)
  }

  return (
    <div className="absolute right-3 top-2 z-30 flex items-center gap-1 rounded-lg border border-ink-border bg-ink-elevated/95 p-1 shadow-lg backdrop-blur">
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          find(true, e.target.value)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') find(!e.shiftKey)
          else if (e.key === 'Escape') onClose()
        }}
        placeholder="Find in terminal"
        spellCheck={false}
        className="h-6 w-48 rounded border border-ink-border bg-ink-bg px-2 text-xs text-ink-text placeholder:text-ink-muted focus:border-ink-accent focus:outline-none"
      />
      <button className="h-6 rounded px-1.5 text-xs text-ink-muted hover:bg-ink-hover hover:text-ink-text" onClick={() => find(false)} title="Previous (⇧↵)">↑</button>
      <button className="h-6 rounded px-1.5 text-xs text-ink-muted hover:bg-ink-hover hover:text-ink-text" onClick={() => find(true)} title="Next (↵)">↓</button>
      <button aria-label="Close find" className="h-6 rounded px-1 text-ink-muted hover:bg-ink-hover hover:text-ink-text" onClick={onClose}>
        <X size={12} />
      </button>
    </div>
  )
}
