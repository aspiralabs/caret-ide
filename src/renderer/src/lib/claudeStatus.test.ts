// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { applySessionUpdate, shouldNotify, targetTerminal } from './claudeStatus'
import { useTerminalsStore, type TerminalTab } from '../stores/terminals'

const term = (id: string, over: Partial<TerminalTab> = {}): TerminalTab => ({
  id,
  ptyId: 'p' + id,
  label: 'zsh',
  exited: false,
  foreground: null,
  ...over
})

describe('targetTerminal', () => {
  const claudeA = term('a', { foreground: 'claude' })
  const claudeB = term('b', { foreground: 'claude' })
  const shell = term('c')
  it('prefers the active claude tab, then the last active, then any', () => {
    expect(targetTerminal([claudeA, claudeB, shell], 'b', 'a')?.id).toBe('b')
    expect(targetTerminal([claudeA, claudeB, shell], 'c', 'b')?.id).toBe('b')
    expect(targetTerminal([claudeA, claudeB, shell], 'c', 'c')?.id).toBe('a')
    expect(targetTerminal([shell], 'c', null)).toBeUndefined()
    expect(targetTerminal([term('x', { foreground: 'claude', exited: true })], 'x', null)).toBeUndefined()
  })
})

describe('shouldNotify (integration #11)', () => {
  it('fires only on a busy → waiting transition while the window is unfocused', () => {
    expect(shouldNotify('working', 'waiting', false)).toBe(true)
    expect(shouldNotify('thinking', 'waiting', false)).toBe(true)
    expect(shouldNotify('working', 'waiting', true)).toBe(false)
    expect(shouldNotify('waiting', 'waiting', false)).toBe(false)
    expect(shouldNotify(null, 'waiting', false)).toBe(false) // first sight of an idle session
    expect(shouldNotify('waiting', 'working', false)).toBe(false)
  })
})

describe('applySessionUpdate', () => {
  beforeEach(() => useTerminalsStore.setState({ terminals: [], activeId: null }))

  it('labels and sets the status on the claude tab, never a plain shell', () => {
    const a = useTerminalsStore.getState().addTerminal()
    const b = useTerminalsStore.getState().addTerminal()
    useTerminalsStore.getState().setForeground(a, 'claude')
    applySessionUpdate(
      { title: 'Ship it', sessionId: 's', file: '/f', mtimeMs: 1, status: 'working' },
      null
    )
    const s = useTerminalsStore.getState()
    expect(s.terminals.find((t) => t.id === a)).toMatchObject({ label: 'Ship it', claudeStatus: 'working' })
    const other = s.terminals.find((t) => t.id === b)!
    expect(other.label).toBe('zsh')
    expect(other.claudeStatus ?? null).toBeNull()
  })

  it('keeps the label when the update has no title, and clears status when claude exits', () => {
    const a = useTerminalsStore.getState().addTerminal()
    useTerminalsStore.getState().setForeground(a, 'claude')
    useTerminalsStore.getState().setAutoLabel(a, 'named')
    applySessionUpdate({ title: null, sessionId: 's', file: '/f', mtimeMs: 1, status: 'waiting' }, null)
    expect(useTerminalsStore.getState().terminals[0]).toMatchObject({ label: 'named', claudeStatus: 'waiting' })
    useTerminalsStore.getState().setForeground(a, null)
    expect(useTerminalsStore.getState().terminals[0].claudeStatus).toBeNull()
  })

  it('posts a notification on busy → waiting when the window is not focused', () => {
    const a = useTerminalsStore.getState().addTerminal()
    useTerminalsStore.getState().setForeground(a, 'claude')
    useTerminalsStore.getState().setClaudeStatus(a, 'working')
    const ctor = vi.fn()
    ;(globalThis as unknown as { Notification: unknown }).Notification = Object.assign(
      function (this: unknown, title: string, opts: unknown) {
        ctor(title, opts)
      },
      { permission: 'granted' }
    )
    vi.spyOn(document, 'hasFocus').mockReturnValue(false)
    applySessionUpdate({ title: null, sessionId: 's', file: '/f', mtimeMs: 1, status: 'waiting' }, null)
    expect(ctor).toHaveBeenCalledWith('Claude is waiting for input', expect.objectContaining({ body: 'zsh' }))
  })
})
