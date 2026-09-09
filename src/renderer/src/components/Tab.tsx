import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '../lib/cn'

interface TabProps extends ComponentPropsWithoutRef<'div'> {
  /** Highlight as the active tab (raised card + border). */
  active: boolean
  /** Dim the tab (e.g. a terminal whose process has exited). */
  dimmed?: boolean
  /** When provided, renders the trailing ✕ close button wired to this. */
  onClose?: () => void
  /** During a tab drag, draw a vertical insertion bar on this edge. */
  dropIndicator?: 'left' | 'right' | null
  /** Tab content: icon, label, badges, dirty dot, inline-rename input, etc. */
  children: ReactNode
}

/**
 * The single source of truth for a tab's look (spec §5.4 visual language) —
 * shared by the editor/browser tabs (CenterPanel) and the terminal tabs
 * (TerminalPanel). Edit the pill styling here to change every tab at once.
 * All other div props (onClick, draggable, onContextMenu, …) pass straight
 * through, so each tab type keeps its own behavior.
 */
export default function Tab({
  active,
  dimmed = false,
  onClose,
  dropIndicator,
  children,
  className = '',
  ...rest
}: TabProps): JSX.Element {
  return (
    <div
      className={cn(
        'group relative flex h-7 max-w-[200px] shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors',
        {
          'border-ink-border bg-ink-elevated text-ink-text': active,
          'border-transparent text-ink-muted hover:bg-ink-hover hover:text-ink-text': !active,
          'opacity-50': dimmed
        },
        className
      )}
      {...rest}
    >
      {dropIndicator && (
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-y-1 z-10 w-0.5 rounded-full bg-ink-accent',
            dropIndicator === 'left' ? '-left-1' : '-right-1'
          )}
        />
      )}
      {children}
      {onClose && (
        <button
          className="ml-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded text-ink-muted hover:bg-ink-active hover:text-ink-text"
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
        >
          <X size={12} strokeWidth={2} />
        </button>
      )}
    </div>
  )
}
