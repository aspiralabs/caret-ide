import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { overlayFeatureEnv, parseFeatures, readFeatures } from './features'

describe('main feature flags', () => {
  it('parseFeatures: file, env, and junk', () => {
    expect(parseFeatures(null, '').terminalMode).toBe(false)
    expect(parseFeatures('{"features":{"terminalMode":true}}', '').terminalMode).toBe(true)
    expect(parseFeatures('{ nope', 'terminalMode').terminalMode).toBe(true)
    expect(parseFeatures('{"features":{"terminalMode":true}}', '!terminalMode').terminalMode).toBe(false)
  })

  it('overlayFeatureEnv is a no-op without the env var and never touches other keys', () => {
    const raw = { theme: 'dark', features: { terminalMode: true } }
    expect(overlayFeatureEnv(raw, undefined)).toBe(raw)
    const over = overlayFeatureEnv(raw, '!terminalMode,editorMinimap')
    expect(over.theme).toBe('dark')
    expect(over.features).toMatchObject({ terminalMode: false, editorMinimap: true })
    expect(raw.features.terminalMode).toBe(true)
  })

  describe('readFeatures', () => {
    let dir = ''
    afterEach(() => {
      if (dir) rmSync(dir, { recursive: true, force: true })
      delete process.env.CARET_FEATURES
    })
    it('reads settings.json synchronously and tolerates a missing file', () => {
      dir = mkdtempSync(join(tmpdir(), 'caret-features-'))
      delete process.env.CARET_FEATURES
      expect(readFeatures(dir).terminalMode).toBe(false)
      writeFileSync(join(dir, 'settings.json'), '{"features":{"terminalMode":true}}')
      expect(readFeatures(dir).terminalMode).toBe(true)
      process.env.CARET_FEATURES = '!terminalMode'
      expect(readFeatures(dir).terminalMode).toBe(false)
    })
  })
})
