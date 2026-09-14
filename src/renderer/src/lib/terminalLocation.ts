import { useTerminalsStore } from '../stores/terminals'
import { useTabsStore } from '../stores/tabs'
import { useLayoutStore } from '../stores/layout'

/**
 * Move a terminal into the editor area as a center tab (for a full-height
 * Claude session beside a file). The pty keeps running; the xterm remounts,
 * so scrollback restarts from the move.
 */
export function moveTerminalToCenter(id: string): void {
  const s = useTerminalsStore.getState()
  const t = s.terminals.find((x) => x.id === id)
  if (!t) return
  s.setLocation(id, 'center')
  useTabsStore.getState().openTerminalTab(id, s.displayLabel(t))
  const layout = useLayoutStore.getState()
  if (!layout.centerVisible) layout.togglePanel('center')
  // Keep the panel's active terminal sensible.
  if (s.activeId === id) {
    const next = s.terminals.find((x) => x.id !== id && x.location !== 'center')
    if (next) s.setActive(next.id)
  }
}

/** Bring a terminal back to the right panel (also when its center tab closes). */
export function moveTerminalToPanel(id: string): void {
  const s = useTerminalsStore.getState()
  if (!s.terminals.some((x) => x.id === id)) return
  s.setLocation(id, 'panel')
  s.setActive(id)
  const tabs = useTabsStore.getState()
  const tab = tabs.tabs.find((t) => t.kind === 'terminal' && t.terminalId === id)
  if (tab) tabs.closeTab(tab.id)
  const layout = useLayoutStore.getState()
  if (!layout.rightVisible) layout.togglePanel('right')
}

/** Terminals shown in the right panel (not moved to the center). */
export function panelTerminals<T extends { location?: 'panel' | 'center' }>(terminals: readonly T[]): T[] {
  return terminals.filter((t) => t.location !== 'center')
}
