import { describe, expect, it } from 'vitest'
import { actionForHook, parseNotifyMessage, staleSockets } from './awaitingParse'

describe('awaiting: notify-ide messages', () => {
  it('parses plain awaiting / clear', () => {
    expect(parseNotifyMessage('awaiting pty_1_0\n')).toEqual({ ptyId: 'pty_1_0', action: 'awaiting' })
    expect(parseNotifyMessage('clear pty_1_0')).toEqual({ ptyId: 'pty_1_0', action: 'clear' })
  })

  it('rejects malformed heads', () => {
    expect(parseNotifyMessage('')).toBeNull()
    expect(parseNotifyMessage('awaiting')).toBeNull()
    expect(parseNotifyMessage('bogus pty_1_0')).toBeNull()
    expect(parseNotifyMessage('awaiting ../etc')).toBeNull()
    expect(parseNotifyMessage('hook pty_1_0\nnot json')).toBeNull()
  })

  it('maps a multi-line hook payload', () => {
    const body = JSON.stringify({ hook_event_name: 'Stop', session_id: 'x' }, null, 2)
    expect(parseNotifyMessage(`hook pty_9_3\n${body}`)).toEqual({ ptyId: 'pty_9_3', action: 'awaiting' })
  })
})

describe('awaiting: hook payloads', () => {
  const hook = (o: Record<string, unknown>): ReturnType<typeof actionForHook> => actionForHook(o)

  it('Notification marks awaiting only for "needs you" types', () => {
    expect(hook({ hook_event_name: 'Notification', notification_type: 'permission_prompt' })).toBe('awaiting')
    expect(hook({ hook_event_name: 'Notification', notification_type: 'idle_prompt' })).toBe('awaiting')
    expect(hook({ hook_event_name: 'Notification', notification_type: 'elicitation_dialog' })).toBe('awaiting')
    expect(hook({ hook_event_name: 'Notification', notification_type: 'auth_success' })).toBeNull()
    expect(hook({ hook_event_name: 'Notification' })).toBe('awaiting')
  })

  it('Stop waits, UserPromptSubmit clears', () => {
    expect(hook({ hook_event_name: 'Stop' })).toBe('awaiting')
    expect(hook({ hook_event_name: 'UserPromptSubmit', prompt: 'hi' })).toBe('clear')
  })

  it('question tools mark before and clear after; other tools are ignored', () => {
    expect(hook({ hook_event_name: 'PreToolUse', tool_name: 'AskUserQuestion' })).toBe('awaiting')
    expect(hook({ hook_event_name: 'PreToolUse', tool_name: 'ExitPlanMode' })).toBe('awaiting')
    expect(hook({ hook_event_name: 'PostToolUse', tool_name: 'AskUserQuestion' })).toBe('clear')
    expect(hook({ hook_event_name: 'PreToolUse', tool_name: 'Bash' })).toBeNull()
    expect(hook({ hook_event_name: 'PostToolUse', tool_name: 'Bash' })).toBeNull()
  })

  it('ignores junk', () => {
    expect(actionForHook(null)).toBeNull()
    expect(actionForHook('Stop')).toBeNull()
    expect(hook({ hook_event_name: 'SessionStart' })).toBeNull()
  })
})

describe('awaiting: stale socket sweep', () => {
  it('picks only dead-pid caret sockets, never our own', () => {
    const alive = new Set([10, 20])
    const names = ['caret-10.sock', 'caret-30.sock', 'caret-20.sock', 'caret-99.sock', 'other.sock', 'caret-x.sock', 'caret-40.sock.bak']
    expect(staleSockets(names, (pid) => alive.has(pid), 99)).toEqual(['caret-30.sock'])
  })
})
