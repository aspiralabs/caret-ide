// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultWorkspaceState, type WorkspaceState } from '@shared/types'
import { useLayoutStore } from './layout'
import { useTabsStore } from './tabs'
import { useTerminalsStore } from './terminals'
import { useFilesStore } from './files'
import { buildWorkspaceState, hydrateFromDisk } from './persistence'

beforeEach(() => {
  useLayoutStore.setState({
    leftVisible: true,
    rightVisible: true,
    centerVisible: true,
    panelSizes: [20, 52, 28],
    centerSplit: false,
    terminalSplit: false,
    hiddenCenterPanes: [],
    hiddenTerminalPanes: []
  })
  useTabsStore.setState({ tabs: [], activeId: null })
  useTerminalsStore.setState({ terminals: [], activeId: null })
  useFilesStore.setState({ children: {}, expanded: new Set() })
})

describe('workspace persistence (bugs #12, #19)', () => {
  it('round-trips split view, hidden panes and the active terminal', async () => {
    const a = useTabsStore.getState().openFile('/p/a.ts')
    const b = useTabsStore.getState().openFile('/p/b.ts')
    const t1 = useTerminalsStore.getState().addTerminal()
    const t2 = useTerminalsStore.getState().addTerminal()
    useTerminalsStore.getState().setActive(t1)
    const layout = useLayoutStore.getState()
    layout.toggleCenterSplit()
    layout.toggleTerminalSplit()
    layout.toggleCenterPaneHidden(b)
    layout.toggleTerminalPaneHidden(t2)
    layout.togglePanel('center') // "editor hidden, terminal split" must survive too

    const ws = buildWorkspaceState()
    expect(ws.layout).toMatchObject({
      centerVisible: false,
      centerSplit: true,
      terminalSplit: true,
      hiddenCenterPanes: [b],
      hiddenTerminalPanes: [t2]
    })
    expect(ws.activeTerminalId).toBe(t1)
    expect(ws.activeCenterTabId).toBe(b)
    expect(ws.centerTabs.map((t) => t.id)).toEqual([a, b])

    // Fresh stores, hydrate from the snapshot.
    useLayoutStore.setState({ centerSplit: false, terminalSplit: false, hiddenCenterPanes: [], hiddenTerminalPanes: [], centerVisible: true })
    useTabsStore.setState({ tabs: [], activeId: null })
    useTerminalsStore.setState({ terminals: [], activeId: null })
    ;(window as unknown as { ide: unknown }).ide = {
      workspace: { getState: vi.fn(async () => ws) },
      fs: { readDir: vi.fn(async () => []) }
    }
    await hydrateFromDisk()
    expect(useLayoutStore.getState()).toMatchObject({
      centerVisible: false,
      centerSplit: true,
      terminalSplit: true,
      hiddenCenterPanes: [b],
      hiddenTerminalPanes: [t2]
    })
    expect(useTerminalsStore.getState().activeId).toBe(t1)
  })

  it('drops hidden-pane ids that no longer belong to a tab', () => {
    const a = useTabsStore.getState().openFile('/p/a.ts')
    useLayoutStore.getState().toggleCenterPaneHidden(a)
    useLayoutStore.getState().toggleCenterPaneHidden('tab_gone')
    expect(buildWorkspaceState().layout.hiddenCenterPanes).toEqual([a])
  })

  it('hydrates state persisted before split fields existed with sane defaults', () => {
    const old = defaultWorkspaceState() as WorkspaceState
    delete old.layout.centerSplit
    delete old.layout.hiddenCenterPanes
    delete old.activeTerminalId
    old.terminalTabs = [{ id: 'term_x', label: 'zsh' }]
    useLayoutStore.getState().hydrate(old)
    useTerminalsStore.getState().hydrate(old)
    expect(useLayoutStore.getState()).toMatchObject({
      centerSplit: false,
      terminalSplit: false,
      hiddenCenterPanes: [],
      hiddenTerminalPanes: []
    })
    expect(useTerminalsStore.getState().activeId).toBe('term_x')
  })

  it('ignores an activeTerminalId that no longer exists', () => {
    const ws = { ...defaultWorkspaceState(), terminalTabs: [{ id: 'a', label: 'zsh' }], activeTerminalId: 'zzz' }
    useTerminalsStore.getState().hydrate(ws)
    expect(useTerminalsStore.getState().activeId).toBe('a')
  })
})
