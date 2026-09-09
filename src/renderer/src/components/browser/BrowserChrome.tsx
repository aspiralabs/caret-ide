import { useEffect, useRef, useState } from 'react'
import type { CenterTab } from '../../stores/tabs'
import { normalizeUrl } from './normalizeUrl'
import { formatReference, asBracketedPaste, nextRefMarker } from './formatReference'
import { useTerminalsStore } from '../../stores/terminals'
import { useLayoutStore } from '../../stores/layout'
import { focusTerminal } from '../../lib/terminalFocus'
import { useCommandChord } from '../../hooks/useCommandChord'
import Tooltip from '../Tooltip'

// ---------------------------------------------------------------------------
// BrowserChrome — the navigation bar rendered above the placeholder viewport:
// back / forward / reload, an editable URL bar, and open-devtools.
//
// The URL input is a controlled local value seeded from `tab.url`. We resync it
// when navigation changes the url, but never while the user is typing (input
// focused), so we don't clobber in-progress edits.
// ---------------------------------------------------------------------------

// Shared classes for the icon buttons.
const btn =
  'app-no-drag flex h-6 w-6 shrink-0 items-center justify-center rounded text-ink-muted ' +
  'hover:bg-ink-hover hover:text-ink-text disabled:cursor-default disabled:opacity-30 ' +
  'disabled:hover:bg-transparent disabled:hover:text-ink-muted'

export default function BrowserChrome({ tab }: { tab: CenterTab }): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(tab.url ?? '')
  const reloadChord = useCommandChord('reload-preview')

  // "Select element" state: `picking` while the in-page picker is active, `hint`
  // for transient feedback (e.g. the active terminal isn't running Claude Code).
  const [picking, setPicking] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flash = (msg: string): void => {
    setHint(msg)
    if (hintTimer.current) clearTimeout(hintTimer.current)
    hintTimer.current = setTimeout(() => setHint(null), 3500)
  }

  useEffect(() => () => void (hintTimer.current && clearTimeout(hintTimer.current)), [])

  // Pick an element in the preview, then inject a reference into the *active*
  // terminal — but only when it's running Claude Code (gated per request).
  const pickElement = async (): Promise<void> => {
    if (picking) return
    setPicking(true)
    setHint(null)
    try {
      const picked = await window.ide.browser.pickElement(tab.id)
      if (!picked) return // cancelled (Escape) or view gone

      const { terminals, activeId } = useTerminalsStore.getState()
      const target = terminals.find((t) => t.id === activeId) ?? null
      if (!target?.ptyId) {
        flash('No active terminal')
        return
      }
      const { name } = await window.ide.pty.foreground(target.ptyId)
      if (name !== 'claude') {
        flash('Active terminal isn’t running Claude Code')
        return
      }
      // Make sure the user can see the reference land.
      if (!useLayoutStore.getState().rightVisible) useLayoutStore.getState().togglePanel('right')
      // A visible [tag #N] marker we control (with source when available),
      // immediately followed by the full reference as a bracketed paste — Claude
      // Code condenses it to its own [Pasted text #N] chip, but the model receives
      // ALL the detail (text, selector, source) on send. No space between so it
      // reads "[button #1][Pasted text #1]". The paste carries the data; the
      // marker alone is just typed text with nothing behind it.
      const marker = nextRefMarker(picked)
      window.ide.pty.write(target.ptyId, `${marker}${asBracketedPaste(formatReference(picked))}`)
      // Move focus to the terminal so the cursor sits at the end, ready to type.
      focusTerminal(target.id)
    } finally {
      setPicking(false)
    }
  }

  // Keep the input in sync with programmatic navigation, but only when the user
  // isn't actively editing it (avoid stomping their keystrokes).
  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setValue(tab.url ?? '')
    }
  }, [tab.url])

  const commit = (): void => {
    const url = normalizeUrl(value)
    if (!url) return
    void window.ide.browser.navigate(tab.id, url)
    inputRef.current?.blur()
  }

  return (
    <div className="flex h-9 shrink-0 items-center gap-1 border-b border-ink-border bg-ink-panel px-2">
      <Tooltip label="Back" align="left" side="top">
        <button
          className={btn}
          aria-label="Back"
          disabled={!tab.canGoBack}
          onClick={() => void window.ide.browser.back(tab.id)}
        >
          <span className="text-base leading-none">‹</span>
        </button>
      </Tooltip>
      <Tooltip label="Forward" align="left" side="top">
        <button
          className={btn}
          aria-label="Forward"
          disabled={!tab.canGoForward}
          onClick={() => void window.ide.browser.forward(tab.id)}
        >
          <span className="text-base leading-none">›</span>
        </button>
      </Tooltip>
      <Tooltip label="Reload" shortcut={reloadChord} align="left" side="top">
        <button
          className={btn}
          aria-label="Reload"
          onClick={() => void window.ide.browser.reload(tab.id)}
        >
          <span className="text-xs leading-none">↻</span>
        </button>
      </Tooltip>

      {/* URL bar */}
      <div className="relative min-w-0 flex-1">
        <input
          ref={inputRef}
          value={value}
          spellCheck={false}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') {
              // Revert to the current url and drop focus.
              setValue(tab.url ?? '')
              inputRef.current?.blur()
            }
          }}
          // Select-all on focus is the expected URL-bar behaviour.
          onFocus={(e) => e.currentTarget.select()}
          placeholder="Enter URL"
          className="app-no-drag h-6 w-full rounded border border-ink-border bg-ink-bg px-2 text-xs text-ink-text placeholder:text-ink-muted focus:border-ink-accent focus:outline-none"
        />
        {/* Subtle loading indicator: a thin accent bar under the URL bar. */}
        {tab.isLoading && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 animate-pulse rounded-b bg-ink-accent" />
        )}
      </div>

      {hint && (
        <span className="app-no-drag shrink-0 truncate text-[10px] text-ink-muted" role="status">
          {hint}
        </span>
      )}

      <Tooltip label="Select element → Claude Code" align="right" side="top">
        <button
          className={btn + (picking ? ' bg-ink-accent/20 text-ink-accent' : '')}
          aria-label="Select element"
          aria-pressed={picking}
          onClick={() => void pickElement()}
        >
          {/* crosshair / target glyph */}
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="4.5" stroke="currentColor" strokeWidth="1.3" />
            <path d="M8 0.5v3M8 12.5v3M0.5 8h3M12.5 8h3" stroke="currentColor" strokeWidth="1.3" />
          </svg>
        </button>
      </Tooltip>

      <Tooltip label="Toggle DevTools" align="right" side="top">
        <button
          className={btn}
          aria-label="Open DevTools"
          onClick={() => void window.ide.browser.openDevTools(tab.id)}
        >
          <span className="text-[10px] leading-none">{'{}'}</span>
        </button>
      </Tooltip>
    </div>
  )
}
