import { useSettingsStore } from '../stores/settings'
import { useTabsStore } from '../stores/tabs'

/** Zoom steps (factor, 1 = 100%), shared by the UI and the preview. */
export const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3]

/** The next step above/below `current` (clamped at the ends); 0 resets to 1. */
export function nextZoom(current: number, dir: 1 | -1 | 0): number {
  if (dir === 0) return 1
  // Index of the nearest step, then move one in `dir`.
  let i = 0
  let best = Infinity
  ZOOM_STEPS.forEach((z, idx) => {
    const d = Math.abs(z - current)
    if (d < best) {
      best = d
      i = idx
    }
  })
  return ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, i + dir))]
}

/** Per-tab preview zoom factors (transient; a tab's page keeps it until closed). */
const previewZoom = new Map<string, number>()

export const getPreviewZoom = (tabId: string): number => previewZoom.get(tabId) ?? 1

/**
 * Zoom whichever thing the user is looking at: the active browser tab's page,
 * else the whole app UI (persisted in settings as `uiZoom`).
 */
export function zoom(dir: 1 | -1 | 0): void {
  const active = useTabsStore.getState().getActive()
  if (active?.kind === 'browser') {
    const next = nextZoom(getPreviewZoom(active.id), dir)
    previewZoom.set(active.id, next)
    window.ide.browser.setZoom(active.id, next)
    return
  }
  const settings = useSettingsStore.getState()
  const next = nextZoom(settings.settings.uiZoom, dir)
  window.ide.window.setZoom(next)
  void settings.update({ uiZoom: next })
}

/** Apply the persisted UI zoom (boot, and whenever settings change). */
export function applyUiZoom(factor: number): void {
  window.ide.window.setZoom(factor)
}
