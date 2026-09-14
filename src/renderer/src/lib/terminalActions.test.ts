// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { focusedTerminalId, TERMINAL_ID_ATTR } from './terminalActions'

describe('focusedTerminalId', () => {
  it('finds the terminal id from a nested focused element', () => {
    const host = document.createElement('div')
    host.setAttribute(TERMINAL_ID_ATTR, 'term_1')
    const inner = document.createElement('div')
    const ta = document.createElement('textarea')
    inner.appendChild(ta)
    host.appendChild(inner)
    expect(focusedTerminalId(ta)).toBe('term_1')
    expect(focusedTerminalId(host)).toBe('term_1')
  })

  it('returns null for elements outside a terminal, and for no focus', () => {
    expect(focusedTerminalId(document.createElement('input'))).toBeNull()
    expect(focusedTerminalId(null)).toBeNull()
    expect(focusedTerminalId(document.body)).toBeNull()
  })
})

import { beforeEach, vi } from 'vitest'
import { closeTerminal, cycleTerminal, focusActiveTerminal, jumpToCommand, rerunLastCommand } from './terminalActions'
import { useTerminalsStore } from '../stores/terminals'
import { useLayoutStore } from '../stores/layout'
import { registerTerminalFocus } from './terminalFocus'

describe('terminal commands (quick win #3)', () => {
  const kill = vi.fn(async () => {})
  beforeEach(() => {
    ;(window as unknown as { ide: unknown }).ide = { pty: { kill } }
    kill.mockClear()
    useTerminalsStore.setState({ terminals: [], activeId: null })
    useLayoutStore.setState({ rightVisible: true })
  })

  it('cycleTerminal wraps in both directions and focuses the target', () => {
    const a = useTerminalsStore.getState().addTerminal()
    const b = useTerminalsStore.getState().addTerminal()
    const c = useTerminalsStore.getState().addTerminal()
    const focused: string[] = []
    registerTerminalFocus(a, () => focused.push(a))
    useTerminalsStore.getState().setActive(c)
    cycleTerminal(1)
    expect(useTerminalsStore.getState().activeId).toBe(a)
    expect(focused).toEqual([a])
    cycleTerminal(-1)
    expect(useTerminalsStore.getState().activeId).toBe(c)
    cycleTerminal(-1)
    expect(useTerminalsStore.getState().activeId).toBe(b)
  })

  it('cycleTerminal is a no-op with no terminals', () => {
    expect(() => cycleTerminal(1)).not.toThrow()
    expect(useTerminalsStore.getState().activeId).toBeNull()
  })

  it('focusActiveTerminal reveals the panel and creates a terminal when there is none', () => {
    useLayoutStore.setState({ rightVisible: false })
    focusActiveTerminal()
    expect(useLayoutStore.getState().rightVisible).toBe(true)
    expect(useTerminalsStore.getState().terminals).toHaveLength(1)
  })

  it('closeTerminal kills the pty and removes the tab', () => {
    const a = useTerminalsStore.getState().addTerminal()
    useTerminalsStore.getState().setPty(a, 'pty_9')
    closeTerminal(a)
    expect(kill).toHaveBeenCalledWith('pty_9')
    expect(useTerminalsStore.getState().terminals).toHaveLength(0)
    expect(() => closeTerminal('missing')).not.toThrow()
  })
})

describe('shell integration commands (#44)', () => {
  it('rerunLastCommand types the last recorded command into the active terminal', async () => {
    const { shellState, recordCommand } = await import('./shellMarks')
    const write = vi.fn()
    ;(window as unknown as { ide: unknown }).ide = { pty: { write, kill: async () => {} } }
    useTerminalsStore.setState({ terminals: [], activeId: null })
    const id = useTerminalsStore.getState().addTerminal()
    useTerminalsStore.getState().setPty(id, 'pty_1')
    expect(rerunLastCommand()).toBe(false)
    recordCommand(shellState(id), 'npm test')
    expect(rerunLastCommand()).toBe(true)
    expect(write).toHaveBeenCalledWith('pty_1', 'npm test\r')
  })

  it('jumpToCommand scrolls to the adjacent prompt marker', async () => {
    const { shellState } = await import('./shellMarks')
    useTerminalsStore.setState({ terminals: [], activeId: null })
    const id = useTerminalsStore.getState().addTerminal()
    const scrolled: number[] = []
    registerTerminalFocus(id, { focus: () => {}, scrollToLine: (l) => scrolled.push(l), viewportTop: () => 50 })
    shellState(id).marks = [
      { line: 10, isDisposed: false },
      { line: 80, isDisposed: false }
    ]
    expect(jumpToCommand(-1)).toBe(true)
    expect(jumpToCommand(1)).toBe(true)
    expect(scrolled).toEqual([10, 80])
  })
})
