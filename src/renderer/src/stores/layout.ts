import { create } from 'zustand'
import type { LayoutPreset, LayoutState, WorkspaceState } from '@shared/types'

export type PanelKey = 'left' | 'center' | 'right'

interface LayoutStore extends LayoutState {
  wordWrap: boolean
  defaultBrowserUrl: string

  /** Split view: tile all center (editor/browser) tabs instead of showing only the active one. */
  centerSplit: boolean
  /** Center tab ids whose pane is hidden in split view (via the tab's eye toggle).
   *  Ignored outside split mode. */
  hiddenCenterPanes: string[]
  /** Split view: tile all terminals instead of showing only the active one. */
  terminalSplit: boolean
  /** Terminal tab ids whose pane is hidden in split view (via the tab's eye toggle).
   *  Ignored outside split mode. */
  hiddenTerminalPanes: string[]
  /** True while a center-panel split divider is being dragged. Browser (native)
   *  views detach during the drag so the DOM can receive the mouse events. */
  centerResizing: boolean

  togglePanel: (key: PanelKey) => void
  setPanelSizes: (sizes: [number, number, number]) => void
  setWordWrap: (on: boolean) => void
  setDefaultBrowserUrl: (url: string) => void
  toggleCenterSplit: () => void
  toggleTerminalSplit: () => void
  /** Toggle whether a center tab's pane is shown in split view. */
  toggleCenterPaneHidden: (id: string) => void
  /** Toggle whether a terminal tab's pane is shown in split view. */
  toggleTerminalPaneHidden: (id: string) => void
  setCenterResizing: (on: boolean) => void
  /** Apply a layout preset: panel visibility + split flags (not panel sizes). */
  applyPreset: (preset: LayoutPreset) => void
  hydrate: (ws: WorkspaceState) => void
}

/** The five fields a preset controls, in the shape used for equality checks. */
export type LayoutShape = Pick<
  LayoutPreset,
  'leftVisible' | 'centerVisible' | 'rightVisible' | 'centerSplit' | 'terminalSplit'
>

/** True when the current layout matches a preset's captured fields exactly. */
export function layoutMatchesPreset(current: LayoutShape, preset: LayoutPreset): boolean {
  return (
    current.leftVisible === preset.leftVisible &&
    current.centerVisible === preset.centerVisible &&
    current.rightVisible === preset.rightVisible &&
    current.centerSplit === preset.centerSplit &&
    current.terminalSplit === preset.terminalSplit
  )
}

// --- Sticky panel widths ---------------------------------------------------
// panelSizes ([left, center, right] %) are treated as *sticky* widths: a panel
// that stays visible across a layout change keeps its width. Exactly one visible
// panel is the "filler" that expands to fill the remaining space — the center
// (editor) when visible, otherwise the right (terminal), otherwise the left. So
// toggling the editor never resizes the sidebar; the main area absorbs the slack.

/** Index (0/1/2) of the panel that fills leftover space, or -1 if none visible. */
export function fillerIndex(vis: [boolean, boolean, boolean]): number {
  if (vis[1]) return 1 // center / editor
  if (vis[2]) return 2 // right / terminal
  if (vis[0]) return 0 // left / files
  return -1
}

/** Build the [left, center, right] layout (summing to 100) for a visibility set,
 *  keeping every non-filler visible panel at its sticky width. */
export function computeLayout(
  vis: [boolean, boolean, boolean],
  sticky: readonly [number, number, number]
): [number, number, number] {
  const filler = fillerIndex(vis)
  const out: [number, number, number] = [0, 0, 0]
  if (filler === -1) return out
  let sumOthers = 0
  for (let i = 0; i < 3; i++) {
    if (i !== filler && vis[i]) {
      out[i] = sticky[i]
      sumOthers += sticky[i]
    }
  }
  out[filler] = Math.max(0, 100 - sumOthers)
  return out
}

export const useLayoutStore = create<LayoutStore>((set) => ({
  leftVisible: true,
  rightVisible: true,
  centerVisible: true,
  panelSizes: [20, 52, 28],
  wordWrap: false,
  defaultBrowserUrl: 'http://localhost:3000',
  centerSplit: false,
  hiddenCenterPanes: [],
  terminalSplit: false,
  hiddenTerminalPanes: [],
  centerResizing: false,

  togglePanel: (key) =>
    set((s) => {
      if (key === 'left') return { leftVisible: !s.leftVisible }
      if (key === 'right') return { rightVisible: !s.rightVisible }
      return { centerVisible: !s.centerVisible }
    }),
  setPanelSizes: (panelSizes) => set({ panelSizes }),
  setWordWrap: (wordWrap) => set({ wordWrap }),
  setDefaultBrowserUrl: (defaultBrowserUrl) => set({ defaultBrowserUrl }),
  toggleCenterSplit: () => set((s) => ({ centerSplit: !s.centerSplit })),
  toggleTerminalSplit: () => set((s) => ({ terminalSplit: !s.terminalSplit })),
  toggleCenterPaneHidden: (id) =>
    set((s) => ({
      hiddenCenterPanes: s.hiddenCenterPanes.includes(id)
        ? s.hiddenCenterPanes.filter((x) => x !== id)
        : [...s.hiddenCenterPanes, id]
    })),
  toggleTerminalPaneHidden: (id) =>
    set((s) => ({
      hiddenTerminalPanes: s.hiddenTerminalPanes.includes(id)
        ? s.hiddenTerminalPanes.filter((x) => x !== id)
        : [...s.hiddenTerminalPanes, id]
    })),
  setCenterResizing: (centerResizing) => set({ centerResizing }),
  applyPreset: (preset) =>
    set({
      leftVisible: preset.leftVisible,
      centerVisible: preset.centerVisible,
      rightVisible: preset.rightVisible,
      centerSplit: preset.centerSplit,
      terminalSplit: preset.terminalSplit
    }),
  hydrate: (ws) =>
    set({
      leftVisible: ws.layout.leftVisible,
      rightVisible: ws.layout.rightVisible,
      centerVisible: ws.layout.centerVisible,
      panelSizes: ws.layout.panelSizes,
      wordWrap: ws.wordWrap,
      defaultBrowserUrl: ws.defaultBrowserUrl
    })
}))
