// Pure parsing for notify-ide messages (no fs / electron imports).
//
// notify-ide opens the socket, writes one message and closes:
//   line 1   `<command> <ptyId>`   command = awaiting | clear | hook
//   rest     (hook only) the Claude Code hook payload JSON from stdin
// A `hook` message is turned into awaiting / clear / nothing from the payload.

/** What a message asks for: mark the pty awaiting, clear it, or nothing. */
export type AwaitingAction = 'awaiting' | 'clear'

export interface NotifyMessage {
  ptyId: string
  action: AwaitingAction
}

/** Largest message we read; hook payloads are small, transcripts are not sent. */
export const MAX_NOTIFY_BYTES = 64 * 1024

/** Notification types that mean Claude is blocked on the user. */
const WAITING_NOTIFICATIONS = new Set(['permission_prompt', 'idle_prompt', 'elicitation_dialog'])
/** Tools whose whole point is a question to the user. */
const QUESTION_TOOLS = new Set(['AskUserQuestion', 'ExitPlanMode'])

/** Map a Claude Code hook payload to an action (null = not interesting). */
export function actionForHook(payload: unknown): AwaitingAction | null {
  if (!payload || typeof payload !== 'object') return null
  const p = payload as { hook_event_name?: unknown; notification_type?: unknown; tool_name?: unknown }
  switch (p.hook_event_name) {
    case 'Notification':
      // Older Claude Code sends no notification_type; every one of its
      // notifications was a "needs you" one.
      return p.notification_type === undefined || WAITING_NOTIFICATIONS.has(String(p.notification_type))
        ? 'awaiting'
        : null
    case 'Stop':
      return 'awaiting'
    case 'PreToolUse':
      return QUESTION_TOOLS.has(String(p.tool_name)) ? 'awaiting' : null
    case 'PostToolUse':
      return QUESTION_TOOLS.has(String(p.tool_name)) ? 'clear' : null
    case 'UserPromptSubmit':
      return 'clear'
    default:
      return null
  }
}

/** Parse one raw message; null when malformed or uninteresting. */
export function parseNotifyMessage(raw: string): NotifyMessage | null {
  const nl = raw.indexOf('\n')
  const head = (nl === -1 ? raw : raw.slice(0, nl)).trim()
  const body = nl === -1 ? '' : raw.slice(nl + 1)
  const m = /^(awaiting|clear|hook) (pty_[\w]+)$/.exec(head)
  if (!m) return null
  const [, command, ptyId] = m
  if (command !== 'hook') return { ptyId, action: command as AwaitingAction }
  let payload: unknown
  try {
    payload = JSON.parse(body)
  } catch {
    return null
  }
  const action = actionForHook(payload)
  return action ? { ptyId, action } : null
}
