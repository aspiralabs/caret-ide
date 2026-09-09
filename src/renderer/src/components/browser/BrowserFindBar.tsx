import { useEffect, useRef, useState } from 'react'
import { useBrowserFindStore } from '../../stores/browserFind'
import Tooltip from '../Tooltip'

// ---------------------------------------------------------------------------
// BrowserFindBar — the ⌘F "find in page" bar for the active browser tab.
//
// Rendered as a docked strip ABOVE the WebContentsView placeholder (not floating
// over it): the native Chromium view always paints on top of our DOM, so an
// overlay would be hidden behind the page. Docking it in the flex column shrinks
// the viewport, and main repositions the view just below the bar.
//
// Search itself runs in main via Electron's findInPage; match counts arrive back
// through `onFound`. The bar owns its query text and the latest count locally.
// ---------------------------------------------------------------------------

const btn =
  'flex h-6 w-6 shrink-0 items-center justify-center rounded text-ink-muted ' +
  'hover:bg-ink-hover hover:text-ink-text disabled:cursor-default disabled:opacity-30 ' +
  'disabled:hover:bg-transparent disabled:hover:text-ink-muted'

interface Matches {
  active: number
  total: number
}

export default function BrowserFindBar({ tabId }: { tabId: string }): JSX.Element | null {
  const open = useBrowserFindStore((s) => s.openTabId === tabId)
  const closeStore = useBrowserFindStore((s) => s.close)
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<Matches | null>(null)

  // Push a search to main. `findNext` distinguishes navigating an existing
  // search (Enter / arrows) from restarting it after the query text changes.
  const search = (text: string, findNext: boolean, forward = true): void => {
    if (!text) {
      window.ide.browser.stopFind(tabId, 'clearSelection')
      setMatches(null)
      return
    }
    window.ide.browser.find(tabId, text, { findNext, forward })
  }

  const close = (): void => {
    window.ide.browser.stopFind(tabId, 'clearSelection')
    setQuery('')
    setMatches(null)
    closeStore()
  }

  // On open (including a re-open while already visible), focus + select so the
  // user can type or overwrite the previous query immediately.
  useEffect(() => {
    if (!open) return
    const el = inputRef.current
    if (!el) return
    el.focus()
    el.select()
    if (query) search(query, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Match counts stream back from main; only heed those for this tab.
  useEffect(() => {
    if (!open) return
    return window.ide.browser.onFound((e) => {
      if (e.tabId !== tabId) return
      setMatches({ active: e.activeMatchOrdinal, total: e.matches })
    })
  }, [open, tabId])

  if (!open) return null

  const onChange = (text: string): void => {
    setQuery(text)
    search(text, false)
  }

  const label = query ? (matches ? `${matches.active}/${matches.total}` : '…') : ''
  const noHits = !!query && matches?.total === 0

  return (
    <div className="flex h-9 shrink-0 items-center justify-end gap-1 border-b border-ink-border bg-ink-panel px-2">
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          value={query}
          spellCheck={false}
          placeholder="Find in page"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              search(query, true, !e.shiftKey)
            } else if (e.key === 'Escape') {
              e.preventDefault()
              close()
            }
          }}
          className={
            'h-6 w-56 rounded border bg-ink-bg px-2 pr-12 text-xs text-ink-text ' +
            'placeholder:text-ink-muted focus:outline-none ' +
            (noHits ? 'border-red-500/60' : 'border-ink-border focus:border-ink-accent')
          }
        />
        <span className="pointer-events-none absolute right-2 text-[10px] tabular-nums text-ink-muted">
          {label}
        </span>
      </div>

      <Tooltip label="Previous match" shortcut="shift+enter" align="right" side="top">
        <button
          className={btn}
          aria-label="Previous match"
          disabled={!matches?.total}
          onClick={() => search(query, true, false)}
        >
          <span className="text-xs leading-none">↑</span>
        </button>
      </Tooltip>
      <Tooltip label="Next match" shortcut="enter" align="right" side="top">
        <button
          className={btn}
          aria-label="Next match"
          disabled={!matches?.total}
          onClick={() => search(query, true, true)}
        >
          <span className="text-xs leading-none">↓</span>
        </button>
      </Tooltip>
      <Tooltip label="Close" shortcut="escape" align="right" side="top">
        <button className={btn} aria-label="Close find" onClick={close}>
          <span className="text-sm leading-none">✕</span>
        </button>
      </Tooltip>
    </div>
  )
}
