import { useEffect, useRef, useState } from 'react'
import { Plus, Eye, EyeOff } from 'lucide-react'
import { useTerminalsStore, type TerminalTab } from '../../stores/terminals'
import { useLayoutStore } from '../../stores/layout'
import { useCommandChord } from '../../hooks/useCommandChord'
import { useTabReorder, type TabDragProps } from '../../lib/useTabReorder'
import TerminalView from './TerminalView'
import Tooltip from '../Tooltip'
import Tab from '../Tab'
import SplitToggle from '../SplitToggle'
import SplitPanes, { type Pane } from '../SplitPanes'

/**
 * Small badge shown on a tab when Claude Code is the foreground process
 * (spec §6 detection): the Claude sunburst logomark on a blue rounded square.
 */
function ClaudeBadge(): JSX.Element {
  return (
    <span
      title="Claude Code"
      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] bg-[#3b7dff]"
    >
      <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" aria-hidden="true">
        <g fill="#fff">
          {Array.from({ length: 12 }, (_, i) => (
            <rect
              key={i}
              x="11.1"
              y="1.5"
              width="1.8"
              height="7.2"
              rx="0.9"
              transform={`rotate(${i * 30} 12 12)`}
            />
          ))}
        </g>
      </svg>
    </span>
  )
}

function TerminalTabButton({
  tab,
  active,
  split,
  hidden,
  canToggleHidden,
  dragProps,
  dropIndicator,
  dragging
}: {
  tab: TerminalTab
  active: boolean
  /** Whether the terminal panel is in split view (controls the eye toggle). */
  split: boolean
  /** Whether this tab's pane is currently hidden from the split. */
  hidden: boolean
  /** False when hiding this pane would leave the split empty (last visible one). */
  canToggleHidden: boolean
  /** Drag-to-reorder handlers for this tab. */
  dragProps: TabDragProps
  /** Insertion-bar edge to draw during a drag, or null. */
  dropIndicator: 'left' | 'right' | null
  /** Whether this tab is the one currently being dragged. */
  dragging: boolean
}): JSX.Element {
  const { setActive, setCustomName, clearCustomName, displayLabel } = useTerminalsStore()
  const togglePaneHidden = useLayoutStore((s) => s.toggleTerminalPaneHidden)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  // Dismiss the context menu on any outside interaction.
  useEffect(() => {
    if (!menu) return
    const close = (): void => setMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('contextmenu', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('contextmenu', close)
    }
  }, [menu])

  const commitRename = (): void => {
    setCustomName(tab.id, draft)
    setEditing(false)
  }

  const close = (): void => requestCloseTerminal(tab.id)

  return (
    <Tab
      active={active}
      dimmed={tab.exited || (split && hidden)}
      className={dragging ? 'opacity-40' : ''}
      dropIndicator={dropIndicator}
      onClose={close}
      {...dragProps}
      // Dragging is disabled while inline-renaming so text can be selected.
      draggable={!editing}
      onMouseDown={(e) => {
        // Middle-click closes (spec §5.4 visual language mirrors center tabs).
        if (e.button === 1) {
          e.preventDefault()
          close()
        }
      }}
      onClick={() => setActive(tab.id)}
      onDoubleClick={() => {
        // Double-click → inline manual rename (manual override wins; spec §6).
        setDraft(displayLabel(tab))
        setEditing(true)
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        setMenu({ x: e.clientX, y: e.clientY })
      }}
      title={displayLabel(tab)}
    >
      {tab.foreground === 'claude' && <ClaudeBadge />}

      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename()
            else if (e.key === 'Escape') setEditing(false)
          }}
          className="w-24 rounded border border-ink-border bg-ink-elevated px-1 text-xs text-ink-text outline-none"
        />
      ) : (
        <span className="truncate">{displayLabel(tab)}</span>
      )}

      {tab.exited && <span className="ml-0.5 shrink-0 text-[10px] text-ink-muted">exited</span>}

      {split && (
        <button
          aria-label={hidden ? 'Show pane in split' : 'Hide pane in split'}
          title={hidden ? 'Show pane in split' : 'Hide pane in split'}
          disabled={!canToggleHidden}
          onClick={(e) => {
            e.stopPropagation()
            togglePaneHidden(tab.id)
          }}
          className="ml-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded text-ink-muted hover:bg-ink-active hover:text-ink-text disabled:pointer-events-none disabled:opacity-30"
        >
          {hidden ? <EyeOff size={12} strokeWidth={2} /> : <Eye size={12} strokeWidth={2} />}
        </button>
      )}

      {/* Right-click context menu: "Follow automatic title" clears the manual override (spec §6). */}
      {menu && (
        <div
          className="fixed z-50 min-w-[180px] rounded border border-ink-border bg-ink-elevated py-1 text-xs shadow-lg"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className={`block w-full px-3 py-1.5 text-left hover:bg-ink-hover ${
              tab.customName ? 'text-ink-text' : 'cursor-default text-ink-muted'
            }`}
            disabled={!tab.customName}
            onClick={() => {
              clearCustomName(tab.id)
              setMenu(null)
            }}
          >
            Follow automatic title
          </button>
        </div>
      )}
    </Tab>
  )
}

/** Kill the pty (if any) then remove the tab from the store (spec §5.4). */
function requestCloseTerminal(id: string): void {
  const tab = useTerminalsStore.getState().terminals.find((t) => t.id === id)
  if (tab?.ptyId) void window.ide.pty.kill(tab.ptyId)
  useTerminalsStore.getState().removeTerminal(id)
}

export default function TerminalPanel(): JSX.Element {
  const { terminals, activeId, addTerminal } = useTerminalsStore()
  const newTerminalChord = useCommandChord('new-terminal-tab')
  const split = useLayoutStore((s) => s.terminalSplit)
  const toggleSplit = useLayoutStore((s) => s.toggleTerminalSplit)
  const hiddenTerminalPanes = useLayoutStore((s) => s.hiddenTerminalPanes)
  const reorder = useTabReorder(
    'text/terminal-tab',
    () => useTerminalsStore.getState().terminals.map((t) => t.id),
    (id, to) => useTerminalsStore.getState().moveTerminal(id, to)
  )

  // Which panes are hidden from the split, and how many remain visible (so we can
  // block hiding the last one — a split with nothing in it).
  const hiddenSet = new Set(hiddenTerminalPanes.filter((id) => terminals.some((t) => t.id === id)))
  const visibleCount = terminals.length - hiddenSet.size

  // Track the most-recently-active terminal id so the /rename fallback can pick a target
  // even when the currently-active tab isn't a claude session.
  const lastActiveRef = useRef<string | null>(activeId)
  useEffect(() => {
    if (activeId) lastActiveRef.current = activeId
  }, [activeId])

  // Claude /rename FALLBACK correlation (spec §6). When the main-process session watcher
  // reports a title change, apply it (via setAutoLabel) to the best-matching claude tab:
  //   1) the currently-active tab if it's running claude, else
  //   2) the most-recently-active tab running claude, else
  //   3) no-op.
  // This is best-effort: with two concurrent claude sessions we cannot perfectly
  // disambiguate which session the metadata update belongs to (acceptance criterion #3
  // is explicitly relaxed under the fallback mechanism in the spec).
  useEffect(() => {
    return window.ide.session.onUpdate((e) => {
      const { terminals: terms, activeId: aId } = useTerminalsStore.getState()
      const isClaude = (t: TerminalTab): boolean => t.foreground === 'claude' && !t.exited

      const active = terms.find((t) => t.id === aId)
      let target: TerminalTab | undefined = active && isClaude(active) ? active : undefined

      if (!target) {
        const lastId = lastActiveRef.current
        const last = terms.find((t) => t.id === lastId)
        if (last && isClaude(last)) target = last
      }
      if (!target) target = terms.find(isClaude)

      if (target) useTerminalsStore.getState().setAutoLabel(target.id, e.title)
    })
  }, [])

  return (
    <div className="flex h-full min-w-0 flex-col bg-ink-terminal">
      {/* Tab bar — same visual language as center tabs (spec §5.4). */}
      <div className="flex h-11 shrink-0 items-center border-b border-ink-border bg-ink-panel">
        <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-2">
          {terminals.map((t, i) => {
            const hidden = hiddenSet.has(t.id)
            return (
              <TerminalTabButton
                key={t.id}
                tab={t}
                active={t.id === activeId}
                split={split}
                hidden={hidden}
                // Can always re-show; can only hide while another pane stays visible.
                canToggleHidden={hidden || visibleCount > 1}
                dragProps={reorder.tabProps(t.id, i)}
                dropIndicator={reorder.indicatorSide(i)}
                dragging={reorder.draggingId === t.id}
              />
            )
          })}
          <div
            className="relative h-full flex-1"
            onDragOver={reorder.endProps.onDragOver}
            onDrop={reorder.endProps.onDrop}
          >
            {reorder.atEnd && (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-1 left-0 z-10 w-0.5 rounded-full bg-ink-accent"
              />
            )}
          </div>
        </div>
        <div className="mr-2 flex shrink-0 items-center gap-1">
          {terminals.length > 1 && <SplitToggle active={split} onToggle={toggleSplit} />}
          <Tooltip label="New terminal" shortcut={newTerminalChord} align="right">
            <button
              aria-label="New terminal"
              onClick={() => addTerminal()}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-transparent text-ink-muted transition-colors hover:bg-ink-hover hover:text-ink-text"
            >
              <Plus size={16} strokeWidth={1.8} />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Content: ALL views mounted at once (SplitPanes keeps them mounted whether
          split or focused) so scrollback and the pty survive tab switches and
          mode toggles (spec §5.4). */}
      <div className="relative min-h-0 flex-1 bg-ink-terminal">
        {terminals.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-ink-muted">
            <div className="text-xs">No terminals</div>
          </div>
        ) : (
          <SplitPanes
            split={split}
            hiddenKeys={hiddenSet}
            focusedKey={activeId}
            focusRing={false}
            onFocusPane={(id) => {
              if (id !== activeId) useTerminalsStore.getState().setActive(id)
            }}
            panes={terminals.map(
              (t): Pane => ({
                key: t.id,
                node: (
                  <div className="h-full p-1">
                    <TerminalView
                      tab={t}
                      visible={split ? !hiddenSet.has(t.id) : t.id === activeId}
                    />
                  </div>
                )
              })
            )}
          />
        )}
      </div>
    </div>
  )
}
