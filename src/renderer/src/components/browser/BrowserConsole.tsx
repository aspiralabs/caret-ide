import { useEffect, useRef } from 'react'
import { Trash2, X } from 'lucide-react'
import type { CenterTab } from '../../stores/tabs'
import { useTabsStore } from '../../stores/tabs'
import { consoleErrorPayload } from '../../lib/consoleErrors'
import { sendToClaude } from '../../lib/sendToClaude'
import type { ConsoleEntry } from '@shared/types'

const LEVEL_CLASS: Record<ConsoleEntry['level'], string> = {
  error: 'text-red-300 [.theme-light_&]:text-red-700',
  warning: 'text-amber-300 [.theme-light_&]:text-amber-700',
  info: 'text-sky-300 [.theme-light_&]:text-sky-700',
  log: 'text-ink-text'
}

/**
 * Lightweight console drawer docked above the viewport (the native view
 * paints over the DOM, so it can't float). Shows every console message the
 * page logged since its last navigation, with a per-row "→ Claude".
 */
export default function BrowserConsole({ tab }: { tab: CenterTab }): JSX.Element {
  const entries = tab.consoleErrors ?? []
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [entries.length])

  return (
    <div className="flex h-44 shrink-0 flex-col border-b border-ink-border bg-ink-panel">
      <div className="flex h-7 shrink-0 items-center gap-2 border-b border-ink-border px-3 text-[11px] text-ink-muted">
        <span className="font-medium uppercase tracking-wide">Console</span>
        <span className="tabular-nums">{entries.length}</span>
        <button
          aria-label="Clear console"
          title="Clear"
          onClick={() => useTabsStore.getState().updateTab(tab.id, { consoleErrors: [] })}
          className="ml-auto rounded p-0.5 hover:bg-ink-hover hover:text-ink-text"
        >
          <Trash2 size={12} />
        </button>
        <button
          aria-label="Close console"
          onClick={() => useTabsStore.getState().updateTab(tab.id, { consoleOpen: false })}
          className="rounded p-0.5 hover:bg-ink-hover hover:text-ink-text"
        >
          <X size={12} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto font-mono text-[11px]">
        {entries.length === 0 && <div className="px-3 py-2 text-ink-muted">No console output since the last navigation.</div>}
        {entries.map((e, i) => (
          <div key={i} className="group flex items-start gap-2 border-b border-ink-border/40 px-3 py-1 hover:bg-ink-hover/40">
            <span className={`w-10 shrink-0 uppercase ${LEVEL_CLASS[e.level]}`}>{e.level === 'warning' ? 'warn' : e.level}</span>
            <span className={`min-w-0 flex-1 whitespace-pre-wrap break-words ${LEVEL_CLASS[e.level]}`}>{e.message}</span>
            {e.source && (
              <span className="shrink-0 text-ink-muted" title={e.source}>
                {e.source.split('/').pop()}
                {e.line ? `:${e.line}` : ''}
              </span>
            )}
            <button
              title="Send to Claude Code"
              onClick={() => {
                const { marker, body } = consoleErrorPayload(e)
                sendToClaude(marker, body)
              }}
              className="hidden shrink-0 rounded bg-ink-accent px-1.5 text-[10px] font-sans text-white group-hover:block"
            >
              → Claude
            </button>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  )
}
