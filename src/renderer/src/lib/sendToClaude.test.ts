// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { claudeTerminal, selectionPrompt, sendFileReference, sendToClaude } from './sendToClaude'
import { useTerminalsStore, type TerminalTab } from '../stores/terminals'
import { useLayoutStore } from '../stores/layout'
import { useProjectStore } from '../stores/project'
import { useToastStore } from '../stores/toast'

const term = (id: string, over: Partial<TerminalTab> = {}): TerminalTab => ({
  id,
  ptyId: 'pty_' + id,
  label: 'zsh',
  exited: false,
  foreground: null,
  ...over
})

describe('claudeTerminal', () => {
  it('prefers the active claude tab, else the first live one', () => {
    const a = term('a', { foreground: 'claude' })
    const b = term('b', { foreground: 'claude' })
    expect(claudeTerminal([a, b], 'b')?.id).toBe('b')
    expect(claudeTerminal([a, b], 'zzz')?.id).toBe('a')
    expect(claudeTerminal([term('c')], 'c')).toBeNull()
    expect(claudeTerminal([term('d', { foreground: 'claude', exited: true })], 'd')).toBeNull()
  })
})

describe('selectionPrompt (integration #12)', () => {
  it('formats a selection as a line reference plus fenced snippet', () => {
    const p = selectionPrompt('/p/src/a.ts', '/p', { text: 'const x = 1\n', startLine: 10, endLine: 12 }, 'typescript')
    expect(p.marker).toBe('@src/a.ts#L10-L12 ')
    expect(p.body).toBe('@src/a.ts#L10-L12\n```typescript\nconst x = 1\n```')
  })
  it('falls back to a bare file mention without a selection', () => {
    expect(selectionPrompt('/p/src/a.ts', '/p', null)).toEqual({ marker: '@src/a.ts ', body: null })
    expect(selectionPrompt('/p/src/a.ts', '/p', { text: '   ', startLine: 1, endLine: 1 }).body).toBeNull()
  })
})

describe('sendToClaude', () => {
  const write = vi.fn()
  beforeEach(() => {
    ;(window as unknown as { ide: unknown }).ide = { pty: { write } }
    write.mockClear()
    useTerminalsStore.setState({ terminals: [], activeId: null })
    useLayoutStore.setState({ rightVisible: false })
    useToastStore.setState({ toasts: [] })
    useProjectStore.setState({ info: { root: '/p', name: 'p' } })
  })

  it('writes marker + bracketed paste to the claude pty, reveals and activates the terminal', () => {
    useTerminalsStore.getState().addTerminal()
    const c = useTerminalsStore.getState().addTerminal()
    useTerminalsStore.getState().setPty(c, 'pty_c')
    useTerminalsStore.getState().setForeground(c, 'claude')
    useTerminalsStore.getState().addTerminal() // active is now a plain shell
    expect(sendToClaude('@a.ts#L1 ', 'BODY')).toBe(true)
    expect(write).toHaveBeenCalledWith('pty_c', '@a.ts#L1\x1b[200~BODY\x1b[201~')
    expect(useTerminalsStore.getState().activeId).toBe(c)
    expect(useLayoutStore.getState().rightVisible).toBe(true)
  })

  it('types a plain mention when there is no body', () => {
    const c = useTerminalsStore.getState().addTerminal()
    useTerminalsStore.getState().setPty(c, 'pty_c')
    useTerminalsStore.getState().setForeground(c, 'claude')
    expect(sendFileReference('/p/src/x.ts')).toBe(true)
    expect(write).toHaveBeenCalledWith('pty_c', '@src/x.ts ')
  })

  it('toasts and returns false when no claude session is running', () => {
    useTerminalsStore.getState().addTerminal()
    expect(sendToClaude('@x ', null)).toBe(false)
    expect(write).not.toHaveBeenCalled()
    expect(useToastStore.getState().toasts[0].message).toMatch(/Claude Code/)
  })
})
