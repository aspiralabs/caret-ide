import { useEffect, useState } from 'react'
import type { CenterTab } from '../../stores/tabs'
import { basename } from '../../lib/path'
import { dataUrlBytes, formatBytes, type MediaKind } from './mediaKind'
import { LoadErrorNotice } from './EditorView'

/**
 * Viewer tab for images (incl. SVG) and PDFs — instead of "Binary file not
 * shown". Content arrives as a data: URL through the fs IPC (CSP allows
 * data: for img and frames; file:// is blocked). Images can toggle between
 * fit-to-pane and 1:1; the strip shows natural size and byte size. Reloads
 * when the file changes on disk.
 */
export default function MediaView({ tab, kind }: { tab: CenterTab; kind: MediaKind }): JSX.Element {
  const filePath = tab.filePath ?? ''
  const [src, setSrc] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fit, setFit] = useState(true)
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    return window.ide.fs.onChanged((e) => {
      if (e.path === filePath && e.kind === 'change') setTick((t) => t + 1)
    })
  }, [filePath])

  useEffect(() => {
    let cancelled = false
    setError(null)
    window.ide.fs
      .readDataUrl(filePath)
      .then((url) => {
        if (cancelled) return
        if (!url) setError('File is missing, too large to preview (10 MB limit), or not a supported format')
        else setSrc(url)
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : String(err)))
    return () => {
      cancelled = true
    }
  }, [filePath, tick])

  if (error) return <LoadErrorNotice tabId={tab.id} filePath={filePath} error={error} />
  if (!src) return <div className="flex h-full items-center justify-center bg-ink-panel text-xs text-ink-muted">Loading…</div>

  return (
    <div className="flex h-full flex-col bg-ink-panel">
      <div className="flex h-7 shrink-0 items-center gap-3 border-b border-ink-border px-3 text-[11px] text-ink-muted">
        <span className="truncate text-ink-text">{basename(filePath)}</span>
        {dims && (
          <span className="tabular-nums">
            {dims.w} × {dims.h}
          </span>
        )}
        <span className="tabular-nums">{formatBytes(dataUrlBytes(src))}</span>
        {kind === 'image' && (
          <button
            onClick={() => setFit((f) => !f)}
            className="ml-auto rounded border border-ink-border px-1.5 py-0.5 hover:bg-ink-hover hover:text-ink-text"
          >
            {fit ? 'Actual size' : 'Fit'}
          </button>
        )}
      </div>
      {kind === 'image' ? (
        <div className="checkerboard min-h-0 flex-1 overflow-auto">
          <div className={`flex min-h-full min-w-full items-center justify-center p-4 ${fit ? '' : 'w-max'}`}>
            <img
              src={src}
              alt={basename(filePath)}
              onLoad={(e) => setDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              className={fit ? 'max-h-full max-w-full object-contain' : 'max-w-none'}
              style={fit ? { maxHeight: 'calc(100vh - 160px)' } : undefined}
            />
          </div>
        </div>
      ) : (
        <iframe title={basename(filePath)} src={src} className="min-h-0 flex-1 border-0 bg-white" />
      )}
    </div>
  )
}
