import { create } from 'zustand'
import { defaultSettings, normalizeSettings, type AppSettings } from '@shared/types'
import { applyProjectOverrides, parseProjectOverrides, projectSettingsPath } from '../lib/projectSettings'

interface SettingsStore {
  /** Effective settings: global + the project's `.caret/settings.json` overrides. */
  settings: AppSettings
  /** The global settings alone (what the Settings UI edits). */
  global: AppSettings
  /** Keys overridden by the project file (banner in Settings). */
  projectOverrides: Partial<AppSettings>
  projectOverrideError: string | null
  loaded: boolean
  /** Load from disk and subscribe to live changes. Returns an unsubscribe fn. */
  init: () => Promise<() => void>
  /** Merge a patch into the GLOBAL settings (writes to disk; the change echoes back via onChanged). */
  update: (patch: Partial<AppSettings>) => Promise<void>
  /** (Re)load the project override file for `root`; call on boot and when it changes. */
  loadProjectOverrides: (root: string) => Promise<void>
}

const SETTING_KEYS = Object.keys(defaultSettings()) as Array<keyof AppSettings>

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: defaultSettings(),
  global: defaultSettings(),
  projectOverrides: {},
  projectOverrideError: null,
  loaded: false,

  init: async () => {
    // Never let a settings failure break app boot — degrade to defaults.
    try {
      // main is schema-agnostic: normalize its raw payload so missing/unknown
      // fields fall back to defaults (this is the source of truth for the schema).
      const global = normalizeSettings(await window.ide.settings.get())
      set({ global, settings: applyProjectOverrides(global, get().projectOverrides), loaded: true })
      // Any window / the JSON editor / an external edit all funnel through here.
      return window.ide.settings.onChanged((s) => {
        const g = normalizeSettings(s)
        set({ global: g, settings: applyProjectOverrides(g, get().projectOverrides) })
      })
    } catch (e) {
      console.error('[ide] settings load failed (using defaults):', e)
      return () => {}
    }
  },

  update: async (patch) => {
    // Optimistic: reflect immediately, then persist. The broadcast will confirm.
    set((s) => {
      const global = normalizeSettings({ ...s.global, ...patch })
      return { global, settings: applyProjectOverrides(global, s.projectOverrides) }
    })
    await window.ide.settings.update(patch)
  },

  loadProjectOverrides: async (root) => {
    let text = ''
    try {
      const res = await window.ide.fs.readFile(projectSettingsPath(root))
      text = res.binary ? '' : res.content
    } catch {
      /* no project file — fine */
    }
    const { overrides, error } = parseProjectOverrides(text, SETTING_KEYS)
    set((s) => ({
      projectOverrides: overrides,
      projectOverrideError: error ?? null,
      settings: applyProjectOverrides(s.global, overrides)
    }))
  }
}))
