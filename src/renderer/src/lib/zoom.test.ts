// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getPreviewZoom, nextZoom, zoom, ZOOM_STEPS } from './zoom'
import { useSettingsStore } from '../stores/settings'
import { useTabsStore } from '../stores/tabs'
import { defaultSettings } from '@shared/types'

describe('nextZoom', () => {
  it('steps through the table and clamps at both ends', () => {
    expect(nextZoom(1, 1)).toBe(1.1)
    expect(nextZoom(1, -1)).toBe(0.9)
    expect(nextZoom(3, 1)).toBe(3)
    expect(nextZoom(0.5, -1)).toBe(0.5)
    expect(nextZoom(1.3, 0)).toBe(1)
  })
  it('snaps an off-table value to the nearest step first', () => {
    expect(nextZoom(1.02, 1)).toBe(1.1)
    expect(nextZoom(1.22, -1)).toBe(1.1)
    expect(ZOOM_STEPS).toContain(1)
  })
})

describe('zoom (quick win #9)', () => {
  const setUi = vi.fn()
  const setPreview = vi.fn()
  const update = vi.fn(async () => {})
  beforeEach(() => {
    ;(window as unknown as { ide: unknown }).ide = {
      window: { setZoom: setUi },
      browser: { setZoom: setPreview },
      settings: { update }
    }
    setUi.mockClear()
    setPreview.mockClear()
    update.mockClear()
    useTabsStore.setState({ tabs: [], activeId: null })
    useSettingsStore.setState({ settings: defaultSettings() })
  })

  it('zooms the UI and persists it when no browser tab is active', async () => {
    useTabsStore.getState().openFile('/p/a.ts')
    zoom(1)
    expect(setUi).toHaveBeenCalledWith(1.1)
    expect(useSettingsStore.getState().settings.uiZoom).toBe(1.1)
    expect(update).toHaveBeenCalledWith({ uiZoom: 1.1 })
    expect(setPreview).not.toHaveBeenCalled()
  })

  it('zooms only the active preview page when a browser tab is active', () => {
    const id = useTabsStore.getState().newBrowserTab('http://localhost:3000')
    zoom(1)
    zoom(1)
    expect(setPreview).toHaveBeenLastCalledWith(id, 1.25)
    expect(getPreviewZoom(id)).toBe(1.25)
    zoom(0)
    expect(getPreviewZoom(id)).toBe(1)
    expect(setUi).not.toHaveBeenCalled()
    expect(useSettingsStore.getState().settings.uiZoom).toBe(1)
  })
})
