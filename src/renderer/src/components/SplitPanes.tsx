import { Fragment, useRef, useState, type ReactNode } from 'react'
import { cn } from '../lib/cn'

export interface Pane {
  /** Stable identity so panes keep their mounted content across split/focus changes. */
  key: string
  node: ReactNode
}

interface SplitPanesProps {
  panes: Pane[]
  /** When true, all panes tile side-by-side with draggable dividers; when false,
   *  only `focusedKey` shows (others stay mounted but hidden). */
  split: boolean
  /** The pane shown in non-split mode. */
  focusedKey: string | null
  /** Fired when a divider drag starts/ends (used to detach native browser views). */
  onResizeStart?: () => void
  onResizeEnd?: () => void
  /** Fired when a pane gains focus (click or keyboard) so the caller can mark it
   *  active — highlights its tab and makes it the pane restored on un-split. */
  onFocusPane?: (key: string) => void
  /** Ring the focused pane in split view. On by default; terminals opt out. */
  focusRing?: boolean
  /** Pane keys hidden from the split (still mounted). Only applies in split mode. */
  hiddenKeys?: Set<string>
}

/** Minimum pane width in px so a column can't be dragged to nothing. */
const MIN_PANE_PX = 120

/**
 * Lays out a set of panes either as one focused pane (normal tabs) or as
 * resizable side-by-side columns (split view). Panes are ALWAYS mounted in both
 * modes and keyed, so toggling split — or switching the focused tab — never
 * remounts their content (preserves editor state, terminal scrollback, etc.).
 *
 * Column sizes are flex-grow weights: dividers redistribute weight between the
 * two adjacent panes only, measured from real pixel widths so dragging tracks
 * the cursor 1:1 regardless of how many panes there are.
 */
export default function SplitPanes({
  panes,
  split,
  focusedKey,
  onResizeStart,
  onResizeEnd,
  onFocusPane,
  focusRing = true,
  hiddenKeys
}: SplitPanesProps): JSX.Element {
  const n = panes.length
  const containerRef = useRef<HTMLDivElement>(null)
  const paneRefs = useRef<(HTMLDivElement | null)[]>([])

  // Flex-grow weights, one per pane. Reset to equal when the pane count changes.
  const [weights, setWeights] = useState<number[]>(() => Array(n).fill(1))
  const effWeights = weights.length === n ? weights : Array(n).fill(1)
  if (weights.length !== n) setWeights(effWeights)

  // Drag the divider between two adjacent *visible* panes (leftIdx/rightIdx are
  // indices into `panes`; with hidden panes they may not be consecutive).
  const startDrag = (leftIdx: number, rightIdx: number) => (e: React.MouseEvent): void => {
    e.preventDefault()
    const leftEl = paneRefs.current[leftIdx]
    const rightEl = paneRefs.current[rightIdx]
    if (!leftEl || !rightEl) return

    const startX = e.clientX
    const leftW0 = leftEl.getBoundingClientRect().width
    const rightW0 = rightEl.getBoundingClientRect().width
    const totalW = leftW0 + rightW0
    const pairWeight = effWeights[leftIdx] + effWeights[rightIdx]

    onResizeStart?.()

    const onMove = (ev: MouseEvent): void => {
      const dx = ev.clientX - startX
      let leftW = leftW0 + dx
      // Clamp so neither side drops below the minimum.
      leftW = Math.max(MIN_PANE_PX, Math.min(totalW - MIN_PANE_PX, leftW))
      const rightW = totalW - leftW
      const next = [...effWeights]
      next[leftIdx] = (leftW / totalW) * pairWeight
      next[rightIdx] = (rightW / totalW) * pairWeight
      setWeights(next)
    }
    const onUp = (): void => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      onResizeEnd?.()
    }
    document.body.style.cursor = 'col-resize'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // In split mode a pane is hidden if the caller flagged its key; in normal mode
  // only the focused pane shows. Index of the nearest visible pane before `i`
  // (for divider placement/drag), or -1 if none.
  const paneHidden = (key: string): boolean =>
    split ? (hiddenKeys?.has(key) ?? false) : key !== focusedKey
  const prevVisibleIndex = (i: number): number => {
    for (let j = i - 1; j >= 0; j--) {
      if (!(hiddenKeys?.has(panes[j].key) ?? false)) return j
    }
    return -1
  }

  return (
    <div ref={containerRef} className="flex h-full w-full">
      {panes.map((p, i) => {
        const hidden = paneHidden(p.key)
        // A divider sits before this pane only in split view, when it's visible
        // and has a visible pane before it.
        const prev = split && !hidden ? prevVisibleIndex(i) : -1
        return (
          <Fragment key={p.key}>
            {prev !== -1 && (
              <div
                onMouseDown={startDrag(prev, i)}
                className="group relative z-10 flex w-1 shrink-0 cursor-col-resize items-stretch"
              >
                {/* Thin divider line; widens visually on hover. */}
                <div className="mx-auto h-full w-px bg-ink-border transition-colors group-hover:w-0.5 group-hover:bg-ink-accent" />
              </div>
            )}
            <div
              ref={(el) => {
                paneRefs.current[i] = el
              }}
              // Clicking or tabbing into a pane makes it the active tab (capture so
              // it wins before inner editor/terminal handlers).
              onMouseDownCapture={() => onFocusPane?.(p.key)}
              onFocusCapture={() => onFocusPane?.(p.key)}
              className={cn('relative min-h-0 min-w-0', {
                hidden,
                'h-full flex-1': !split && p.key === focusedKey,
                // Ring the focused pane in split view so it's clear where typing goes.
                'ring-1 ring-inset ring-ink-accent/60':
                  focusRing && split && !hidden && p.key === focusedKey
              })}
              style={split && !hidden ? { flexGrow: effWeights[i], flexBasis: 0 } : undefined}
            >
              {p.node}
            </div>
          </Fragment>
        )
      })}
    </div>
  )
}
