import { getEditor } from './editorBridge'
import { useTabsStore } from '../stores/tabs'
import { useLayoutStore } from '../stores/layout'

/** A position an editor should jump to once it mounts for that file. */
const pending = new Map<string, { line: number; column?: number }>()

/** Open `path` in a tab and move the caret to `line` (mounting-safe). */
export function openFileAt(path: string, line: number, column?: number): void {
  const tabs = useTabsStore.getState()
  const id = tabs.openFile(path)
  const layout = useLayoutStore.getState()
  if (!layout.centerVisible) layout.togglePanel('center')
  const editor = getEditor(id)
  if (editor?.revealLine) {
    editor.revealLine(line, column)
    editor.focus?.()
  } else {
    // Editor not mounted yet: it will consume this on mount.
    pending.set(path, { line, column })
  }
}

/** Called by an editor after mounting; returns (and clears) a queued jump. */
export function takePendingReveal(path: string): { line: number; column?: number } | undefined {
  const p = pending.get(path)
  pending.delete(path)
  return p
}
