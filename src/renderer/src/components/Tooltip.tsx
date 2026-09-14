import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { formatChord } from '../lib/keybindings'
import { tooltipPosition, type TooltipAlign, type TooltipSide } from '../lib/tooltipPosition'

/** Hover delay before the tooltip appears. */
const SHOW_DELAY_MS = 300

/**
 * Hover tooltip, PORTALED to <body> and positioned with fixed coordinates.
 * It must not live inside the trigger's subtree: the status bar (and other
 * strips) use `contain: paint` / a compositing transform, which clips anything
 * overflowing their box — an in-tree tooltip rendered above the bar was cut
 * off entirely.
 *
 * `side` picks the edge it appears on. Use 'left' / 'right' for triggers in a
 * strip that borders the browser preview (status bar, center tab bar): the
 * native preview view paints above the DOM, so a tooltip that overhangs it
 * is hidden — beside the trigger it stays within the strip. `align` is the
 * cross-axis anchoring for top/bottom.
 *
 * Pass `shortcut` (a canonical chord like "mod+d") to render keycaps after the
 * label instead of jamming glyphs into the text.
 */
export default function Tooltip({
  label,
  shortcut,
  align = 'center',
  side = 'bottom',
  children
}: {
  label: string
  shortcut?: string
  align?: TooltipAlign
  side?: TooltipSide
  children: ReactNode
}): JSX.Element {
  const anchorRef = useRef<HTMLSpanElement>(null)
  const tipRef = useRef<HTMLSpanElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  const show = (): void => {
    if (timer.current) return
    timer.current = setTimeout(() => {
      timer.current = null
      setOpen(true)
    }, SHOW_DELAY_MS)
  }
  const hide = (): void => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    setOpen(false)
    setPos(null)
  }

  useEffect(() => hide, [])

  // Measure once mounted (invisible for that first frame) and place it.
  useLayoutEffect(() => {
    if (!open) return
    const anchor = anchorRef.current
    const tip = tipRef.current
    if (!anchor || !tip) return
    const a = anchor.getBoundingClientRect()
    const t = tip.getBoundingClientRect()
    setPos(
      tooltipPosition(
        { x: a.left, y: a.top, width: a.width, height: a.height },
        { width: t.width, height: t.height },
        side,
        align,
        { width: window.innerWidth, height: window.innerHeight }
      )
    )
  }, [open, side, align, label, shortcut])

  // Anything that moves the trigger (scroll, resize) or takes the pointer away
  // dismisses it — a stale tooltip floating in space is worse than none.
  useEffect(() => {
    if (!open) return
    const off = (): void => hide()
    window.addEventListener('scroll', off, true)
    window.addEventListener('resize', off)
    window.addEventListener('mousedown', off, true)
    window.addEventListener('keydown', off, true)
    return () => {
      window.removeEventListener('scroll', off, true)
      window.removeEventListener('resize', off)
      window.removeEventListener('mousedown', off, true)
      window.removeEventListener('keydown', off, true)
    }
  }, [open])

  return (
    <span
      ref={anchorRef}
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {open &&
        createPortal(
          <span
            ref={tipRef}
            role="tooltip"
            className={`pointer-events-none fixed z-[60] inline-flex items-center gap-2 whitespace-nowrap rounded-md border border-ink-border bg-ink-elevated py-1 text-[11px] font-normal text-ink-text shadow-lg ${
              shortcut ? 'pl-2.5 pr-1.5' : 'px-2'
            } ${pos ? 'opacity-100' : 'opacity-0'}`}
            style={{ left: pos?.left ?? 0, top: pos?.top ?? 0 }}
          >
            {label}
            {shortcut && (
              <span className="rounded bg-white/[0.07] px-1.5 py-0.5 font-medium tracking-wide text-ink-muted">
                {formatChord(shortcut)}
              </span>
            )}
          </span>,
          document.body
        )}
    </span>
  )
}
