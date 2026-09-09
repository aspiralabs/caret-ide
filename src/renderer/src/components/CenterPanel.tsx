import { Plus, Settings, Eye, EyeOff } from 'lucide-react'
import { useTabsStore, type CenterTab } from '../stores/tabs'
import { useLayoutStore } from '../stores/layout'
import { requestCloseTab } from '../hooks/useKeyboardShortcuts'
import { useTabReorder, type TabDragProps } from '../lib/useTabReorder'
import EditorView from './editor/EditorView'
import BrowserPane from './browser/BrowserPane'
import SettingsView from './settings/SettingsView'
import SettingsJsonView from './settings/SettingsJsonView'
import Tooltip from './Tooltip'
import Tab from './Tab'
import SplitToggle from './SplitToggle'
import SplitPanes, { type Pane } from './SplitPanes'
import { fileIcon } from './files/icons'
import { useCommandChord } from '../hooks/useCommandChord'
import { formatChord } from '../lib/keybindings'

function TabIcon({ tab }: { tab: CenterTab }): JSX.Element {
  if (tab.kind === 'browser') {
    return tab.favicon ? (
      <img src={tab.favicon} className="h-3.5 w-3.5" alt="" />
    ) : (
      <span className="text-ink-muted">🌐</span>
    )
  }
  if (tab.kind === 'settings') {
    return (
      <span className="inline-flex h-4 w-4 items-center justify-center text-ink-muted">
        <Settings size={14} strokeWidth={1.5} />
      </span>
    )
  }
  // Editor + settings.json tabs: same colored file-type icon as the file tree.
  return (
    <span className="inline-flex h-4 w-4 items-center justify-center">{fileIcon(tab.title)}</span>
  )
}

function TabButton({
  tab,
  active,
  split,
  hidden,
  canToggleHidden,
  dragProps,
  dropIndicator,
  dragging
}: {
  tab: CenterTab
  active: boolean
  /** Whether the center panel is in split view (controls the eye toggle). */
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
  const setActive = useTabsStore((s) => s.setActive)
  const togglePaneHidden = useLayoutStore((s) => s.toggleCenterPaneHidden)

  return (
    <Tab
      active={active}
      dimmed={split && hidden}
      className={dragging ? 'opacity-40' : ''}
      dropIndicator={dropIndicator}
      onClose={() => void requestCloseTab(tab.id)}
      {...dragProps}
      onMouseDown={(e) => {
        if (e.button === 1) {
          e.preventDefault()
          void requestCloseTab(tab.id)
        }
      }}
      onClick={() => setActive(tab.id)}
      title={tab.filePath ?? tab.url ?? tab.title}
    >
      <TabIcon tab={tab} />
      <span className="truncate">{tab.title}</span>
      {tab.dirty && <span className="ml-0.5 h-2 w-2 shrink-0 rounded-full bg-ink-text" />}
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
    </Tab>
  )
}

export default function CenterPanel(): JSX.Element {
  const { tabs, activeId, newBrowserTab } = useTabsStore()
  const newBrowserChord = useCommandChord('new-browser-tab')
  const split = useLayoutStore((s) => s.centerSplit)
  const toggleSplit = useLayoutStore((s) => s.toggleCenterSplit)
  const setResizing = useLayoutStore((s) => s.setCenterResizing)
  const hiddenCenterPanes = useLayoutStore((s) => s.hiddenCenterPanes)
  const reorder = useTabReorder(
    'text/tab',
    () => useTabsStore.getState().tabs.map((t) => t.id),
    (id, to) => useTabsStore.getState().moveTab(id, to)
  )

  // Which panes are hidden from the split, and how many remain visible (so we can
  // block hiding the last one — a split with nothing in it).
  const hiddenSet = new Set(hiddenCenterPanes.filter((id) => tabs.some((t) => t.id === id)))
  const visibleCount = tabs.length - hiddenSet.size

  // One pane per tab; content is mounted for every tab (not just the active one)
  // so toggling split — or the focused tab — never remounts editors/browsers.
  const paneNode = (t: CenterTab): JSX.Element => {
    switch (t.kind) {
      case 'editor':
        return <EditorView tab={t} />
      case 'browser':
        return <BrowserPane tab={t} />
      case 'settings':
        return <SettingsView />
      case 'settingsJson':
        return <SettingsJsonView tab={t} />
    }
  }
  const panes: Pane[] = tabs.map((t) => ({ key: t.id, node: paneNode(t) }))

  return (
    <div className="flex h-full min-w-0 flex-col bg-ink-bg">
      {/* Tab bar */}
      <div className="flex h-11 shrink-0 items-center border-b border-ink-border bg-ink-panel">
        <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-2">
          {tabs.map((t, i) => {
            const hidden = hiddenSet.has(t.id)
            return (
              <TabButton
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
          {tabs.length > 1 && <SplitToggle active={split} onToggle={toggleSplit} />}
          <Tooltip label="New browser tab" shortcut={newBrowserChord} align="right">
            <button
              aria-label="New browser tab"
              onClick={() => newBrowserTab()}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-transparent text-ink-muted transition-colors hover:bg-ink-hover hover:text-ink-text"
            >
              <Plus size={16} strokeWidth={1.8} />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Content */}
      <div className="relative min-h-0 flex-1">
        {panes.length > 0 ? (
          <SplitPanes
            panes={panes}
            split={split}
            hiddenKeys={hiddenSet}
            focusedKey={activeId}
            onFocusPane={(id) => {
              if (id !== activeId) useTabsStore.getState().setActive(id)
            }}
            onResizeStart={() => setResizing(true)}
            onResizeEnd={() => setResizing(false)}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-ink-muted">
            <div className="text-sm">No tabs open</div>
            <div className="text-xs">
              Open a file from the tree
              {newBrowserChord && (
                <>
                  , or press <kbd>{formatChord(newBrowserChord)}</kbd> for a browser tab
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
