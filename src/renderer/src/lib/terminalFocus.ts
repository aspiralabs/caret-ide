// ---------------------------------------------------------------------------
// Imperative focus registry for terminal xterm instances.
//
// Each mounted TerminalView registers a focus callback keyed by its tab id;
// callers (e.g. the browser "select element" flow) can then move keyboard focus
// to a specific terminal without threading refs through the component tree.
// ---------------------------------------------------------------------------

export interface TerminalHandle {
  focus: () => void
  /** Scroll so buffer `line` is at the top of the viewport. */
  scrollToLine?: (line: number) => void
  /** Buffer line currently at the top of the viewport. */
  viewportTop?: () => number
}

const registry = new Map<string, TerminalHandle>()

/** Register a terminal's handle; returns an unregister fn for cleanup. */
export function registerTerminalFocus(id: string, handle: (() => void) | TerminalHandle): () => void {
  const h: TerminalHandle = typeof handle === 'function' ? { focus: handle } : handle
  registry.set(id, h)
  return () => {
    if (registry.get(id) === h) registry.delete(id)
  }
}

/** Focus the terminal with this id, if it's currently mounted. */
export function focusTerminal(id: string): void {
  registry.get(id)?.focus()
}

export function terminalHandle(id: string): TerminalHandle | undefined {
  return registry.get(id)
}
