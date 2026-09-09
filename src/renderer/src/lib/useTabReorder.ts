import { useState, type DragEvent } from 'react'

export interface TabDragProps {
  draggable: boolean
  onDragStart: (e: DragEvent) => void
  onDragEnd: () => void
  onDragOver: (e: DragEvent) => void
  onDrop: (e: DragEvent) => void
}

export interface TabReorder {
  /** The id of the tab currently being dragged (dim it), or null. */
  draggingId: string | null
  /** Drag props to spread onto the tab at `index`. */
  tabProps: (id: string, index: number) => TabDragProps
  /**
   * Which edge of the tab at `index` should show the insertion bar.
   * Only ever 'left' — the gap after the last tab is owned by `endProps`.
   */
  indicatorSide: (index: number) => 'left' | 'right' | null
  /** Props for the trailing flex filler so a tab can be dropped at the end. */
  endProps: {
    onDragOver: (e: DragEvent) => void
    onDrop: (e: DragEvent) => void
  }
  /** True when the drop will land in the trailing gap (highlight the filler). */
  atEnd: boolean
}

/**
 * Drag-to-reorder for a horizontal tab strip. Computes the insertion point from
 * the cursor's position within the hovered tab (left/right half) so the drop
 * lands exactly where the indicator bar shows — shared by the center and
 * terminal tab bars.
 *
 * @param mime      dataTransfer type, unique per strip so strips don't accept each other's drags
 * @param getIds    current tab ids in order (read fresh on every drag event)
 * @param move      store action: splice `id` to `toIndex` in the post-removal array
 */
export function useTabReorder(
  mime: string,
  getIds: () => string[],
  move: (id: string, toIndex: number) => void
): TabReorder {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  // Insertion point as a gap index in [0, n]; null when no drag is in progress.
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  const finish = (): void => {
    setDraggingId(null)
    setDropIndex(null)
  }

  const commit = (e: DragEvent): void => {
    e.preventDefault()
    const dragged = e.dataTransfer.getData(mime)
    const ids = getIds()
    const target = dropIndex ?? ids.length
    if (dragged) {
      const from = ids.indexOf(dragged)
      // Removing the dragged tab shifts everything after it left by one, so a
      // gap index past the original position maps to one less post-removal.
      const to = from !== -1 && from < target ? target - 1 : target
      if (to !== from) move(dragged, to)
    }
    finish()
  }

  return {
    draggingId,
    tabProps: (id, index) => ({
      draggable: true,
      onDragStart: (e) => {
        e.dataTransfer.setData(mime, id)
        e.dataTransfer.effectAllowed = 'move'
        setDraggingId(id)
      },
      onDragEnd: finish,
      onDragOver: (e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        const rect = e.currentTarget.getBoundingClientRect()
        const after = e.clientX > rect.left + rect.width / 2
        setDropIndex(index + (after ? 1 : 0))
      },
      onDrop: commit
    }),
    indicatorSide: (index) => (dropIndex === index ? 'left' : null),
    endProps: {
      onDragOver: (e) => {
        e.preventDefault()
        setDropIndex(getIds().length)
      },
      onDrop: commit
    },
    atEnd: dropIndex !== null && dropIndex === getIds().length
  }
}
