// ---------------------------------------------------------------------------
// Imperative focus registry for terminal xterm instances.
//
// Each mounted TerminalView registers a focus callback keyed by its tab id;
// callers (e.g. the browser "select element" flow) can then move keyboard focus
// to a specific terminal without threading refs through the component tree.
// ---------------------------------------------------------------------------

const registry = new Map<string, () => void>()

/** Register a terminal's focus fn; returns an unregister fn for cleanup. */
export function registerTerminalFocus(id: string, focus: () => void): () => void {
  registry.set(id, focus)
  return () => {
    if (registry.get(id) === focus) registry.delete(id)
  }
}

/** Focus the terminal with this id, if it's currently mounted. */
export function focusTerminal(id: string): void {
  registry.get(id)?.()
}
