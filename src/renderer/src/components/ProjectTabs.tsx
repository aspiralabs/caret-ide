import { useEffect, useState } from 'react'
import { Folder, Plus, TerminalSquare } from 'lucide-react'
import type { ProjectTab } from '@shared/types'
import { useProjectTabsStore } from '../stores/projectTabs'
import { useTabReorder } from '../lib/useTabReorder'
import { useOverlay } from '../stores/overlay'
import { useCommandChord } from '../hooks/useCommandChord'
import { copyText } from './CopyPathItems'
import { cn } from '../lib/cn'
import Tab from './Tab'
import Tooltip from './Tooltip'
import AwaitingDot from './AwaitingDot'

const DRAG_MIME = 'application/x-caret-project-tab'

/**
 * Title-bar project tabs: every project open in this window, one renderer
 * each (main swaps which one is visible). Click switches, middle-click or ✕
 * closes (after that project's unsaved-changes check), drag reorders, "+"
 * opens a folder as a new tab here. Main owns the list; see stores/projectTabs.
 */
export default function ProjectTabs(): JSX.Element {
  const tabs = useProjectTabsStore((s) => s.tabs)
  const activeId = useProjectTabsStore((s) => s.activeId)
  const openChord = useCommandChord('open-project')
  const [menu, setMenu] = useState<{ x: number; y: number; tab: ProjectTab } | null>(null)
  useOverlay(menu !== null)

  useEffect(() => useProjectTabsStore.getState().init(), [])

  // Dismiss the context menu on any outside interaction.
  useEffect(() => {
    if (!menu) return
    const close = (): void => setMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('contextmenu', close)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('contextmenu', close)
      window.removeEventListener('blur', close)
    }
  }, [menu])

  const reorder = useTabReorder(
    DRAG_MIME,
    () => useProjectTabsStore.getState().tabs.map((t) => String(t.id)),
    (id, to) => useProjectTabsStore.getState().move(Number(id), to)
  )

  const MenuItem = ({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }): JSX.Element => (
    <button
      disabled={disabled}
      className="block w-full px-3 py-1.5 text-left text-ink-text hover:bg-ink-hover disabled:cursor-default disabled:text-ink-muted disabled:hover:bg-transparent"
      onClick={() => {
        onClick()
        setMenu(null)
      }}
    >
      {label}
    </button>
  )

  return (
    <div className="flex min-w-0 items-center gap-1">
      <div className="app-no-drag flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none]">
        {tabs.map((tab, i) => (
          <Tab
            key={tab.id}
            active={tab.id === activeId}
            className={cn(
              // Stronger than editor tabs: the title bar and an active pill are
              // both near-white, so the active project gets a real border and a
              // lift, and idle tabs read as buttons.
              'h-[30px] border',
              tab.id === activeId
                ? 'border-ink-border bg-ink-elevated text-ink-text shadow-[0_1px_3px_rgb(0_0_0/0.12)]'
                : 'border-ink-border/60 bg-ink-panel/60 text-ink-muted hover:border-ink-border hover:bg-ink-hover',
              reorder.draggingId === String(tab.id) && 'opacity-40'
            )}
            dropIndicator={reorder.indicatorSide(i)}
            onClose={() => void window.ide.projectTabs.close(tab.id)}
            {...reorder.tabProps(String(tab.id), i)}
            onMouseDown={(e) => {
              if (e.button === 1) {
                e.preventDefault()
                void window.ide.projectTabs.close(tab.id)
              }
            }}
            onClick={() => {
              if (tab.id !== activeId) void window.ide.projectTabs.activate(tab.id)
            }}
            onContextMenu={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setMenu({ x: e.clientX, y: e.clientY, tab })
            }}
            title={tab.mode === 'terminal' ? 'Terminal' : tab.root}
          >
            {tab.mode === 'terminal' ? (
              <TerminalSquare size={13} strokeWidth={1.8} className="shrink-0" />
            ) : (
              <Folder
                size={13}
                strokeWidth={1.8}
                className={cn('shrink-0', tab.id === activeId ? 'text-ink-accent' : 'text-ink-muted')}
              />
            )}
            <span className="truncate">{tab.name}</span>
            {tab.awaiting && <AwaitingDot />}
          </Tab>
        ))}
        {/* Trailing drop target so a tab can be dragged to the end. */}
        <div {...reorder.endProps} className="relative h-7 w-2 shrink-0">
          {reorder.atEnd && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-1 left-0 z-10 w-0.5 rounded-full bg-ink-accent"
            />
          )}
        </div>
      </div>
      <Tooltip label="Open project in new tab" shortcut={openChord}>
        <button
          aria-label="Open project in new tab"
          onClick={() => void window.ide.projectTabs.open()}
          className="app-no-drag flex h-7 w-7 shrink-0 items-center justify-center rounded text-ink-muted hover:bg-ink-hover hover:text-ink-text"
        >
          <Plus size={14} strokeWidth={1.8} />
        </button>
      </Tooltip>

      {menu && (
        <div
          className="app-no-drag fixed z-50 min-w-[200px] rounded border border-ink-border bg-ink-elevated py-1 text-xs shadow-lg"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <MenuItem label="Close Tab" onClick={() => void window.ide.projectTabs.close(menu.tab.id)} />
          <MenuItem
            label="Move to New Window"
            disabled={tabs.length < 2}
            onClick={() => void window.ide.projectTabs.detach(menu.tab.id)}
          />
          <MenuItem label="Merge All Windows" onClick={() => void window.ide.projectTabs.mergeAll()} />
          {menu.tab.mode !== 'terminal' && (
            <>
              <div className="my-1 h-px bg-ink-border" />
              <MenuItem label="Copy Path" onClick={() => copyText(menu.tab.root)} />
            </>
          )}
        </div>
      )}
    </div>
  )
}
