import { useEffect, useState } from 'react'
import { FolderKanban, FolderOpen, Pin, PinOff, X } from 'lucide-react'
import type { RecentProject } from '@shared/types'
import { useSettingsStore } from '../stores/settings'
import { usePalette, applyPalette } from '../lib/theme'
import { dirname } from '../lib/path'
import { groupRecent } from '@shared/recentGroups'

// ---------------------------------------------------------------------------
// WelcomeScreen — the project-less start view (spec: launch with no folder).
//
// Rendered instead of the IDE when the window boots with a `#welcome` hash (see
// main.tsx). It shows the app name, an "Open project" action, and the recent-
// projects MRU. Opening a project spawns a project window and dismisses this
// one (main closes it), so this view never transitions into the IDE in place.
// ---------------------------------------------------------------------------

/** Collapse an absolute home path to `~` for a tidier secondary label. */
function tidyPath(p: string): string {
  // The renderer has no `os.homedir`; match the common `/Users/<name>` (macOS)
  // and `/home/<name>` (Linux) shapes so the parent dir reads like the shell.
  return p.replace(/^\/(Users|home)\/[^/]+/, '~')
}

export default function WelcomeScreen(): JSX.Element {
  const [recent, setRecent] = useState<RecentProject[]>([])
  const [grouping, setGrouping] = useState<{ root: string; value: string } | null>(null)
  const palette = usePalette()

  // Load settings (for the theme) and the recent list on mount.
  useEffect(() => {
    let stop: (() => void) | undefined
    void useSettingsStore
      .getState()
      .init()
      .then((s) => (stop = s))
    void window.ide.welcome.recent().then(setRecent)
    document.title = 'Caret'
    return () => stop?.()
  }, [])

  useEffect(() => {
    applyPalette(palette)
  }, [palette])

  // ⌘O / Ctrl+O opens the folder picker, mirroring the File menu.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault()
        void window.ide.welcome.pick()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex h-full flex-col bg-ink-bg text-ink-text">
      {/* Draggable top strip leaving room for the inset traffic lights. */}
      <div className="app-drag h-11 shrink-0" />

      <div className="flex min-h-0 flex-1 items-center justify-center px-8 pb-16">
        <div className="w-full max-w-md">
          {/* Wordmark */}
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-black">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path
                  d="M6 12.5 10 6l4 6.5"
                  stroke="#fff"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div>
              <div className="text-xl font-semibold leading-tight tracking-tight">Caret</div>
              <div className="text-xs text-ink-muted">A minimal three-panel IDE</div>
            </div>
          </div>

          {/* Primary action */}
          <button
            onClick={() => void window.ide.welcome.pick()}
            className="app-no-drag flex w-full items-center gap-3 rounded-lg border border-ink-border bg-ink-panel px-4 py-3 text-left transition-colors hover:border-ink-accent hover:bg-ink-hover"
          >
            <FolderOpen size={18} strokeWidth={1.6} className="shrink-0 text-ink-muted" />
            <div className="min-w-0">
              <div className="text-sm font-medium">Open project…</div>
              <div className="text-xs text-ink-muted">Choose a folder to open</div>
            </div>
          </button>

          {/* Recent projects: named groups first, then the rest; pinned entries lead each. */}
          {recent.length > 0 && (
            <div className="mt-8 max-h-[52vh] overflow-auto">
              {groupRecent(recent).map(({ group, projects }) => (
                <div key={group || '__recent'} className="mb-5">
                  <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
                    {group || 'Recent projects'}
                  </div>
                  <ul className="app-no-drag -mx-2">
                    {projects.map((p) => (
                      <li key={p.root} className="group/row relative">
                        <button
                          onClick={() => void window.ide.welcome.openPath(p.root)}
                          title={p.root}
                          className="flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 pr-24 text-left hover:bg-ink-hover"
                        >
                          {p.pinned && <Pin size={11} className="shrink-0 self-center text-ink-muted" />}
                          <span className="shrink-0 text-sm text-ink-text">{p.name}</span>
                          <span className="min-w-0 flex-1 truncate text-right text-xs text-ink-muted">
                            {tidyPath(dirname(p.root))}
                          </span>
                        </button>
                        {/* Row actions: pin, group, remove. */}
                        <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5 opacity-0 group-hover/row:opacity-100">
                          <button
                            aria-label={p.pinned ? 'Unpin' : 'Pin'}
                            title={p.pinned ? 'Unpin' : 'Pin to top'}
                            onClick={() => void window.ide.welcome.pin(p.root, !p.pinned).then(setRecent)}
                            className="rounded p-1 text-ink-muted hover:bg-ink-active hover:text-ink-text"
                          >
                            {p.pinned ? <PinOff size={12} /> : <Pin size={12} />}
                          </button>
                          <button
                            aria-label="Group"
                            title="Put in a group…"
                            onClick={() => setGrouping({ root: p.root, value: p.group ?? '' })}
                            className="rounded p-1 text-ink-muted hover:bg-ink-active hover:text-ink-text"
                          >
                            <FolderKanban size={12} />
                          </button>
                          <button
                            aria-label="Remove from recents"
                            title="Remove from recents (the folder is not deleted)"
                            onClick={() => void window.ide.welcome.remove(p.root).then(setRecent)}
                            className="rounded p-1 text-ink-muted hover:bg-ink-active hover:text-ink-text"
                          >
                            <X size={12} />
                          </button>
                        </div>
                        {grouping?.root === p.root && (
                          <form
                            className="app-no-drag mx-2 mb-1 flex items-center gap-2"
                            onSubmit={(e) => {
                              e.preventDefault()
                              void window.ide.welcome.setGroup(p.root, grouping.value || null).then(setRecent)
                              setGrouping(null)
                            }}
                          >
                            <input
                              autoFocus
                              value={grouping.value}
                              onChange={(e) => setGrouping({ root: p.root, value: e.target.value })}
                              onKeyDown={(e) => e.key === 'Escape' && setGrouping(null)}
                              placeholder="Group name (empty to ungroup)"
                              list="caret-groups"
                              className="h-7 min-w-0 flex-1 rounded-md border border-ink-border bg-ink-panel px-2 text-xs text-ink-text placeholder:text-ink-muted focus:border-ink-accent focus:outline-none"
                            />
                            <datalist id="caret-groups">
                              {[...new Set(recent.map((r) => r.group).filter(Boolean))].map((g) => (
                                <option key={g} value={g} />
                              ))}
                            </datalist>
                            <button type="submit" className="rounded-md bg-ink-accent px-2 py-1 text-xs text-white">
                              Save
                            </button>
                          </form>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
