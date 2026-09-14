import type { ClaudeStatus, SessionUpdateEvent } from '@shared/types'
import { useTerminalsStore, type TerminalTab } from '../stores/terminals'
import { focusTerminal } from './terminalFocus'

/**
 * Pick the terminal a session update belongs to: the active tab if it's
 * running claude, else the most-recently-active one, else any claude tab.
 * Best-effort — with two concurrent sessions there is no pty↔session link on
 * disk (spec §6 relaxation).
 */
export function targetTerminal(
  terminals: ReadonlyArray<TerminalTab>,
  activeId: string | null,
  lastActiveId: string | null
): TerminalTab | undefined {
  const isClaude = (t: TerminalTab): boolean => t.foreground === 'claude' && !t.exited
  const active = terminals.find((t) => t.id === activeId)
  if (active && isClaude(active)) return active
  const last = terminals.find((t) => t.id === lastActiveId)
  if (last && isClaude(last)) return last
  return terminals.find(isClaude)
}

/**
 * Should a "Claude is waiting for you" notification fire for this transition?
 * Only when the session just ENDED a turn (moved into `waiting` from a busy
 * state) and the user isn't looking at the app.
 */
export function shouldNotify(
  prev: ClaudeStatus | null | undefined,
  next: ClaudeStatus | null,
  windowFocused: boolean
): boolean {
  return next === 'waiting' && prev !== 'waiting' && prev != null && !windowFocused
}

/** Apply a session update to the matching terminal tab (label + status). */
export function applySessionUpdate(e: SessionUpdateEvent, lastActiveId: string | null): void {
  const store = useTerminalsStore.getState()
  const target = targetTerminal(store.terminals, store.activeId, lastActiveId)
  if (!target) return
  if (e.title) store.setAutoLabel(target.id, e.title)
  if (shouldNotify(target.claudeStatus, e.status, document.hasFocus())) {
    notifyWaiting(target)
  }
  store.setClaudeStatus(target.id, e.status)
}

function notifyWaiting(tab: TerminalTab): void {
  if (typeof Notification === 'undefined') return
  if (Notification.permission === 'denied') return
  try {
    const n = new Notification('Claude is waiting for input', {
      body: useTerminalsStore.getState().displayLabel(tab),
      silent: false
    })
    n.onclick = () => {
      window.focus()
      useTerminalsStore.getState().setActive(tab.id)
      focusTerminal(tab.id)
    }
  } catch {
    /* notifications unavailable */
  }
}
