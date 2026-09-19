// ---------------------------------------------------------------------------
// Feature flags in the main process (see shared/features.ts for the model).
//
// Main needs flags before any renderer exists — to pick the boot target and
// build menus — so it reads settings.json synchronously, the same way the
// startup theme colour and startup mode are read. The CARET_FEATURES env
// override is applied here and ALSO overlaid on every settings payload sent
// to a renderer, so both processes agree for the lifetime of the run without
// the override ever being written to disk.
// ---------------------------------------------------------------------------

import { readFileSync } from 'fs'
import { join } from 'path'
import { resolveFeatures, type FeatureFlags, type FeatureId } from '../shared/features'

export const FEATURE_ENV = 'CARET_FEATURES'

/** Parse raw settings.json text (or null for "no file") plus the env into flags. */
export function parseFeatures(raw: string | null, env: string | undefined = process.env[FEATURE_ENV]): FeatureFlags {
  let parsed: unknown = null
  if (raw !== null) {
    try {
      parsed = JSON.parse(raw)
    } catch {
      // Invalid JSON: same as no file — defaults + env.
    }
  }
  return resolveFeatures(parsed, env)
}

/** Synchronous read of the effective flags for this install (file + env). */
export function readFeatures(userData: string): FeatureFlags {
  let raw: string | null = null
  try {
    raw = readFileSync(join(userData, 'settings.json'), 'utf8')
  } catch {
    // No settings file yet (fresh install).
  }
  return parseFeatures(raw)
}

export function isEnabled(userData: string, id: FeatureId): boolean {
  return readFeatures(userData)[id]
}

/**
 * Overlay the env override on a settings object bound for a renderer. A no-op
 * when the env var is unset so main stays schema-agnostic in the normal case
 * (it never invents a `features` key the user didn't write).
 */
export function overlayFeatureEnv<T extends Record<string, unknown>>(
  settings: T,
  env: string | undefined = process.env[FEATURE_ENV]
): T {
  if (!env) return settings
  return { ...settings, features: resolveFeatures(settings, env) }
}
