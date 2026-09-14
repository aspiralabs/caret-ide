import type { DocSymbol } from './symbols'
import type { FormatResult } from '@shared/types'

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
  /** Open the editor's own find widget. */
  find?: () => void
  /** Open the editor's go-to-line prompt. */
  goToLine?: () => void
  /** The current selection (1-based inclusive lines), or null when empty. */
  getSelection?: () => { text: string; startLine: number; endLine: number } | null
  /** Move the caret to a 1-based line (and column) and scroll it into view. */
  revealLine?: (line: number, column?: number) => void
  /** Navigable symbols in the document (functions, classes, headings…). */
  getSymbols?: () => Promise<DocSymbol[]>
  /** Run Prettier on the buffer (applied as an edit; undo-able). */
  format?: () => Promise<FormatResult>
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
