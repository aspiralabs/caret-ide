// ---------------------------------------------------------------------------
// Per-file Monaco model + saved-baseline cache for non-markdown editor tabs.
//
// Keyed by absolute path so switching tabs (which unmounts/remounts EditorView)
// preserves undo history and the on-disk baseline. Entries live exactly as long
// as the tab: `clearEditorDoc` (called from tabs.closeTab) disposes the model
// and forgets the baseline, so reopening a file always re-reads disk — no stale
// text, no resurrected "Don't Save" edits — and the TS worker doesn't keep
// every file ever opened. `retargetEditorDoc` carries the buffer across a
// rename so an open tab follows its file.
// ---------------------------------------------------------------------------

import type { FileTextMeta } from '@shared/types'

export const getFileMeta = (path: string): FileTextMeta | undefined => metas.get(path)
export const setFileMeta = (path: string, meta: FileTextMeta): void => void metas.set(path, meta)

/** Caret + first visible line, handed from one editor to the next (Preview ⇄ Source). */
export interface ViewPosition {
  line: number
  column: number
  topLine: number
}
const viewPositions = new Map<string, ViewPosition>()

/** Remember where the outgoing editor was before it unmounts. */
export const setViewPosition = (path: string, pos: ViewPosition): void => void viewPositions.set(path, pos)

/** One-shot: the position the incoming editor should restore, if any. */
export function takeViewPosition(path: string): ViewPosition | undefined {
  const p = viewPositions.get(path)
  viewPositions.delete(path)
  return p
}

/** The subset of Monaco's ITextModel we need — keeps this module test-friendly. */
export interface CachedModel {
  getValue: () => string
  isDisposed: () => boolean
  dispose: () => void
}

const models = new Map<string, CachedModel>()
const baselines = new Map<string, string>()
/** On-disk encoding / BOM / EOL per open file, sent back on save so it round-trips. */
const metas = new Map<string, FileTextMeta>()
/** Buffer text carried across a rename, consumed by the next mount at the new path. */
const pending = new Map<string, string>()

export function getEditorModel(path: string): CachedModel | undefined {
  const m = models.get(path)
  if (m && m.isDisposed()) {
    models.delete(path)
    return undefined
  }
  return m
}

export function setEditorModel(path: string, model: CachedModel): void {
  models.set(path, model)
}

export const getEditorBaseline = (path: string): string | undefined => baselines.get(path)
export const setEditorBaseline = (path: string, v: string): void => void baselines.set(path, v)
export const hasEditorBaseline = (path: string): boolean => baselines.has(path)

/**
 * Text the next model at `path` should be seeded with instead of the baseline
 * (unsaved edits carried over a rename). One-shot: reading it clears it.
 */
export function takePendingContent(path: string): string | undefined {
  const v = pending.get(path)
  pending.delete(path)
  return v
}

/** Forget everything about a file (tab closed): dispose the model, drop the baseline. */
export function clearEditorDoc(path: string): void {
  const m = models.get(path)
  if (m && !m.isDisposed()) m.dispose()
  models.delete(path)
  baselines.delete(path)
  pending.delete(path)
  metas.delete(path)
  viewPositions.delete(path)
}

/**
 * Move a file's editor state from `oldPath` to `newPath` after a rename. The
 * model's URI is path-bound, so it's disposed; its current text is stashed so
 * the remount at the new path shows the same (possibly unsaved) buffer, and
 * the baseline follows so the dirty flag is unchanged.
 */
export function retargetEditorDoc(oldPath: string, newPath: string): void {
  if (oldPath === newPath) return
  const m = models.get(oldPath)
  if (m) {
    if (!m.isDisposed()) {
      pending.set(newPath, m.getValue())
      m.dispose()
    }
    models.delete(oldPath)
  }
  const b = baselines.get(oldPath)
  if (b !== undefined) {
    baselines.set(newPath, b)
    baselines.delete(oldPath)
  }
  const p = pending.get(oldPath)
  if (p !== undefined) {
    pending.set(newPath, p)
    pending.delete(oldPath)
  }
  const meta = metas.get(oldPath)
  if (meta) {
    metas.set(newPath, meta)
    metas.delete(oldPath)
  }
  const vp = viewPositions.get(oldPath)
  if (vp) {
    viewPositions.set(newPath, vp)
    viewPositions.delete(oldPath)
  }
}

/** Test hook. */
export function _resetEditorModels(): void {
  for (const m of models.values()) if (!m.isDisposed()) m.dispose()
  models.clear()
  baselines.clear()
  pending.clear()
  metas.clear()
  viewPositions.clear()
}
