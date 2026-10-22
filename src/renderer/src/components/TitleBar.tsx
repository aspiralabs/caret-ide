import { PanelLeft, PanelRight, Square, Settings, type LucideIcon } from 'lucide-react'
import { useLayoutStore, type PanelKey } from '../stores/layout'
import { useTabsStore } from '../stores/tabs'
import { useCommandChord } from '../hooks/useCommandChord'
import LayoutPresetSwitcher from './LayoutPresetSwitcher'
import ProjectTabs from './ProjectTabs'
import Tooltip from './Tooltip'
import { useFeature } from '../lib/features'
import { ensurePanelViaIde, togglePanelViaIde } from '../lib/terminalMode'

type Side = 'left' | 'center' | 'right'

// Left sidebar / center editor / right terminal. Active state is conveyed by the
// button's text color (brighter = visible), so plain outline icons are enough.
const PANEL_ICON: Record<Side, LucideIcon> = {
  left: PanelLeft,
  center: Square,
  right: PanelRight
}

export default function TitleBar(): JSX.Element {
  const { leftVisible, centerVisible, rightVisible } = useLayoutStore()
  const leftChord = useCommandChord('toggle-left')
  const centerChord = useCommandChord('toggle-center')
  const rightChord = useCommandChord('toggle-right')
  const projectTabs = useFeature('projectTabs')

  const buttons: {
    side: Side
    key: PanelKey
    active: boolean
    label: string
    shortcut?: string
  }[] = [
    {
      side: 'left',
      key: 'left',
      active: leftVisible,
      label: `${leftVisible ? 'Hide' : 'Show'} file browser`,
      shortcut: leftChord
    },
    {
      side: 'center',
      key: 'center',
      active: centerVisible,
      label: `${centerVisible ? 'Hide' : 'Show'} editor`,
      shortcut: centerChord
    },
    {
      side: 'right',
      key: 'right',
      active: rightVisible,
      label: `${rightVisible ? 'Hide' : 'Show'} terminal`,
      shortcut: rightChord
    }
  ]

  return (
    <div className="app-drag relative flex h-11 shrink-0 items-center border-b border-ink-border bg-ink-terminal pl-20 pr-2 text-xs">
      {projectTabs ? (
        // Project tabs take the strip; the preset switcher joins the right-hand controls.
        <div className="mr-3 flex min-w-0 flex-1 items-center">
          <ProjectTabs />
        </div>
      ) : (
        /* Layout preset switcher, centered (replaces the old project title). */
        <div className="absolute left-1/2 -translate-x-1/2">
          <LayoutPresetSwitcher />
        </div>
      )}
      <div className="app-no-drag ml-auto flex shrink-0 items-center gap-0.5">
        {projectTabs && (
          <div className="mr-2">
            <LayoutPresetSwitcher />
          </div>
        )}
        {buttons.map((b) => {
          const Icon = PANEL_ICON[b.side]
          return (
            <Tooltip key={b.key} label={b.label} shortcut={b.shortcut} align="right">
              <button
                aria-label={b.label}
                onClick={() => togglePanelViaIde(b.key)}
                className={`flex h-7 w-7 items-center justify-center rounded hover:bg-ink-hover ${
                  b.active ? 'text-ink-text' : 'text-ink-muted'
                }`}
              >
                <Icon size={15} strokeWidth={1.6} />
              </button>
            </Tooltip>
          )
        })}
        <div className="mx-1 h-4 w-px bg-ink-border" />
        <Tooltip label="Settings" align="right">
          <button
            aria-label="Settings"
            onClick={() => {
              useTabsStore.getState().openSingleton('settings')
              ensurePanelViaIde('center')
            }}
            className="flex h-7 w-7 items-center justify-center rounded text-ink-muted hover:bg-ink-hover hover:text-ink-text"
          >
            <Settings size={15} strokeWidth={1.6} />
          </button>
        </Tooltip>
      </div>
    </div>
  )
}
