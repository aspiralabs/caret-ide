import { useFilesStore } from '../stores/files'
import { useTabsStore } from '../stores/tabs'
import { useToastStore } from '../stores/toast'
import { basename, join } from './path'
import { canMoveInto } from './treeOps'

/** DataTransfer type carrying tree-internal drags (JSON array of absolute paths). */
export const INTERNAL_DRAG_TYPE = 'application/x-caret-paths'

export type DropPlan =
  | { kind: 'internal'; paths: string[] }
  | { kind: 'external'; files: File[]; mode: 'move' | 'copy' }
  | { kind: 'none' }

/**
 * What a drop onto the tree means: paths dragged within the tree move; files
 * from Finder are imported — moved by default, copied with ⌥ held (Finder's
 * own convention).
 */
export function planDrop(
  dt: { types: readonly string[]; getData: (t: string) => string; files: ArrayLike<File> },
  altKey: boolean
): DropPlan {
  if (dt.types.includes(INTERNAL_DRAG_TYPE)) {
    try {
      const paths = JSON.parse(dt.getData(INTERNAL_DRAG_TYPE)) as unknown
      if (Array.isArray(paths) && paths.every((p) => typeof p === 'string') && paths.length) {
        return { kind: 'internal', paths }
      }
    } catch {
      /* malformed */
    }
    return { kind: 'none' }
  }
  if (dt.types.includes('Files') && dt.files.length) {
    return { kind: 'external', files: Array.from(dt.files), mode: altKey ? 'copy' : 'move' }
  }
  return { kind: 'none' }
}

/** Human label for the drop overlay while a drag is over a folder. */
export function dropLabel(plan: 'internal' | 'external-move' | 'external-copy', destDir: string, root: string): string {
  const where = destDir === root ? 'project root' : basename(destDir)
  const verb = plan === 'external-copy' ? 'Copy into' : 'Move into'
  return `${verb} ${where}${plan === 'external-move' ? '  (hold ⌥ to copy)' : ''}`
}

/** Carry out a planned drop into `destDir`. Reports failures via toast. */
export async function executeDrop(plan: DropPlan, destDir: string): Promise<void> {
  const toast = useToastStore.getState()
  if (plan.kind === 'internal') {
    const movable = plan.paths.filter((p) => canMoveInto(p, destDir))
    let failed = 0
    for (const src of movable) {
      const dest = join(destDir, basename(src))
      try {
        await window.ide.fs.rename(src, dest)
        useTabsStore.getState().retargetFile(src, dest)
      } catch (err) {
        failed++
        toast.show(`Couldn't move ${basename(src)}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    if (movable.length && !failed) useFilesStore.getState().setSelected(join(destDir, basename(movable[0])))
    return
  }
  if (plan.kind === 'external') {
    const sources = plan.files.map((f) => window.ide.files.pathForFile(f)).filter(Boolean)
    if (!sources.length) return
    const res = await window.ide.fs.importPaths(sources, destDir, plan.mode)
    for (const f of res.failed) toast.show(`Couldn't ${plan.mode} ${basename(f.source)}: ${f.error}`)
    if (res.imported.length) {
      await useFilesStore.getState().expandDir(destDir).catch(() => {})
      useFilesStore.getState().setSelected(res.imported[0])
      if (res.imported.length > 1) toast.show(`${plan.mode === 'copy' ? 'Copied' : 'Moved'} ${res.imported.length} items into ${basename(destDir)}`)
    }
  }
}
