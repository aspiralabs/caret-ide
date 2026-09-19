// ---------------------------------------------------------------------------
// Feature flags — ship code dark, turn it on per install.
//
// A flag hides a feature that is built but not ready for a release: its menu
// items, commands, settings rows, context-menu entries and boot behaviour all
// disappear while the code stays in the tree. Every flag has a compiled-in
// default (off for anything still being refined) and two overrides:
//
//   1. settings.json → `"features": { "terminalMode": true }`   (persisted)
//   2. env           → CARET_FEATURES="terminalMode,!editorMinimap" (this run)
//
// The env form is for `npm run dev` / smoke runs and never touches the file.
// Main resolves flags synchronously at boot (bootMode, menus); the renderer
// reads the same values off `AppSettings.features`. Flags are global-only —
// a project's `.caret/settings.json` cannot flip them.
//
// To release a feature: flip `default` to true (or delete the flag and its
// `isEnabled` checks). To add one: append to FEATURES; nothing else to wire.
// ---------------------------------------------------------------------------

export type FeatureId =
  | 'terminalMode'
  | 'fileTemplates'
  | 'workspaceFolders'
  | 'terminalInEditor'
  | 'editorMinimap'
  | 'checkForUpdates'

export interface FeatureDef {
  id: FeatureId
  /** Short human label (docs / a future Settings → Labs section). */
  label: string
  /** What turning it on exposes. */
  description: string
  /** Compiled-in value when neither settings.json nor the env says otherwise. */
  default: boolean
}

export const FEATURES: readonly FeatureDef[] = [
  {
    id: 'terminalMode',
    label: 'Terminal mode',
    description:
      'Launch into a bare terminal window at ~ (startupMode), New Terminal Window, Switch to IDE / Terminal, the Terminal layout preset and folder adoption.',
    default: false
  },
  {
    id: 'fileTemplates',
    label: 'New file from template',
    description: 'The "New File from Template…" entries in the explorer context menus.',
    default: false
  },
  {
    id: 'workspaceFolders',
    label: 'Workspace folders',
    description: 'Add / remove extra root folders from the explorer (multi-root workspaces).',
    default: false
  },
  {
    id: 'terminalInEditor',
    label: 'Terminal in editor area',
    description: 'The "Move to editor area" terminal tab action and terminal tabs in the center panel.',
    default: false
  },
  {
    id: 'editorMinimap',
    label: 'Editor minimap',
    description: "Monaco's minimap and its Settings → Editor toggle.",
    default: false
  },
  {
    id: 'checkForUpdates',
    label: 'Check for updates',
    description: 'View → Check for Updates…, the launch-time GitHub release check and its Settings toggle.',
    default: false
  }
]

export type FeatureFlags = Record<FeatureId, boolean>

export const FEATURE_IDS: readonly FeatureId[] = FEATURES.map((f) => f.id)

export function isFeatureId(id: unknown): id is FeatureId {
  return typeof id === 'string' && (FEATURE_IDS as readonly string[]).includes(id)
}

export function defaultFeatures(): FeatureFlags {
  const out = {} as FeatureFlags
  for (const f of FEATURES) out[f.id] = f.default
  return out
}

/**
 * Coerce the `features` value from settings.json. Unknown keys are ignored,
 * non-boolean values fall back to the default, anything that isn't an object
 * yields the defaults.
 */
export function normalizeFeatures(input: unknown): FeatureFlags {
  const out = defaultFeatures()
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out
  const o = input as Record<string, unknown>
  for (const id of FEATURE_IDS) if (typeof o[id] === 'boolean') out[id] = o[id] as boolean
  return out
}

/**
 * Parse a CARET_FEATURES env value into overrides. Comma / space separated
 * flag ids; a `!` or `-` prefix turns a flag off; `all` / `none` set every
 * flag at once (and can be followed by exceptions: `all,!terminalMode`).
 * Unknown ids are ignored so a stale env var can't break boot.
 */
export function parseFeatureEnv(value: string | undefined | null): Partial<FeatureFlags> {
  const out: Partial<FeatureFlags> = {}
  if (!value) return out
  for (const tokenRaw of value.split(/[,\s]+/)) {
    const token = tokenRaw.trim()
    if (!token) continue
    const off = token.startsWith('!') || token.startsWith('-')
    const name = off ? token.slice(1) : token
    if (name === 'all' || name === 'none') {
      const on = (name === 'all') !== off
      for (const id of FEATURE_IDS) out[id] = on
    } else if (isFeatureId(name)) {
      out[name] = !off
    }
  }
  return out
}

/**
 * Effective flags for a settings object (raw or normalised) plus an optional
 * env override. Env wins over the file, the file wins over the defaults.
 */
export function resolveFeatures(settings: unknown, env?: string | null): FeatureFlags {
  const fromFile =
    settings && typeof settings === 'object' ? (settings as { features?: unknown }).features : undefined
  return { ...normalizeFeatures(fromFile), ...parseFeatureEnv(env) }
}
