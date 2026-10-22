import { describe, expect, it } from 'vitest'
import {
  FEATURES,
  FEATURE_IDS,
  defaultFeatures,
  isFeatureId,
  normalizeFeatures,
  parseFeatureEnv,
  resolveFeatures
} from './features'

describe('feature flags', () => {
  // Released features stay on by default but keep their flag as a kill switch.
  const RELEASED = new Set(['projectTabs', 'awaitingNotify', 'restoreProjects'])

  it('ships every unreleased flag off by default (features are hidden until released)', () => {
    for (const f of FEATURES) expect(f.default).toBe(RELEASED.has(f.id))
    expect(Object.keys(defaultFeatures()).sort()).toEqual([...FEATURE_IDS].sort())
  })

  it('normalizes the settings.json `features` object, ignoring junk', () => {
    expect(normalizeFeatures(undefined)).toEqual(defaultFeatures())
    expect(normalizeFeatures('terminalMode')).toEqual(defaultFeatures())
    expect(normalizeFeatures(['terminalMode'])).toEqual(defaultFeatures())
    const f = normalizeFeatures({ terminalMode: true, editorMinimap: 'yes', bogus: true })
    expect(f.terminalMode).toBe(true)
    expect(f.editorMinimap).toBe(false)
    expect('bogus' in f).toBe(false)
  })

  it('parses CARET_FEATURES with on/off tokens and all/none', () => {
    expect(parseFeatureEnv(undefined)).toEqual({})
    expect(parseFeatureEnv('')).toEqual({})
    expect(parseFeatureEnv('terminalMode')).toEqual({ terminalMode: true })
    expect(parseFeatureEnv('terminalMode, !editorMinimap -fileTemplates')).toEqual({
      terminalMode: true,
      editorMinimap: false,
      fileTemplates: false
    })
    expect(parseFeatureEnv('nope,terminalMode')).toEqual({ terminalMode: true })
    const all = parseFeatureEnv('all,!terminalMode')
    for (const id of FEATURE_IDS) expect(all[id]).toBe(id !== 'terminalMode')
    const none = parseFeatureEnv('none')
    for (const id of FEATURE_IDS) expect(none[id]).toBe(false)
  })

  it('resolves env over file over defaults', () => {
    const file = { features: { terminalMode: true, editorMinimap: true } }
    expect(resolveFeatures(file).terminalMode).toBe(true)
    expect(resolveFeatures(file, '!terminalMode').terminalMode).toBe(false)
    expect(resolveFeatures(file, '!terminalMode').editorMinimap).toBe(true)
    expect(resolveFeatures(null, 'fileTemplates').fileTemplates).toBe(true)
    expect(resolveFeatures({}, undefined)).toEqual(defaultFeatures())
  })

  it('recognises flag ids', () => {
    expect(isFeatureId('terminalMode')).toBe(true)
    expect(isFeatureId('terminal-mode')).toBe(false)
    expect(isFeatureId(3)).toBe(false)
  })
})
