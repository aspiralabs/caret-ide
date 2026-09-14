import { describe, expect, it } from 'vitest'
import { defaultSettings, normalizeSettings } from '@shared/types'
import { broadcastTargets, DEFAULT_TERMINAL_FONT, terminalOptionsFromSettings } from './terminalOptions'
import type { TerminalTab } from '../stores/terminals'

describe('terminalOptionsFromSettings (#42)', () => {
  it('maps settings and prepends a custom font family', () => {
    const o = terminalOptionsFromSettings({ ...defaultSettings(), terminalFontFamily: "Fira Code", terminalFontSize: 14 })
    expect(o.fontFamily).toBe(`'Fira Code', ${DEFAULT_TERMINAL_FONT}`)
    expect(o.fontSize).toBe(14)
    expect(terminalOptionsFromSettings(defaultSettings()).fontFamily).toBe(DEFAULT_TERMINAL_FONT)
  })
  it('clamps via normalizeSettings', () => {
    expect(normalizeSettings({ terminalFontSize: 2 }).terminalFontSize).toBe(8)
    expect(normalizeSettings({ terminalScrollback: -5 }).terminalScrollback).toBe(0)
    expect(normalizeSettings({ terminalCursorStyle: 'weird' }).terminalCursorStyle).toBe('block')
  })
})

describe('broadcastTargets (#43)', () => {
  const t = (id: string, ptyId: string | null, exited = false): TerminalTab => ({ id, ptyId, label: 'zsh', exited, foreground: null })
  it('excludes the sender, exited and unspawned terminals', () => {
    expect(broadcastTargets([t('a', 'p1'), t('b', 'p2'), t('c', null), t('d', 'p4', true)], 'p1')).toEqual(['p2'])
  })
})
