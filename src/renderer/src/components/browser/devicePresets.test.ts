import { describe, expect, it } from 'vitest'
import { DEVICE_PRESETS, effectivePreviewWidth, presetLabel } from './devicePresets'

describe('device presets (quick win #10)', () => {
  it('fluid fills the pane; fixed widths letterbox but never exceed the pane', () => {
    expect(effectivePreviewWidth(null, 900)).toBe(900)
    expect(effectivePreviewWidth(undefined, 900)).toBe(900)
    expect(effectivePreviewWidth(375, 900)).toBe(375)
    expect(effectivePreviewWidth(1440, 900)).toBe(900)
    expect(effectivePreviewWidth(0, 900)).toBe(900)
  })
  it('labels presets and custom widths', () => {
    expect(presetLabel(null)).toBe('Fluid')
    expect(presetLabel(768)).toBe('Tablet · 768')
    expect(presetLabel(999)).toBe('999')
    expect(DEVICE_PRESETS[0].width).toBeNull()
  })
})
