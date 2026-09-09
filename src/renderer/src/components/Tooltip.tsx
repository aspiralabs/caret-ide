import type { ReactNode } from 'react'
import { formatChord } from '../lib/keybindings'

type Align = 'center' | 'left' | 'right'
type Side = 'top' | 'bottom'

/**
 * Lightweight CSS-only tooltip. Shows on hover after a short delay. `align`
 * controls horizontal anchoring so tooltips near a window edge don't clip;
 * `side` places it above ('top') or below ('bottom') the trigger — use 'top'
 * for triggers pinned to the bottom of the window (e.g. the status bar).
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
  align?: Align
  side?: Side
  children: ReactNode
}): JSX.Element {
  const pos =
    align === 'right'
      ? 'right-0'
      : align === 'left'
        ? 'left-0'
        : 'left-1/2 -translate-x-1/2'
  const vpos = side === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
  return (
    <span className="group/tt relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-50 inline-flex items-center gap-2 whitespace-nowrap rounded-md border border-ink-border bg-ink-elevated py-1 text-[11px] font-normal text-ink-text opacity-0 shadow-lg transition-opacity delay-300 duration-100 group-hover/tt:opacity-100 ${
          shortcut ? 'pl-2.5 pr-1.5' : 'px-2'
        } ${pos} ${vpos}`}
      >
        {label}
        {shortcut && (
          <span className="rounded bg-white/[0.07] px-1.5 py-0.5 font-medium tracking-wide text-ink-muted">
            {formatChord(shortcut)}
          </span>
        )}
      </span>
    </span>
  )
}
