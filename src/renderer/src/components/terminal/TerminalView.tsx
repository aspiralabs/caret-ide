import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useTerminalsStore, type TerminalTab } from '../../stores/terminals'
import { useProjectStore } from '../../stores/project'
import { registerTerminalFocus } from '../../lib/terminalFocus'
import { useEffectiveTheme, xtermTheme } from '../../lib/theme'

// How often we poll the pty's foreground process while the tab is visible (spec §6).
const FOREGROUND_POLL_MS = 3000

/**
 * One xterm.js instance bound to one pty. Rendered once per terminal tab and kept
 * mounted for the panel's life (TerminalPanel toggles `visible` via CSS, never unmounts)
 * so scrollback + the pty stay alive across tab switches.
 */
export default function TerminalView({
  tab,
  visible
}: {
  tab: TerminalTab
  visible: boolean
}): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)

  // Keep the latest `visible` readable from long-lived callbacks without re-running effects.
  const visibleRef = useRef(visible)
  visibleRef.current = visible

  // xterm + fit live across the component's life; stashed in refs, created once on mount.
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  // The pty id this view is bound to. Mirrors tab.ptyId but readable from stable callbacks.
  const ptyIdRef = useRef<string | null>(tab.ptyId)

  const projectRoot = useProjectStore((s) => s.info?.root ?? null)
  const effectiveTheme = useEffectiveTheme()
  // Readable from the once-on-mount effect below without making it a dependency.
  const effectiveThemeRef = useRef(effectiveTheme)
  effectiveThemeRef.current = effectiveTheme

  // True while files are being dragged over the terminal, to show the drop overlay.
  const [dragActive, setDragActive] = useState(false)

  // Right-click context menu (paste/copy/clear). `hasSelection` is snapshotted at
  // open time so the Copy item can be enabled/disabled without re-reading xterm.
  const [menu, setMenu] = useState<{ x: number; y: number; hasSelection: boolean } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  // Final on-screen position after clamping/flipping to stay inside the viewport. Null
  // until measured — the menu renders invisibly for one frame so there's no jump.
  const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(null)

  // Measure the menu once mounted and flip it up / left if it would overflow the viewport.
  // useLayoutEffect runs before paint, so the corrected position is what the user first sees.
  useLayoutEffect(() => {
    if (!menu) {
      setMenuPos(null)
      return
    }
    const el = menuRef.current
    if (!el) return
    const pad = 8
    const { width, height } = el.getBoundingClientRect()
    // Flip up if it would run off the bottom; flip left if it would run off the right.
    const top =
      menu.y + height > window.innerHeight - pad ? Math.max(pad, menu.y - height) : menu.y
    const left =
      menu.x + width > window.innerWidth - pad ? Math.max(pad, menu.x - width) : menu.x
    setMenuPos({ left, top })
  }, [menu])

  // Close the context menu on any outside click / another right-click / Escape.
  useEffect(() => {
    if (!menu) return
    const close = (): void => setMenu(null)
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setMenu(null)
    }
    window.addEventListener('click', close)
    window.addEventListener('contextmenu', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('contextmenu', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  // Paste clipboard text into the terminal (shared by ⌘V and the context menu).
  const pasteFromClipboard = (): void => {
    const term = termRef.current
    if (!term) return
    void navigator.clipboard
      .readText()
      .then((text) => {
        if (text) term.paste(text)
      })
      .catch(() => {})
  }

  // Quote a path for a POSIX shell so paths with spaces/special chars stay intact.
  // Single-quote wrapping is the safest form; embedded single quotes become '\''.
  const shellQuote = (p: string): string =>
    /^[A-Za-z0-9_@%+=:,./-]+$/.test(p) ? p : `'${p.replace(/'/g, "'\\''")}'`

  // Files dropped from Finder/Explorer: resolve each to its absolute path and write
  // the space-separated, shell-escaped list into the pty (with a trailing space).
  // This matches Terminal.app / iTerm behavior and lets Claude Code attach the files
  // (it reads file paths typed into its prompt). Directories are included too.
  const handleFileDrop = (files: FileList): void => {
    const ptyId = ptyIdRef.current
    if (!ptyId) return
    const paths: string[] = []
    for (const file of Array.from(files)) {
      const path = window.ide.files.pathForFile(file)
      if (path) paths.push(shellQuote(path))
    }
    if (paths.length === 0) return
    window.ide.pty.write(ptyId, paths.join(' ') + ' ')
    termRef.current?.focus()
  }

  // Copy the current selection to the clipboard (context menu "Copy").
  const copySelection = (): void => {
    const term = termRef.current
    if (!term || !term.hasSelection()) return
    const sel = term.getSelection()
    if (sel) void navigator.clipboard.writeText(sel).catch(() => {})
  }

  // ---- Mount: build the terminal, wire pty I/O, resize + foreground polling. ----
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const term = new Terminal({
      fontFamily: "'JetBrainsMono Nerd Font', SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: 12,
      scrollback: 10000,
      cursorBlink: true,
      allowProposedApi: true,
      // Mirrors the ink.* palette; kept in sync with the app theme by the effect
      // below. Use a ref so a mid-session mount picks up the current theme.
      theme: xtermTheme(effectiveThemeRef.current)
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(container)
    try {
      fit.fit()
    } catch {
      /* container may be 0-sized until laid out; ResizeObserver will fit later */
    }
    termRef.current = term
    fitRef.current = fit

    // Right-click context menu. xterm handles the mouse event on its own inner element
    // and stops it before it reaches React's root, so React's onContextMenu never fires.
    // Listen natively in the CAPTURE phase to run before xterm; stopPropagation keeps our
    // window-level "close on contextmenu" listener from immediately re-closing it.
    const onContextMenu = (e: MouseEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      setMenu({ x: e.clientX, y: e.clientY, hasSelection: term.hasSelection() })
    }
    container.addEventListener('contextmenu', onContextMenu, true)

    // Let external callers (e.g. browser "select element") focus this terminal.
    const offFocus = registerTerminalFocus(tab.id, () => term.focus())

    // xterm caches glyph metrics on open; if the bundled Nerd Font finishes loading
    // after that, refit + repaint so prompt glyphs (Starship) size correctly.
    void document.fonts.load('12px "JetBrainsMono Nerd Font"').then(() => {
      if (termRef.current !== term) return
      try {
        term.refresh(0, term.rows - 1)
        fit.fit()
      } catch {
        /* container may be gone; ResizeObserver will refit later */
      }
    })

    // OSC title change is the PRIMARY tab-naming mechanism (spec §6): a program (shell,
    // claude, etc.) emits OSC 0/2 → xterm surfaces it here → auto-label the tab.
    const titleDisp = term.onTitleChange((title) => {
      useTerminalsStore.getState().setAutoLabel(tab.id, title)
    })

    // Copy-on-select (spec §5.4): copy the current selection to the clipboard whenever it changes.
    const selDisp = term.onSelectionChange(() => {
      if (term.hasSelection()) {
        const sel = term.getSelection()
        if (sel) void navigator.clipboard.writeText(sel).catch(() => {})
      }
    })

    // Intercept ⌘K (clear) and ⌘V (paste) before xterm handles them, and keep them from
    // leaking to the app-global shortcut handler. Returning false stops xterm's default too.
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true
      // Shift+Enter → insert a newline instead of submitting. xterm would send a
      // bare CR (\r), which Claude Code and other TUIs read as "submit". Sending
      // ESC+CR (\x1b\r) is the meta/return sequence they treat as a newline — the
      // same sequence `/terminal-setup` installs for Shift+Enter.
      if (e.key === 'Enter' && e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        e.stopPropagation()
        const ptyId = ptyIdRef.current
        if (ptyId) window.ide.pty.write(ptyId, '\x1b\r')
        return false
      }
      if (e.metaKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        e.stopPropagation()
        term.clear()
        return false
      }
      if (e.metaKey && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault()
        e.stopPropagation()
        const ptyId = ptyIdRef.current
        const fg = useTerminalsStore.getState().terminals.find((t) => t.id === tab.id)?.foreground
        // If the clipboard holds an image and Claude Code is the foreground process, forward
        // Ctrl+V (\x16): Claude Code reads the macOS clipboard image itself on that keystroke.
        // A plain Cmd+V only pastes text (readText → empty for images), silently dropping the
        // screenshot. Anything else — no image, or not Claude Code — falls back to text paste.
        if (ptyId && fg === 'claude' && typeof navigator.clipboard.read === 'function') {
          void navigator.clipboard
            .read()
            .then((items) => {
              const hasImage = items.some((it) => it.types.some((t) => t.startsWith('image/')))
              if (hasImage) window.ide.pty.write(ptyId, '\x16')
              else pasteFromClipboard()
            })
            .catch(() => pasteFromClipboard())
        } else {
          pasteFromClipboard()
        }
        return false
      }
      return true
    })

    // Forward keystrokes to the pty. `term.paste` also routes through onData.
    const dataDisp = term.onData((d) => {
      const ptyId = ptyIdRef.current
      if (ptyId) window.ide.pty.write(ptyId, d)
    })

    // Subscribe to pty output + exit. These stay live for the component's whole life.
    const offData = window.ide.pty.onData((e) => {
      if (e.ptyId === ptyIdRef.current) term.write(e.data)
    })
    const offExit = window.ide.pty.onExit((e) => {
      if (e.ptyId === ptyIdRef.current) {
        useTerminalsStore.getState().markExited(e.ptyId, e.exitCode)
      }
    })

    // Fit + forward the resulting cols/rows to the pty, throttled to one per animation frame.
    let rafId = 0
    const scheduleFit = (): void => {
      if (rafId) return
      rafId = requestAnimationFrame(() => {
        rafId = 0
        if (!containerRef.current) return
        try {
          fit.fit()
        } catch {
          return
        }
        const ptyId = ptyIdRef.current
        if (ptyId) window.ide.pty.resize(ptyId, term.cols, term.rows)
      })
    }

    const ro = new ResizeObserver(() => scheduleFit())
    ro.observe(container)

    // Foreground process poll (spec §6): only while visible, to drive the claude badge.
    let pollId: ReturnType<typeof setInterval> | null = null
    const pollForeground = async (): Promise<void> => {
      const ptyId = ptyIdRef.current
      if (!ptyId || !visibleRef.current) return
      try {
        const { name } = await window.ide.pty.foreground(ptyId)
        useTerminalsStore.getState().setForeground(tab.id, name)
      } catch {
        /* pty may have exited between poll ticks */
      }
    }
    pollId = setInterval(() => void pollForeground(), FOREGROUND_POLL_MS)

    return () => {
      container.removeEventListener('contextmenu', onContextMenu, true)
      offFocus()
      titleDisp.dispose()
      selDisp.dispose()
      dataDisp.dispose()
      offData()
      offExit()
      ro.disconnect()
      if (rafId) cancelAnimationFrame(rafId)
      if (pollId) clearInterval(pollId)
      term.dispose()
      termRef.current = null
      fitRef.current = null
      // NOTE: we deliberately do NOT kill the pty here — TerminalPanel owns kill-on-close.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.id])

  // Keep the live terminal's colors in sync with the app theme (light/dark/system).
  useEffect(() => {
    const term = termRef.current
    if (!term) return
    term.options.theme = xtermTheme(effectiveTheme)
    // Repaint so already-rendered cells pick up the new palette immediately.
    try {
      term.refresh(0, term.rows - 1)
    } catch {
      /* container may be detached; next paint uses the new theme anyway */
    }
  }, [effectiveTheme])

  // ---- Spawn a pty for this tab if it doesn't have one yet (guard until project loaded). ----
  useEffect(() => {
    if (tab.ptyId) {
      ptyIdRef.current = tab.ptyId
      return
    }
    if (!projectRoot) return
    const term = termRef.current
    if (!term) return

    let cancelled = false
    void (async () => {
      const { ptyId } = await window.ide.pty.create({
        cwd: projectRoot,
        cols: term.cols || 80,
        rows: term.rows || 24
      })
      if (cancelled) return
      ptyIdRef.current = ptyId
      useTerminalsStore.getState().setPty(tab.id, ptyId)
    })()
    return () => {
      cancelled = true
    }
  }, [tab.id, tab.ptyId, projectRoot])

  // ---- When the tab becomes visible, re-fit (it may have resized while hidden) + focus. ----
  useEffect(() => {
    if (!visible) return
    const term = termRef.current
    const fit = fitRef.current
    if (!term || !fit) return
    // Fit on the next frame so the container has its final laid-out size.
    const raf = requestAnimationFrame(() => {
      try {
        fit.fit()
      } catch {
        return
      }
      const ptyId = ptyIdRef.current
      if (ptyId) window.ide.pty.resize(ptyId, term.cols, term.rows)
      term.focus()
    })
    return () => cancelAnimationFrame(raf)
  }, [visible])

  // Padded wrapper so terminal text isn't flush against the panel edges.
  // xterm still fills the inner div; FitAddon measures it, so cols/rows stay correct.
  return (
    <div
      className="relative h-full w-full bg-ink-terminal pl-3 pr-1.5 pt-2"
      onDragOver={(e) => {
        // Only react to file drags (not text/selection drags within xterm).
        if (!Array.from(e.dataTransfer.types).includes('Files')) return
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = 'copy'
        if (!dragActive) setDragActive(true)
      }}
      onDragLeave={(e) => {
        // Ignore leaves into child elements; only clear when leaving the wrapper.
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
        setDragActive(false)
      }}
      onDrop={(e) => {
        if (!Array.from(e.dataTransfer.types).includes('Files')) return
        e.preventDefault()
        e.stopPropagation()
        setDragActive(false)
        if (e.dataTransfer.files.length) handleFileDrop(e.dataTransfer.files)
      }}
    >
      <div ref={containerRef} className="h-full w-full" />
      {dragActive && (
        <div className="pointer-events-none absolute inset-1 z-40 flex items-center justify-center rounded-lg border-2 border-dashed border-ink-accent bg-ink-accent/10 text-sm font-medium text-ink-text">
          Drop files to add their paths
        </div>
      )}
      {menu && (
        <div
          ref={menuRef}
          className={`fixed z-50 min-w-[160px] rounded border border-ink-border bg-ink-elevated py-1 text-xs shadow-lg ${
            menuPos ? '' : 'invisible'
          }`}
          style={{ left: menuPos?.left ?? menu.x, top: menuPos?.top ?? menu.y }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <button
            className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-ink-hover"
            onClick={() => {
              pasteFromClipboard()
              setMenu(null)
              termRef.current?.focus()
            }}
          >
            <span>Paste</span>
            <span className="text-ink-muted">⌘V</span>
          </button>
          <button
            className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-ink-hover disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
            disabled={!menu.hasSelection}
            onClick={() => {
              copySelection()
              setMenu(null)
              termRef.current?.focus()
            }}
          >
            <span>Copy</span>
          </button>
          <div className="my-1 border-t border-ink-border" />
          <button
            className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-ink-hover"
            onClick={() => {
              termRef.current?.clear()
              setMenu(null)
              termRef.current?.focus()
            }}
          >
            <span>Clear</span>
            <span className="text-ink-muted">⌘K</span>
          </button>
        </div>
      )}
    </div>
  )
}
