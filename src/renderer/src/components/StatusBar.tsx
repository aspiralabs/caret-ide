import { useEffect, useRef, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { useProjectStore } from '../stores/project'
import { useGitStore } from '../stores/git'
import Tooltip from './Tooltip'
import Diagnostics from './Diagnostics'

/** Small triangle-in-circle warning glyph for the crash indicator. */
function AlertIcon(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 2.5 14.5 13.5H1.5L8 2.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="M8 6.5v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="8" cy="11.4" r="0.7" fill="currentColor" />
    </svg>
  )
}

/** git branch glyph. */
function BranchIcon(): JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="4.5" cy="3" r="1.7" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="4.5" cy="13" r="1.7" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="11.5" cy="4" r="1.7" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M4.5 4.7v6.6M11.5 5.7c0 2.4-1.9 3.3-3.9 3.9-1.3.4-2.1.9-2.1 1.7"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * A count rendered as a rounded color badge with a plain-English label,
 * hidden when zero. `label` is the short noun shown in the badge (e.g.
 * "untracked"); `title` is the fuller hover description.
 */
function Stat({
  label,
  value,
  title,
  className = ''
}: {
  label: string
  value: number
  title: string
  className?: string
}): JSX.Element | null {
  if (!value) return null
  return (
    <Tooltip label={title} side="top">
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium tabular-nums ${className}`}
      >
        {value} {label}
      </span>
    </Tooltip>
  )
}

/**
 * Bottom status bar. Shows the project's git state (repo, branch, ahead/behind,
 * and staged/modified/untracked/conflict counts). Read-only: it polls a one-shot
 * `git status` snapshot, refreshed (debounced) whenever the filesystem changes
 * and on a slow periodic fallback for out-of-band changes (commits in a terminal).
 */
export default function StatusBar(): JSX.Element {
  // Shared store: the first fetch is kicked during app boot (App.tsx) so the
  // cached snapshot is usually here by the time the bar mounts.
  const git = useGitStore((s) => s.status)
  const projectName = useProjectStore((s) => s.info?.name ?? '')
  const projectRoot = useProjectStore((s) => s.info?.root ?? '')
  const [crashCount, setCrashCount] = useState(0)
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout>>()

  // Track the number of stored crash reports; refresh live as new ones arrive.
  useEffect(() => {
    let disposed = false
    const load = async (): Promise<void> => {
      const list = await window.ide.logs.list()
      if (!disposed) setCrashCount(list.length)
    }
    void load()
    const off = window.ide.logs.onReported(() => void load())
    return () => {
      disposed = true
      off()
    }
  }, [])

  useEffect(() => {
    const refresh = (): void => void useGitStore.getState().refresh()

    // Refresh on mount (usually a cache hit from the boot kick), then keep fresh.
    refresh()

    // Debounced refresh on any filesystem change (edits, stage, checkout).
    const offFs = window.ide.fs.onChanged(() => {
      clearTimeout(debounce.current)
      debounce.current = setTimeout(refresh, 400)
    })

    // Fallback poll catches changes with no fs event under the root (e.g. a
    // fetch updating ahead/behind, or a commit that only moves .git/).
    const interval = setInterval(refresh, 8000)

    return () => {
      offFs()
      clearTimeout(debounce.current)
      clearInterval(interval)
    }
  }, [])

  return (
    <div
      // `translateZ(0)` promotes the bar to its own compositing layer so the
      // terminal's rapid canvas/DOM repaints (Claude streaming output) don't
      // force the adjacent bar to re-rasterize on every frame — which showed up
      // as a constant flicker while typing. `contain` limits paint/layout to the
      // bar's own box for the same reason.
      className="flex h-9 shrink-0 select-none items-center gap-3 border-t border-ink-border bg-ink-panel pl-5 pr-3 text-[11px] text-ink-muted [contain:layout_paint] [transform:translateZ(0)]"
    >
      {projectName && (
        <span className="inline-flex items-center gap-1" title={projectRoot || projectName}>
          <span className="max-w-[200px] truncate rounded-md border border-ink-border bg-ink-elevated px-2 py-0.5 text-[10px] font-medium text-ink-text">
            {projectName}
          </span>
          <ChevronRight size={12} strokeWidth={2} className="shrink-0 text-ink-muted" />
        </span>
      )}
      {git?.isRepo ? (
        <>
          <span className="inline-flex items-center gap-1.5 text-ink-text" title="Current branch">
            <BranchIcon />
            <span className="max-w-[220px] truncate">{git.branch ?? '—'}</span>
          </span>

          {git.hasUpstream && (git.ahead > 0 || git.behind > 0) && (
            <span className="inline-flex items-center gap-1 tabular-nums" title="Ahead / behind upstream">
              {git.ahead > 0 && <span>↑{git.ahead}</span>}
              {git.behind > 0 && <span>↓{git.behind}</span>}
            </span>
          )}

          <span className="inline-flex items-center gap-1.5">
            <Stat label="staged" value={git.staged} title="Staged changes ready to commit" className="bg-emerald-400/15 text-emerald-300" />
            <Stat label="modified" value={git.modified} title="Modified files (unstaged)" className="bg-amber-400/15 text-amber-300" />
            <Stat label="untracked" value={git.untracked} title="Untracked files" className="bg-sky-400/15 text-sky-300" />
            <Stat label="conflicts" value={git.conflicted} title="Files with merge conflicts" className="bg-red-400/15 text-red-300" />
          </span>

          {git.staged + git.modified + git.untracked + git.conflicted === 0 && (
            <span className="text-ink-muted" title="Working tree clean">
              clean
            </span>
          )}

          {git.stashed > 0 && (
            <span className="tabular-nums" title="Stash entries">
              <span className="nf">⌷</span> {git.stashed}
            </span>
          )}
        </>
      ) : (
        <span className="text-ink-muted">not a git repository</span>
      )}

      <span className="ml-auto truncate text-ink-muted" title="Repository">
        {git?.repo}
      </span>

      <Tooltip
        label={
          crashCount > 0
            ? `${crashCount} crash ${crashCount === 1 ? 'report' : 'reports'} — click to view`
            : 'Diagnostics — no crash reports'
        }
        side="top"
      >
        <button
          onClick={() => setDiagnosticsOpen(true)}
          className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium hover:bg-ink-hover ${
            crashCount > 0 ? 'text-amber-300' : 'text-ink-muted'
          }`}
          aria-label="Open Diagnostics"
        >
          <AlertIcon />
          {crashCount > 0 && <span className="tabular-nums">{crashCount}</span>}
        </button>
      </Tooltip>

      {diagnosticsOpen && <Diagnostics onClose={() => setDiagnosticsOpen(false)} />}
    </div>
  )
}
