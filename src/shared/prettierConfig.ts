// Pure helpers for the Prettier integration (no prettier / electron imports).

export type PrettierOptions = Record<string, unknown>

/**
 * Parse the global Prettier config the user pasted into Settings. Accepts a
 * JSON object (the contents of a `.prettierrc` / `.prettierrc.json`); blank
 * → no config. Returns an error message for anything else so the Settings UI
 * can show it instead of silently formatting with defaults.
 */
export function parseGlobalPrettierConfig(text: string): { options: PrettierOptions | null; error?: string } {
  const t = text.trim()
  if (!t) return { options: null }
  try {
    const v = JSON.parse(t)
    if (!v || typeof v !== 'object' || Array.isArray(v)) return { options: null, error: 'Config must be a JSON object' }
    return { options: v as PrettierOptions }
  } catch (err) {
    return { options: null, error: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/**
 * Which options a format run uses: the project's own resolved config wins
 * (`.prettierrc*`, `prettier` in package.json, .editorconfig); with none, the
 * global config from Settings; else Prettier defaults.
 */
export function chooseConfig(
  projectConfig: PrettierOptions | null,
  globalText: string
): { options: PrettierOptions; source: 'project' | 'global' | 'defaults' } {
  if (projectConfig) return { options: projectConfig, source: 'project' }
  const { options } = parseGlobalPrettierConfig(globalText)
  if (options) return { options, source: 'global' }
  return { options: {}, source: 'defaults' }
}

/** Files above this size are never formatted (keeps the UI responsive). */
export const MAX_FORMAT_BYTES = 1024 * 1024
