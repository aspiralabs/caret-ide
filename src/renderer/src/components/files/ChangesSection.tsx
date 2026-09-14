import { useState } from 'react'
import { GitCompareArrows } from 'lucide-react'
import { useGitStore, stateColorClass, stateLetter } from '../../stores/git'
import { useProjectStore } from '../../stores/project'
import { useTabsStore } from '../../stores/tabs'
import { useLayoutStore } from '../../stores/layout'
import { relativePath } from '../../lib/claudeRefs'
import { Chevron } from './icons'

/**
 * "Changes" at the top of the file browser: every file git reports as
 * modified / added / deleted / untracked / conflicted — i.e. what Claude just
 * touched — with click-to-open and a quick-diff button. Hidden outside a repo
 * or when the tree is clean.
 */
export default function ChangesSection(): JSX.Element | null {
  const files = useGitStore((s) => s.status?.files ?? [])
  const isRepo = useGitStore((s) => s.status?.isRepo ?? false)
  const root = useProjectStore((s) => s.info?.root ?? '')
  const [open, setOpen] = useState(true)
  if (!isRepo || files.length === 0) return null

  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path))
  const reveal = (): void => {
    if (!useLayoutStore.getState().centerVisible) useLayoutStore.getState().togglePanel('center')
  }

  return (
    <div className="shrink-0 border-b border-ink-border">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-7 w-full items-center gap-1 px-3 text-[11px] font-medium uppercase tracking-wide text-ink-muted hover:text-ink-text"
      >
        <Chevron open={open} className="text-ink-muted" />
        Changes
        <span className="ml-auto rounded-full bg-ink-elevated px-1.5 text-[10px] tabular-nums">{files.length}</span>
      </button>
      {open && (
        <div className="max-h-48 overflow-auto px-2 pb-1">
          {sorted.map((f) => (
            <div
              key={f.path}
              role="button"
              title={f.path}
              onClick={() => {
                if (f.state === 'deleted') return
                useTabsStore.getState().openFile(f.path)
                reveal()
              }}
              className="group flex h-[22px] cursor-pointer items-center gap-1.5 rounded-md px-1.5 text-[12px] leading-none text-ink-tree hover:bg-ink-hover"
            >
              <span className={`w-3 shrink-0 text-center text-[10px] font-semibold ${stateColorClass(f.state)}`}>
                {stateLetter(f.state)}
              </span>
              <span className={`min-w-0 truncate ${f.state === 'deleted' ? 'line-through opacity-60' : ''}`}>
                {relativePath(f.path, root)}
              </span>
              {f.state !== 'deleted' && f.state !== 'untracked' && f.state !== 'added' && (
                <button
                  aria-label="Open diff"
                  title="Diff against HEAD"
                  onClick={(e) => {
                    e.stopPropagation()
                    useTabsStore.getState().openDiff(f.path)
                    reveal()
                  }}
                  className="ml-auto hidden h-4 w-4 shrink-0 items-center justify-center rounded text-ink-muted hover:bg-ink-active hover:text-ink-text group-hover:flex"
                >
                  <GitCompareArrows size={12} strokeWidth={2} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
