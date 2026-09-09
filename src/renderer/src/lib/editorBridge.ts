// Bridge so app-level actions (global ⌘S, dirty-close prompt) can drive the
// Monaco instance living inside an EditorView. Each EditorView registers a
// saver keyed by its tab id while mounted.

export interface EditorHandle {
  save: () => Promise<void>
  isDirty: () => boolean
}

const registry = new Map<string, EditorHandle>()

export function registerEditor(tabId: string, handle: EditorHandle): () => void {
  registry.set(tabId, handle)
  return () => {
    if (registry.get(tabId) === handle) registry.delete(tabId)
  }
}

export function getEditor(tabId: string): EditorHandle | undefined {
  return registry.get(tabId)
}
