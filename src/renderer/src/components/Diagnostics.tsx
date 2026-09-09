import { useEffect, useState } from 'react'
import type { CrashReport, CrashReportMeta } from '@shared/types'

/** Short, human date for the report list. */
function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

/** Color the source badge by where the crash came from. */
function sourceClass(source: string): string {
  switch (source) {
    case 'main':
      return 'bg-red-400/15 text-red-300'
    case 'renderer':
      return 'bg-amber-400/15 text-amber-300'
    case 'gpu':
      return 'bg-violet-400/15 text-violet-300'
    default:
      return 'bg-sky-400/15 text-sky-300'
  }
}

/**
 * Diagnostics / crash-report viewer. Lists every report persisted on this
 * machine, shows the full detail of a selected one, and offers reveal-in-Finder
 * and clear-all. Rendered as a modal overlay.
 */
export default function Diagnostics({ onClose }: { onClose: () => void }): JSX.Element {
  const [reports, setReports] = useState<CrashReportMeta[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<CrashReport | null>(null)

  const refresh = async (): Promise<void> => {
    const list = await window.ide.logs.list()
    setReports(list)
    setSelectedId((prev) => prev ?? list[0]?.id ?? null)
  }

  useEffect(() => {
    void refresh()
    const off = window.ide.logs.onReported(() => void refresh())
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      off()
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  useEffect(() => {
    if (!selectedId) {
      setDetail(null)
      return
    }
    let alive = true
    void window.ide.logs.read(selectedId).then((r) => {
      if (alive) setDetail(r)
    })
    return () => {
      alive = false
    }
  }, [selectedId])

  const handleClear = async (): Promise<void> => {
    await window.ide.logs.clear()
    setSelectedId(null)
    setDetail(null)
    await refresh()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-8"
      onClick={onClose}
    >
      <div
        className="flex h-[560px] w-[880px] max-w-full flex-col overflow-hidden rounded-lg border border-ink-border bg-ink-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-ink-border px-4 py-2.5">
          <span className="text-sm font-medium text-ink-text">Diagnostics</span>
          <span className="text-xs text-ink-muted">
            {reports.length} {reports.length === 1 ? 'report' : 'reports'}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => void window.ide.logs.reveal(selectedId ?? undefined)}
              className="rounded border border-ink-border px-2 py-1 text-xs text-ink-text hover:bg-ink-hover"
            >
              Reveal in Finder
            </button>
            <button
              onClick={() => void handleClear()}
              disabled={reports.length === 0}
              className="rounded border border-ink-border px-2 py-1 text-xs text-ink-text hover:bg-ink-hover disabled:opacity-40"
            >
              Clear all
            </button>
            <button
              onClick={onClose}
              className="rounded px-2 py-1 text-xs text-ink-muted hover:text-ink-text"
            >
              Close
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* List */}
          <div className="w-[320px] shrink-0 overflow-y-auto border-r border-ink-border">
            {reports.length === 0 ? (
              <div className="p-4 text-xs text-ink-muted">
                No crash reports. This is where failures will show up.
              </div>
            ) : (
              reports.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  className={`flex w-full flex-col items-start gap-1 border-b border-ink-border/60 px-3 py-2 text-left hover:bg-ink-hover ${
                    r.id === selectedId ? 'bg-ink-hover' : ''
                  }`}
                >
                  <div className="flex w-full items-center gap-2">
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${sourceClass(r.source)}`}
                    >
                      {r.source}
                    </span>
                    <span className="truncate text-[11px] text-ink-muted">{r.type}</span>
                    <span className="ml-auto shrink-0 text-[10px] tabular-nums text-ink-muted">
                      {formatTime(r.timestamp)}
                    </span>
                  </div>
                  <div className="line-clamp-2 text-xs text-ink-text">{r.message}</div>
                </button>
              ))
            )}
          </div>

          {/* Detail */}
          <div className="min-w-0 flex-1 overflow-y-auto p-4">
            {detail ? (
              <div className="flex flex-col gap-3">
                <div>
                  <div className="text-sm font-medium text-ink-text">{detail.message}</div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-muted">
                    <span>{detail.type}</span>
                    <span>·</span>
                    <span>{formatTime(detail.timestamp)}</span>
                    {detail.project && (
                      <>
                        <span>·</span>
                        <span className="truncate">{detail.project}</span>
                      </>
                    )}
                  </div>
                </div>

                {detail.stack && (
                  <section>
                    <div className="mb-1 text-[11px] uppercase tracking-wide text-ink-muted">
                      Stack trace
                    </div>
                    <pre className="overflow-x-auto rounded border border-ink-border bg-ink-bg p-3 text-[11px] leading-relaxed text-ink-text">
                      {detail.stack}
                    </pre>
                  </section>
                )}

                {detail.details && Object.keys(detail.details).length > 0 && (
                  <section>
                    <div className="mb-1 text-[11px] uppercase tracking-wide text-ink-muted">
                      Details
                    </div>
                    <pre className="overflow-x-auto rounded border border-ink-border bg-ink-bg p-3 text-[11px] leading-relaxed text-ink-text">
                      {JSON.stringify(detail.details, null, 2)}
                    </pre>
                  </section>
                )}

                <section>
                  <div className="mb-1 text-[11px] uppercase tracking-wide text-ink-muted">
                    Environment
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-ink-muted">
                    <span>App {detail.app.version}</span>
                    <span>Electron {detail.app.electron}</span>
                    <span>Chrome {detail.app.chrome}</span>
                    <span>Node {detail.app.node}</span>
                    <span>
                      {detail.app.platform} / {detail.app.arch}
                    </span>
                  </div>
                </section>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-ink-muted">
                Select a report to view details.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
