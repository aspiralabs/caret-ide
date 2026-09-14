import { beforeEach, describe, expect, it } from 'vitest'
import { useTerminalsStore } from './terminals'

beforeEach(() => useTerminalsStore.setState({ terminals: [], activeId: null }))

describe('terminals.restart (quick win #5)', () => {
  it('clears the pty binding and exited state so a new shell spawns in place', () => {
    const id = useTerminalsStore.getState().addTerminal()
    useTerminalsStore.getState().setPty(id, 'pty_1')
    useTerminalsStore.getState().setForeground(id, 'claude')
    useTerminalsStore.getState().markExited('pty_1', 1)
    expect(useTerminalsStore.getState().terminals[0]).toMatchObject({ exited: true, exitCode: 1, foreground: null })
    useTerminalsStore.getState().restart(id)
    expect(useTerminalsStore.getState().terminals[0]).toMatchObject({
      id,
      ptyId: null,
      exited: false,
      exitCode: undefined
    })
  })

  it('is a no-op for a live terminal', () => {
    const id = useTerminalsStore.getState().addTerminal()
    useTerminalsStore.getState().setPty(id, 'pty_1')
    useTerminalsStore.getState().restart(id)
    expect(useTerminalsStore.getState().terminals[0].ptyId).toBe('pty_1')
  })

  it('setAutoLabel ignores internal markup titles and respects a custom name', () => {
    const id = useTerminalsStore.getState().addTerminal()
    useTerminalsStore.getState().setAutoLabel(id, '<local-command-caveat>')
    expect(useTerminalsStore.getState().terminals[0].label).toBe('zsh')
    useTerminalsStore.getState().setAutoLabel(id, 'claude')
    expect(useTerminalsStore.getState().terminals[0].label).toBe('claude')
    useTerminalsStore.getState().setCustomName(id, 'mine')
    useTerminalsStore.getState().setAutoLabel(id, 'other')
    expect(useTerminalsStore.getState().displayLabel(useTerminalsStore.getState().terminals[0])).toBe('mine')
  })
})
