import { describe, expect, it } from 'vitest'
import { defaultSettings } from '@shared/types'
import { applyProjectOverrides, overriddenKeys, parseProjectOverrides, projectSettingsPath } from './projectSettings'

const keys = Object.keys(defaultSettings()) as Array<keyof ReturnType<typeof defaultSettings>>

describe('project settings overrides (#52)', () => {
  it('keeps only known keys and reports errors', () => {
    expect(parseProjectOverrides('{"formatOnSave": true, "bogus": 1}', keys)).toEqual({ overrides: { formatOnSave: true } })
    expect(parseProjectOverrides('', keys)).toEqual({ overrides: {} })
    expect(parseProjectOverrides('[1]', keys).error).toMatch(/object/)
    expect(parseProjectOverrides('{oops', keys).error).toBeTruthy()
  })
  it('layers overrides over global settings and normalises', () => {
    const eff = applyProjectOverrides({ ...defaultSettings(), formatOnSave: false, editorFontSize: 13 }, { formatOnSave: true, editorFontSize: 99 })
    expect(eff.formatOnSave).toBe(true)
    expect(eff.editorFontSize).toBe(32) // clamped
    expect(overriddenKeys({ formatOnSave: true })).toEqual(['formatOnSave'])
    expect(projectSettingsPath('/p')).toBe('/p/.caret/settings.json')
  })
})
