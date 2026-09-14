// Bridge so app-level actions (global ⌘S, dirty-close prompt) can drive the
// Monaco instance living inside an EditorView. Each EditorView registers a
// saver keyed by its tab id while mounted.

export interface EditorHandle {
  save: () => Promise<void>
  isDirty: () => boolean
  /** Move keyboard focus into the editor. */
  focus?: () => void
  /** Discard unsaved edits and reload the buffer from disk. */
  revert?: () => Promise<void>
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

/**
 * Save every dirty editor whose handle is mounted. Resolves with the ids
 * saved and any that failed (so callers can report rather than silently drop
 * a write error). Unmounted dirty tabs (none, since panes stay mounted) are
 * skipped.
 */
export async function saveAll(
  dirtyIds: string[]
): Promise<{ saved: string[]; failed: string[] }> {
  const saved: string[] = []
  const failed: string[] = []
  await Promise.all(
    dirtyIds.map(async (id) => {
      const h = registry.get(id)
      if (!h) return
      try {
        await h.save()
        saved.push(id)
      } catch {
        failed.push(id)
      }
    })
  )
  return { saved, failed }
}
