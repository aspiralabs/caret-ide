import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { SessionSummary } from '@shared/types'
import { useTerminalsStore } from '../../stores/terminals'
import { useOverlay } from '../../stores/overlay'
import { NEW_SESSION_COMMAND, relativeAge, resumeCommand } from '../../lib/sessionCommands'

/**
 * Dropdown next to the terminal "+": start a plain shell, a new Claude Code
 * session, or resume a recent session for this project (`claude --resume`).
 * The tab knows its session from birth, so its title is right immediately.
 */
export default function NewTerminalMenu(): JSX.Element {
  const [open, setOpen] = useState(false)
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null)
  useOverlay(open)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setSessions(null)
    window.ide.session
      .list()
      .then((list) => {
        if (!cancelled) setSessions(list)
      })
      .catch(() => {
        if (!cancelled) setSessions([])
      })
    const close = (): void => setOpen(false)
    window.addEventListener('click', close)
    window.addEventListener('keydown', close)
    return () => {
      cancelled = true
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', close)
    }
  }, [open])

  const start = (label: string, command?: string): void => {
    useTerminalsStore.getState().addTerminal(label, command ? { command } : undefined)
    setOpen(false)
  }

  return (
    <div className="relative">
      <button
        aria-label="New terminal options"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        className="flex h-7 w-5 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-ink-hover hover:text-ink-text"
      >
        <ChevronDown size={14} strokeWidth={1.8} />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-1 min-w-[240px] rounded border border-ink-border bg-ink-elevated py-1 text-xs text-ink-text shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <Item label="New terminal" onClick={() => start('zsh')} />
          <Item label="New Claude Code session" onClick={() => start('claude', NEW_SESSION_COMMAND)} />
          <div className="my-1 h-px bg-ink-border" />
          <div className="px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-ink-muted">
            Resume session
          </div>
          {sessions === null && <div className="px-3 py-1 text-ink-muted">Loading…</div>}
          {sessions?.length === 0 && <div className="px-3 py-1 text-ink-muted">No sessions for this project</div>}
          {sessions?.map((s) => (
            <Item
              key={s.sessionId}
              label={s.title}
              hint={relativeAge(s.modifiedMs)}
              onClick={() => start(s.title, resumeCommand(s.sessionId))}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function Item({ label, hint, onClick }: { label: string; hint?: string; onClick: () => void }): JSX.Element {
  return (
    <button
      className="flex w-full items-center gap-3 px-3 py-1.5 text-left hover:bg-ink-hover"
      onClick={onClick}
      title={label}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hint && <span className="shrink-0 text-[10px] text-ink-muted">{hint}</span>}
    </button>
  )
}
