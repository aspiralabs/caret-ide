import { Columns2 } from 'lucide-react'
import Tooltip from './Tooltip'
import { cn } from '../lib/cn'

/**
 * Toggle button for split view, shown next to the "+" in a tab bar. Highlights
 * (filled background) when split is on. The icon is two side-by-side panes.
 */
export default function SplitToggle({
  active,
  onToggle
}: {
  active: boolean
  onToggle: () => void
}): JSX.Element {
  return (
    <Tooltip label={active ? 'Exit split view' : 'Split view'} align="right" side="bottom">
      <button
        aria-label="Toggle split view"
        aria-pressed={active}
        onClick={onToggle}
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-transparent transition-colors',
          {
            'bg-ink-active text-ink-text': active,
            'text-ink-muted hover:bg-ink-hover hover:text-ink-text': !active
          }
        )}
      >
        <Columns2 size={15} strokeWidth={1.5} aria-hidden />
      </button>
    </Tooltip>
  )
}
