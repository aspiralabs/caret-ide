// Per-file raw/preview memory for markdown editor tabs.
//
// While a markdown file's tab is open, we remember whichever mode the user last
// toggled it to, so switching tabs and back restores it (EditorView unmounts on
// tab switch). When the tab is *closed*, the entry is cleared — so reopening the
// file falls back to the `markdownDefaultOpenAs` setting (a fresh "new" open).
// Keyed by absolute file path. Session-only (in-memory).

const previewModeByPath = new Map<string, boolean>()

export function getPreviewMode(path: string): boolean | undefined {
  return previewModeByPath.get(path)
}

export function setPreviewMode(path: string, on: boolean): void {
  previewModeByPath.set(path, on)
}

/** Forget a file's remembered mode (call when its tab is closed). */
export function clearPreviewMode(path: string): void {
  previewModeByPath.delete(path)
}

/** Carry a file's remembered mode across a rename. */
export function retargetPreviewMode(oldPath: string, newPath: string): void {
  if (oldPath === newPath) return
  const v = previewModeByPath.get(oldPath)
  previewModeByPath.delete(oldPath)
  if (v !== undefined) previewModeByPath.set(newPath, v)
}
