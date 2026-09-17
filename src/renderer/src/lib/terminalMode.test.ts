// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { terminalPreset } from '@shared/types'
import { applyTerminalLayout, terminalWindowTitle, trackTerminalWindowTitle } from './terminalMode'
import { useLayoutStore } from '../stores/layout'
import { useSettingsStore } from '../stores/settings'
import { useTerminalsStore } from '../stores/terminals'

describe('terminalWindowTitle (AC8)', () => {
  it('is "Terminal" before the first prompt, ~ at home, else the cwd basename', () => {
    expect(terminalWindowTitle(undefined, '/Users/me')).toBe('Terminal')
    expect(terminalWindowTitle('/Users/me', '/Users/me')).toBe('~')
    expect(terminalWindowTitle('/Users/me/notes', '/Users/me')).toBe('notes')
    expect(terminalWindowTitle('/', '/Users/me')).toBe('/')
  })

  it('follows the ACTIVE terminal as prompts arrive and tabs switch', () => {
    useTerminalsStore.setState({ terminals: [], activeId: null })
    const a = useTerminalsStore.getState().addTerminal()
    const b = useTerminalsStore.getState().addTerminal()
    const stop = trackTerminalWindowTitle('/Users/me')
    expect(document.title).toBe('Terminal')
    useTerminalsStore.getState().setCwd(b, '/Users/me/dev/app')
    expect(document.title).toBe('app')
    useTerminalsStore.getState().setCwd(a, '/Users/me')
    useTerminalsStore.getState().setActive(a)
    expect(document.title).toBe('~')
    stop()
    useTerminalsStore.getState().setCwd(a, '/tmp/x')
    expect(document.title).toBe('~')
  })
})

describe('applyTerminalLayout (AC21)', () => {
  beforeEach(() => {
    useLayoutStore.setState({ leftVisible: true, centerVisible: true, rightVisible: false, centerSplit: true, terminalSplit: true })
  })
  it('applies the user\'s Terminal preset when present', () => {
    const custom = { ...terminalPreset(), terminalSplit: true }
    useSettingsStore.setState((s) => ({ settings: { ...s.settings, layoutPresets: [custom] } }))
    applyTerminalLayout()
    const l = useLayoutStore.getState()
    expect([l.leftVisible, l.centerVisible, l.rightVisible, l.terminalSplit]).toEqual([false, false, true, true])
  })
  it('falls back to the built-in shape when the preset was deleted', () => {
    useSettingsStore.setState((s) => ({ settings: { ...s.settings, layoutPresets: [] } }))
    applyTerminalLayout()
    const l = useLayoutStore.getState()
    expect([l.leftVisible, l.centerVisible, l.rightVisible, l.centerSplit, l.terminalSplit]).toEqual([false, false, true, false, false])
  })
})
