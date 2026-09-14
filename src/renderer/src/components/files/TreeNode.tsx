import { useEffect, useRef, type DragEvent } from 'react'
import { useFilesStore } from '../../stores/files'
import { useTabsStore } from '../../stores/tabs'
import { useLayoutStore } from '../../stores/layout'
import { useProjectStore } from '../../stores/project'
import { useSettingsStore } from '../../stores/settings'
import { useGitStore, changeFor, dirHasChanges, stateColorClass } from '../../stores/git'
import { fileIcon, Chevron } from './icons'
import { dropDirFor, entryShown, visibleOrder } from '../../lib/treeOps'
import { executeDrop, INTERNAL_DRAG_TYPE, planDrop } from '../../lib/treeDrop'
import type { DirEntry } from '@shared/types'

export interface NodeContextTarget {
  entry: DirEntry
  x: number
  y: number
}

interface TreeNodeProps {
  entry: DirEntry
  depth: number
  /** Open a context menu for a node at screen coords. */
  onContextMenu: (t: NodeContextTarget) => void
}

/**
 * A single row in the (flat, virtualised) file tree — FileBrowser computes the
 * visible rows from the store and renders only the on-screen window.
 * Directories toggle their children on click; files open (or reuse) a center
 * editor tab. ⌘-click / ⇧-click build a multi-selection. Rows are drag sources
 * (move within the tree, or drop on a terminal to type the path) and
 * directories are drop targets for both internal drags and files from Finder.
 */
export default function TreeNode({ entry, depth, onContextMenu }: TreeNodeProps): JSX.Element {
  const expanded = useFilesStore((s) => s.expanded.has(entry.path))
  const selected = useFilesStore((s) => s.selectedPaths.has(entry.path))
  const primary = useFilesStore((s) => s.selectedPath === entry.path)
  const loading = useFilesStore((s) => s.loading.has(entry.path))
  const isDropTarget = useFilesStore((s) => s.dropTarget === entry.path)
  const showIgnored = useSettingsStore((s) => s.settings.explorerShowIgnored)
  const showDotfiles = useSettingsStore((s) => s.settings.explorerShowDotfiles)
  // Visibility is decided by the parent's flat row list; keep the hook order stable regardless.
  // Git state: files take the colour of their change; folders get a dot when
  // anything beneath them changed (so what Claude just touched is findable).
  const gitState = useGitStore((s) => (entry.isDir ? undefined : changeFor(s.status, entry.path)?.state))
  const dirDirty = useGitStore((s) => (entry.isDir ? dirHasChanges(s.status, entry.path) : false))
  const rowRef = useRef<HTMLDivElement>(null)
  // Auto-reveal: when this row becomes the primary selection, bring it into view.
  useEffect(() => {
    if (primary) rowRef.current?.scrollIntoView({ block: 'nearest' })
  }, [primary])

  const handleClick = (e: React.MouseEvent): void => {
    const files = useFilesStore.getState()
    if (e.metaKey || e.shiftKey) {
      const root = useProjectStore.getState().info?.root ?? ''
      const order = e.shiftKey
        ? visibleOrder(root, files.children, files.expanded, (x) => entryShown(x, { showIgnored, showDotfiles }))
        : undefined
      files.select(entry.path, { toggle: e.metaKey, range: e.shiftKey, order })
      return
    }
    if (entry.isDir) {
      files.setSelected(entry.path)
      void files.toggleDir(entry.path)
    } else {
      files.setSelected(entry.path)
      useTabsStore.getState().openFile(entry.path)
      // Opening a file means the user wants to see it — reveal the center panel
      // if it's currently hidden.
      if (!useLayoutStore.getState().centerVisible) useLayoutStore.getState().togglePanel('center')
    }
  }

  // --- Drag source ------------------------------------------------------------
  const onDragStart = (e: DragEvent): void => {
    const files = useFilesStore.getState()
    // Dragging an unselected row drags just that row; a selected one drags the selection.
    const paths = files.selectedPaths.has(entry.path) ? [...files.selectedPaths] : [entry.path]
    if (!files.selectedPaths.has(entry.path)) files.setSelected(entry.path)
    e.dataTransfer.setData(INTERNAL_DRAG_TYPE, JSON.stringify(paths))
    // Plain text lets a terminal (or any text field) receive the path(s).
    e.dataTransfer.setData('text/plain', paths.join(' '))
    e.dataTransfer.effectAllowed = 'copyMove'
  }

  // --- Drop target (dirs, and files → their parent dir) ------------------------
  const destDir = dropDirFor(entry)
  const onDragOver = (e: DragEvent): void => {
    const types = Array.from(e.dataTransfer.types)
    if (!types.includes(INTERNAL_DRAG_TYPE) && !types.includes('Files')) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = types.includes('Files') && e.altKey ? 'copy' : 'move'
    if (useFilesStore.getState().dropTarget !== destDir) useFilesStore.getState().setDropTarget(destDir)
  }
  const onDrop = (e: DragEvent): void => {
    const plan = planDrop(e.dataTransfer, e.altKey)
    if (plan.kind === 'none') return
    e.preventDefault()
    e.stopPropagation()
    useFilesStore.getState().setDropTarget(null)
    void executeDrop(plan, destDir)
  }

  // Indent by depth. Leading 16px slot holds the chevron (folders) or file icon.
  const paddingLeft = 8 + depth * 12

  return (
    <div style={{ height: 24 }}>
      <div
        ref={rowRef}
        role="treeitem"
        aria-selected={selected}
        aria-expanded={entry.isDir ? expanded : undefined}
        draggable
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onClick={handleClick}
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
          // Right-clicking outside the current selection retargets it.
          if (!useFilesStore.getState().selectedPaths.has(entry.path)) useFilesStore.getState().setSelected(entry.path)
          onContextMenu({ entry, x: e.clientX, y: e.clientY })
        }}
        style={{ paddingLeft }}
        className={`flex h-[24px] cursor-pointer select-none items-center gap-1.5 rounded-md pr-2 text-[13px] leading-none ${
          selected ? 'bg-ink-active text-ink-text' : 'text-ink-tree hover:bg-ink-hover'
        } ${entry.ignored ? 'opacity-50' : ''} ${
          isDropTarget && entry.isDir ? 'ring-1 ring-inset ring-ink-accent bg-ink-accent/10' : ''
        }`}
        title={entry.path}
      >
        {/* Leading slot: rotating chevron for folders, colored icon for files.
            Both are 16px wide so names align (Cursor-style, no folder icon). */}
        <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center">
          {entry.isDir ? (
            <Chevron open={expanded} className="text-ink-muted" />
          ) : (
            fileIcon(entry.name)
          )}
        </span>
        <span className={`truncate ${gitState ? stateColorClass(gitState) : ''}`}>{entry.name}</span>
        {loading && entry.isDir && expanded && <span className="text-[10px] text-ink-muted">…</span>}
        {dirDirty && !expanded && (
          <span aria-label="Contains changes" className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400/80" />
        )}
      </div>

    </div>
  )
}
