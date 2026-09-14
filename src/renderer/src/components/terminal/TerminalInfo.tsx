import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { PtyInfo } from '@shared/types'
import type { TerminalTab } from '../../stores/terminals'

/** ⓘ popover: pid, shell, cwd and foreground process of a terminal (refreshes every 2 s). */
export default function TerminalInfo({ tab, onClose }: { tab: TerminalTab; onClose: () => void }): JSX.Element {
  const [info, setInfo] = useState<PtyInfo | null | undefined>(undefined)
  useEffect(() => {
    let cancelled = false
    const load = (): void => {
      if (!tab.ptyId) {
        setInfo(null)
        return
      }
      window.ide.pty
        .info(tab.ptyId)
        .then((i) => !cancelled && setInfo(i))
        .catch(() => !cancelled && setInfo(null))
    }
    load()
    const t = setInterval(load, 2000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [tab.ptyId])

  const Row = ({ k, v }: { k: string; v: string }): JSX.Element => (
    <div className="flex gap-2">
      <span className="w-20 shrink-0 text-ink-muted">{k}</span>
      <span className="min-w-0 break-all text-ink-text">{v}</span>
    </div>
  )

  return (
    <div className="absolute right-3 top-2 z-30 w-72 rounded-lg border border-ink-border bg-ink-elevated/95 p-3 text-[11px] shadow-lg backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium text-ink-text">Terminal info</span>
        <button aria-label="Close" onClick={onClose} className="rounded p-0.5 text-ink-muted hover:text-ink-text">
          <X size={12} />
        </button>
      </div>
      {info === undefined && <div className="text-ink-muted">Loading…</div>}
      {info === null && <div className="text-ink-muted">{tab.exited ? 'Shell has exited' : 'No shell yet'}</div>}
      {info && (
        <div className="flex flex-col gap-1">
          <Row k="pid" v={String(info.pid)} />
          <Row k="shell" v={info.shell} />
          <Row k="cwd" v={info.cwd ?? '—'} />
          <Row k="foreground" v={info.foreground ?? 'idle (shell prompt)'} />
        </div>
      )}
    </div>
  )
}
