import { describe, expect, it } from 'vitest'
import { tooltipPosition, TOOLTIP_EDGE, TOOLTIP_GAP } from './tooltipPosition'

const vp = { width: 1000, height: 800 }
const tip = { width: 100, height: 24 }
const trigger = { x: 500, y: 400, width: 40, height: 20 }

describe('tooltipPosition', () => {
  it('places above / below with each alignment', () => {
    expect(tooltipPosition(trigger, tip, 'bottom', 'center', vp)).toEqual({
      left: 470,
      top: 420 + TOOLTIP_GAP
    })
    expect(tooltipPosition(trigger, tip, 'top', 'left', vp)).toEqual({
      left: 500,
      top: 400 - TOOLTIP_GAP - 24
    })
    expect(tooltipPosition(trigger, tip, 'top', 'right', vp)).toEqual({
      left: 440,
      top: 400 - TOOLTIP_GAP - 24
    })
  })

  it('places beside the trigger, vertically centred, for left / right', () => {
    expect(tooltipPosition(trigger, tip, 'left', 'center', vp)).toEqual({
      left: 500 - TOOLTIP_GAP - 100,
      top: 398
    })
    expect(tooltipPosition(trigger, tip, 'right', 'center', vp)).toEqual({
      left: 540 + TOOLTIP_GAP,
      top: 398
    })
  })

  it('keeps a status-bar tooltip inside the bar strip, not over the content above it', () => {
    // A badge at the bottom-right of an 800px-tall window; the bar is 36px.
    const badge = { x: 900, y: 772, width: 60, height: 20 }
    const pos = tooltipPosition(badge, tip, 'left', 'center', vp)
    expect(pos.top).toBeGreaterThanOrEqual(764) // bar top
    expect(pos.top + tip.height).toBeLessThanOrEqual(800)
    expect(pos.left + tip.width).toBeLessThan(900)
  })

  it('clamps to the viewport edges', () => {
    const edge = { x: 990, y: 2, width: 8, height: 8 }
    expect(tooltipPosition(edge, tip, 'top', 'right', vp)).toEqual({
      left: 1000 - TOOLTIP_EDGE - 100,
      top: TOOLTIP_EDGE
    })
    expect(tooltipPosition(edge, tip, 'right', 'center', vp).left).toBe(1000 - TOOLTIP_EDGE - 100)
    const origin = { x: 0, y: 0, width: 8, height: 8 }
    expect(tooltipPosition(origin, tip, 'left', 'center', vp)).toEqual({
      left: TOOLTIP_EDGE,
      top: TOOLTIP_EDGE
    })
  })
})
