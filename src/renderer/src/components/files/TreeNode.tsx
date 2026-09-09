import { useFilesStore } from '../../stores/files'
import { useTabsStore } from '../../stores/tabs'
import { fileIcon, Chevron } from './icons'
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
 * A single row in the file tree. Directories toggle their children on click;
 * files open (or reuse) a center editor tab. Children are read straight from
 * the files store, so external fs events (routed by App) re-render us for free.
 */
export default function TreeNode({ entry, depth, onContextMenu }: TreeNodeProps): JSX.Element {
  const expanded = useFilesStore((s) => s.expanded.has(entry.path))
  const selected = useFilesStore((s) => s.selectedPath === entry.path)
  const children = useFilesStore((s) => s.children[entry.path])
  const loading = useFilesStore((s) => s.loading.has(entry.path))

  const handleClick = (): void => {
    if (entry.isDir) {
      void useFilesStore.getState().toggleDir(entry.path)
    } else {
      useFilesStore.getState().setSelected(entry.path)
      useTabsStore.getState().openFile(entry.path)
    }
  }

  // Indent by depth. Leading 16px slot holds the chevron (folders) or file icon.
  const paddingLeft = 8 + depth * 12

  return (
    <div>
      <div
        role="treeitem"
        aria-selected={selected}
        aria-expanded={entry.isDir ? expanded : undefined}
        onClick={handleClick}
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
          useFilesStore.getState().setSelected(entry.path)
          onContextMenu({ entry, x: e.clientX, y: e.clientY })
        }}
        style={{ paddingLeft }}
        className={`flex h-[24px] cursor-pointer select-none items-center gap-1.5 rounded-md pr-2 text-[13px] leading-none ${
          selected ? 'bg-ink-active text-ink-text' : 'text-ink-tree hover:bg-ink-hover'
        } ${entry.ignored ? 'opacity-50' : ''}`}
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
        <span className="truncate">{entry.name}</span>
      </div>

      {/* Children, only when this dir is expanded. */}
      {entry.isDir && expanded && (
        <div role="group">
          {loading && children === undefined && (
            <div style={{ paddingLeft: paddingLeft + 16 }} className="py-0.5 text-[11px] text-ink-muted">
              loading…
            </div>
          )}
          {children?.map((child) => (
            <TreeNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              onContextMenu={onContextMenu}
            />
          ))}
        </div>
      )}
    </div>
  )
}
