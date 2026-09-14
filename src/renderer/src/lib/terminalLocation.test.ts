import { beforeEach, describe, expect, it } from 'vitest'
import { moveTerminalToCenter, moveTerminalToPanel, panelTerminals } from './terminalLocation'
import { useTerminalsStore } from '../stores/terminals'
import { useTabsStore } from '../stores/tabs'
import { useLayoutStore } from '../stores/layout'

beforeEach(() => {
  useTerminalsStore.setState({ terminals: [], activeId: null })
  useTabsStore.setState({ tabs: [], activeId: null })
  useLayoutStore.setState({ centerVisible: false, rightVisible: false })
})

describe('terminal location (#41)', () => {
  it('moves a terminal to a center tab and back', () => {
    const a = useTerminalsStore.getState().addTerminal('claude')
    const b = useTerminalsStore.getState().addTerminal()
    useTerminalsStore.getState().setActive(a)
    moveTerminalToCenter(a)
    expect(useTerminalsStore.getState().terminals[0].location).toBe('center')
    expect(useTabsStore.getState().tabs[0]).toMatchObject({ kind: 'terminal', terminalId: a, title: 'claude' })
    expect(useLayoutStore.getState().centerVisible).toBe(true)
    expect(useTerminalsStore.getState().activeId).toBe(b)
    expect(panelTerminals(useTerminalsStore.getState().terminals).map((t) => t.id)).toEqual([b])
    // Opening again focuses the same tab.
    expect(useTabsStore.getState().openTerminalTab(a, 'x')).toBe(useTabsStore.getState().tabs[0].id)

    moveTerminalToPanel(a)
    expect(useTerminalsStore.getState().terminals[0].location).toBe('panel')
    expect(useTabsStore.getState().tabs).toHaveLength(0)
    expect(useTerminalsStore.getState().activeId).toBe(a)
    expect(useLayoutStore.getState().rightVisible).toBe(true)
  })
})
