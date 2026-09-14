import { useTerminalsStore } from '../stores/terminals'
import { useLayoutStore } from '../stores/layout'
import { useTabsStore } from '../stores/tabs'
import { focusTerminal, terminalHandle } from './terminalFocus'
import { adjacentMark, shellState } from './shellMarks'

/** Attribute TerminalView stamps on its wrapper so focus can be traced to a tab. */
export const TERMINAL_ID_ATTR = 'data-terminal-id'

/**
 * The terminal tab whose xterm currently holds keyboard focus, or null when
 * focus is anywhere else (editor, tree, URL bar…). Lets ⌘W act on the thing
 * the user is actually looking at instead of always closing a center tab.
 */
export function focusedTerminalId(activeElement: Element | null = document.activeElement): string | null {
  const host = activeElement?.closest?.(`[${TERMINAL_ID_ATTR}]`)
  return host?.getAttribute(TERMINAL_ID_ATTR) || null
}

/** Activate the terminal `dir` steps from the active one (wrapping). */
export function cycleTerminal(dir: 1 | -1): void {
  const { terminals, activeId, setActive } = useTerminalsStore.getState()
  if (terminals.length === 0) return
  const i = Math.max(0, terminals.findIndex((t) => t.id === activeId))
  const next = terminals[(i + dir + terminals.length) % terminals.length]
  setActive(next.id)
  focusTerminal(next.id)
}

/**
 * Put keyboard focus in the active terminal, revealing the right panel (and
 * creating a terminal) if needed. The xterm mounts on the next frame when the
 * panel was hidden, so focus is retried once after it.
 */
export function focusActiveTerminal(): void {
  const layout = useLayoutStore.getState()
  if (!layout.rightVisible) layout.togglePanel('right')
  let id = useTerminalsStore.getState().activeId
  if (!id) id = useTerminalsStore.getState().addTerminal()
  focusTerminal(id)
  const target = id
  requestAnimationFrame(() => focusTerminal(target))
}

/** The terminal a shell-integration command acts on: the focused one, else the active one. */
function targetTerminalId(): string | null {
  return focusedTerminalId() ?? useTerminalsStore.getState().activeId
}

/** Scroll to the previous / next command prompt (needs zsh shell integration). */
export function jumpToCommand(dir: 1 | -1): boolean {
  const id = targetTerminalId()
  if (!id) return false
  const h = terminalHandle(id)
  if (!h?.scrollToLine || !h.viewportTop) return false
  const line = adjacentMark(shellState(id).marks, h.viewportTop(), dir)
  if (line === null) return false
  h.scrollToLine(line)
  return true
}

/** Type the last command that ran in the terminal and press Enter. */
export function rerunLastCommand(): boolean {
  const id = targetTerminalId()
  if (!id) return false
  const t = useTerminalsStore.getState().terminals.find((x) => x.id === id)
  const cmds = shellState(id).commands
  const last = cmds[cmds.length - 1]
  if (!t?.ptyId || !last) return false
  window.ide.pty.write(t.ptyId, last + '\r')
  focusTerminal(id)
  return true
}

/** Kill the pty (if any) then remove the tab from the store (spec §5.4). */
export function closeTerminal(id: string): void {
  const tab = useTerminalsStore.getState().terminals.find((t) => t.id === id)
  if (!tab) return
  if (tab.ptyId) void window.ide.pty.kill(tab.ptyId)
  useTerminalsStore.getState().removeTerminal(id)
  // A terminal shown in the editor area takes its center tab with it.
  const tabs = useTabsStore.getState()
  const center = tabs.tabs.find((t) => t.kind === 'terminal' && t.terminalId === id)
  if (center) tabs.closeTab(center.id)
}
