export type TooltipSide = 'top' | 'bottom' | 'left' | 'right'
export type TooltipAlign = 'center' | 'left' | 'right'

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** Gap between the trigger and the tooltip, and the minimum inset from the viewport edge. */
export const TOOLTIP_GAP = 6
export const TOOLTIP_EDGE = 4

/**
 * Where to place a fixed-position tooltip of `tip` size next to `trigger`
 * (viewport coordinates). `side` picks the edge; `align` sets the cross-axis
 * anchoring for top/bottom (which trigger edge the tooltip lines up with).
 * The result is clamped so the tooltip stays fully inside `viewport`.
 */
export function tooltipPosition(
  trigger: Box,
  tip: { width: number; height: number },
  side: TooltipSide,
  align: TooltipAlign,
  viewport: { width: number; height: number }
): { left: number; top: number } {
  let left: number
  let top: number
  if (side === 'left' || side === 'right') {
    top = trigger.y + trigger.height / 2 - tip.height / 2
    left = side === 'left' ? trigger.x - TOOLTIP_GAP - tip.width : trigger.x + trigger.width + TOOLTIP_GAP
  } else {
    top = side === 'top' ? trigger.y - TOOLTIP_GAP - tip.height : trigger.y + trigger.height + TOOLTIP_GAP
    left =
      align === 'left'
        ? trigger.x
        : align === 'right'
          ? trigger.x + trigger.width - tip.width
          : trigger.x + trigger.width / 2 - tip.width / 2
  }
  const maxLeft = Math.max(TOOLTIP_EDGE, viewport.width - TOOLTIP_EDGE - tip.width)
  const maxTop = Math.max(TOOLTIP_EDGE, viewport.height - TOOLTIP_EDGE - tip.height)
  return {
    left: Math.round(Math.min(Math.max(TOOLTIP_EDGE, left), maxLeft)),
    top: Math.round(Math.min(Math.max(TOOLTIP_EDGE, top), maxTop))
  }
}
