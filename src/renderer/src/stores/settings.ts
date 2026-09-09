import { create } from 'zustand'
import { defaultSettings, normalizeSettings, type AppSettings } from '@shared/types'

interface SettingsStore {
  settings: AppSettings
  loaded: boolean
  /** Load from disk and subscribe to live changes. Returns an unsubscribe fn. */
  init: () => Promise<() => void>
  /** Merge a patch (writes to disk; the change echoes back via onChanged). */
  update: (patch: Partial<AppSettings>) => Promise<void>
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  settings: defaultSettings(),
  loaded: false,

  init: async () => {
    // Never let a settings failure break app boot — degrade to defaults.
    try {
      // main is schema-agnostic: normalize its raw payload so missing/unknown
      // fields fall back to defaults (this is the source of truth for the schema).
      set({ settings: normalizeSettings(await window.ide.settings.get()), loaded: true })
      // Any window / the JSON editor / an external edit all funnel through here.
      return window.ide.settings.onChanged((s) => set({ settings: normalizeSettings(s) }))
    } catch (e) {
      console.error('[ide] settings load failed (using defaults):', e)
      return () => {}
    }
  },

  update: async (patch) => {
    // Optimistic: reflect immediately, then persist. The broadcast will confirm.
    set((s) => ({ settings: normalizeSettings({ ...s.settings, ...patch }) }))
    await window.ide.settings.update(patch)
  }
}))
