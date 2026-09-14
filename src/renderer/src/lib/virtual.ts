/** Row index window to render for a fixed-height virtual list. */
export function visibleRange(
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number,
  count: number,
  overscan = 8
): { start: number; end: number; topPad: number; bottomPad: number } {
  if (count === 0 || rowHeight <= 0) return { start: 0, end: 0, topPad: 0, bottomPad: 0 }
  const first = Math.floor(scrollTop / rowHeight)
  const visible = Math.ceil(viewportHeight / rowHeight) + 1
  const start = Math.max(0, first - overscan)
  const end = Math.min(count, first + visible + overscan)
  return { start, end, topPad: start * rowHeight, bottomPad: (count - end) * rowHeight }
}
