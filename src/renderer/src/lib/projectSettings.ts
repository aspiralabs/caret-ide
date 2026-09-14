import { normalizeSettings, type AppSettings } from '@shared/types'
import { join } from './path'

export const PROJECT_SETTINGS_FILE = '.caret/settings.json'

export const projectSettingsPath = (root: string): string => join(root, PROJECT_SETTINGS_FILE)

/**
 * Parse a project's `.caret/settings.json` into an override object. Only
 * keys that exist in AppSettings are kept; invalid JSON → {} plus an error.
 */
export function parseProjectOverrides(text: string, keys: ReadonlyArray<keyof AppSettings>): { overrides: Partial<AppSettings>; error?: string } {
  const t = text.trim()
  if (!t) return { overrides: {} }
  try {
    const v = JSON.parse(t)
    if (!v || typeof v !== 'object' || Array.isArray(v)) return { overrides: {}, error: 'must be a JSON object' }
    const out: Record<string, unknown> = {}
    for (const k of keys) if (k in v) out[k] = (v as Record<string, unknown>)[k]
    return { overrides: out as Partial<AppSettings> }
  } catch (err) {
    return { overrides: {}, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Effective settings: project overrides layered on the global ones, then normalised. */
export function applyProjectOverrides(global: Partial<AppSettings>, overrides: Partial<AppSettings>): AppSettings {
  return normalizeSettings({ ...global, ...overrides })
}

/** Names of the settings the project file overrides (for the Settings banner). */
export function overriddenKeys(overrides: Partial<AppSettings>): string[] {
  return Object.keys(overrides)
}
