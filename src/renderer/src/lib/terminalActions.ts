import { useTerminalsStore } from '../stores/terminals'

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

/** Kill the pty (if any) then remove the tab from the store (spec §5.4). */
export function closeTerminal(id: string): void {
  const tab = useTerminalsStore.getState().terminals.find((t) => t.id === id)
  if (!tab) return
  if (tab.ptyId) void window.ide.pty.kill(tab.ptyId)
  useTerminalsStore.getState().removeTerminal(id)
}
