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

import { vi } from 'vitest'
import { applyPresetViaIde, offerPromotion, switchToIde, togglePanelViaIde } from './terminalMode'
import { useProjectStore } from '../stores/project'
import { useToastStore } from '../stores/toast'
import { defaultLayoutPresets } from '@shared/types'

describe('switchToIde (spec §3.4)', () => {
  const HOME = '/Users/me'
  const setRoots = vi.fn(async (roots: string[]) => roots)
  const ptyCwd = vi.fn(async () => '/Users/me/dev/app')
  const probe = vi.fn(async () => ({ recent: false, hasGit: false, hasPackageJson: false }))
  const sessionWatch = vi.fn(async () => undefined)
  const openPath = vi.fn(async () => undefined)

  beforeEach(() => {
    setRoots.mockClear()
    ptyCwd.mockClear()
    probe.mockReset().mockResolvedValue({ recent: false, hasGit: false, hasPackageJson: false })
    sessionWatch.mockClear()
    openPath.mockClear()
    ;(window as unknown as { ide: unknown }).ide = {
      project: { setRoots, probe },
      pty: { cwd: ptyCwd },
      session: { watch: sessionWatch },
      welcome: { openPath },
      fs: { readFile: async () => { throw new Error('no .caret') } },
      git: { status: async () => ({ isRepo: false, files: [] }) }
    }
    useProjectStore.setState({ info: null, extraRoots: [], workspaceRoot: null, mode: 'project' })
    useProjectStore.getState().setInfo({ root: HOME, name: 'Terminal', mode: 'terminal' })
    useTerminalsStore.setState({ terminals: [], activeId: null })
    useToastStore.setState({ toasts: [] })
    useSettingsStore.setState((s) => ({ settings: { ...s.settings, layoutPresets: defaultLayoutPresets() } }))
    applyTerminalLayout()
  })

  const layout = (): [boolean, boolean, boolean] => {
    const l = useLayoutStore.getState()
    return [l.leftVisible, l.centerVisible, l.rightVisible]
  }

  it('adopts the ACTIVE terminal cwd (OSC 7), starts the session watcher, shows Full (AC13, AC16)', async () => {
    const a = useTerminalsStore.getState().addTerminal()
    const b = useTerminalsStore.getState().addTerminal()
    useTerminalsStore.getState().setCwd(a, '/Users/me/notes')
    useTerminalsStore.getState().setCwd(b, '/Users/me/other')
    useTerminalsStore.getState().setActive(a)
    await switchToIde()
    expect(useProjectStore.getState().extraRoots).toEqual(['/Users/me/notes'])
    expect(useProjectStore.getState().workspaceRoot).toBe('/Users/me/notes')
    expect(sessionWatch).toHaveBeenCalledTimes(1)
    expect(ptyCwd).not.toHaveBeenCalled()
    expect(layout()).toEqual([true, true, true])
  })

  it('falls back to lsof through main when OSC 7 has not reported yet', async () => {
    const id = useTerminalsStore.getState().addTerminal()
    useTerminalsStore.getState().setPty(id, 'pty_1')
    await switchToIde()
    expect(ptyCwd).toHaveBeenCalledWith('pty_1')
    expect(useProjectStore.getState().extraRoots).toEqual(['/Users/me/dev/app'])
  })

  it('never adds a duplicate or a subfolder of an existing root (AC15)', async () => {
    const id = useTerminalsStore.getState().addTerminal()
    useTerminalsStore.getState().setCwd(id, '/Users/me/notes')
    await switchToIde()
    useTerminalsStore.getState().setCwd(id, '/Users/me/notes/2026')
    await switchToIde()
    await switchToIde()
    expect(useProjectStore.getState().extraRoots).toEqual(['/Users/me/notes'])
    expect(setRoots).toHaveBeenCalledTimes(1)
    expect(sessionWatch).toHaveBeenCalledTimes(1)
  })

  it('does not adopt ~ itself, but still shows the panels', async () => {
    const id = useTerminalsStore.getState().addTerminal()
    useTerminalsStore.getState().setCwd(id, HOME)
    await switchToIde()
    expect(setRoots).not.toHaveBeenCalled()
    expect(useProjectStore.getState().extraRoots).toEqual([])
    expect(layout()).toEqual([true, true, true])
  })

  it('with no readable cwd: a toast, and nothing else for the bare command (AC17)', async () => {
    ptyCwd.mockResolvedValueOnce(null as never)
    const id = useTerminalsStore.getState().addTerminal()
    useTerminalsStore.getState().setPty(id, 'pty_1')
    await switchToIde()
    expect(useToastStore.getState().toasts.map((t) => t.message)).toEqual(["Couldn't read the terminal's folder — nothing to browse yet."])
    expect(setRoots).not.toHaveBeenCalled()
    expect(layout()).toEqual([false, false, true])
  })

  it('with no live shell at all, an explicit preset click still applies the layout', async () => {
    await switchToIde({ preset: defaultLayoutPresets()[0] })
    expect(layout()).toEqual([true, true, true])
    expect(useToastStore.getState().toasts).toHaveLength(1)
  })

  it('Terminal preset from IDE mode hides panels but keeps roots; Full restores without re-adding (AC18)', async () => {
    const id = useTerminalsStore.getState().addTerminal()
    useTerminalsStore.getState().setCwd(id, '/Users/me/notes')
    applyPresetViaIde(defaultLayoutPresets()[0])
    await new Promise((r) => setTimeout(r, 0))
    expect(layout()).toEqual([true, true, true])
    applyPresetViaIde(terminalPreset())
    expect(layout()).toEqual([false, false, true])
    expect(useProjectStore.getState().extraRoots).toEqual(['/Users/me/notes'])
    applyPresetViaIde(defaultLayoutPresets()[0])
    await new Promise((r) => setTimeout(r, 0))
    expect(layout()).toEqual([true, true, true])
    expect(setRoots).toHaveBeenCalledTimes(1)
  })

  it('⌘B in a terminal-mode window adopts the cwd before showing the explorer; ⌘J is a plain toggle', async () => {
    const id = useTerminalsStore.getState().addTerminal()
    useTerminalsStore.getState().setCwd(id, '/Users/me/notes')
    togglePanelViaIde('left')
    await new Promise((r) => setTimeout(r, 0))
    expect(useProjectStore.getState().extraRoots).toEqual(['/Users/me/notes'])
    expect(layout()).toEqual([true, false, true])
    togglePanelViaIde('left')
    expect(layout()).toEqual([false, false, true])
    togglePanelViaIde('right')
    expect(layout()).toEqual([false, false, false])
    expect(setRoots).toHaveBeenCalledTimes(1)
  })

  it('in a project window the preset switcher and toggles are untouched (AC27)', async () => {
    useProjectStore.getState().setInfo({ root: '/p', name: 'p', mode: 'project' })
    applyPresetViaIde(defaultLayoutPresets()[0])
    togglePanelViaIde('left')
    expect(layout()).toEqual([false, true, true])
    expect(setRoots).not.toHaveBeenCalled()
    expect(ptyCwd).not.toHaveBeenCalled()
  })

  it('offers promotion once per folder when it looks like a project (AC19)', async () => {
    probe.mockResolvedValue({ recent: false, hasGit: true, hasPackageJson: false })
    await offerPromotion('/Users/me/dev/app')
    await offerPromotion('/Users/me/dev/app')
    const toasts = useToastStore.getState().toasts
    expect(toasts).toHaveLength(1)
    expect(toasts[0].message).toBe('Open ~/dev/app as a project?')
    toasts[0].action?.run()
    expect(openPath).toHaveBeenCalledWith('/Users/me/dev/app')
  })

  it('stays quiet for a plain folder', async () => {
    await offerPromotion('/Users/me/notes')
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })
})
