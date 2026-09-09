import { useEffect, useState } from 'react'
import { FolderOpen } from 'lucide-react'
import type { RecentProject } from '@shared/types'
import { useSettingsStore } from '../stores/settings'
import { useEffectiveTheme, applyThemeClass } from '../lib/theme'
import { dirname } from '../lib/path'

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
  const effectiveTheme = useEffectiveTheme()

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
    applyThemeClass(effectiveTheme)
  }, [effectiveTheme])

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

          {/* Recent projects */}
          {recent.length > 0 && (
            <div className="mt-8">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
                Recent projects
              </div>
              <ul className="app-no-drag -mx-2">
                {recent.map((p) => (
                  <li key={p.root}>
                    <button
                      onClick={() => void window.ide.welcome.openPath(p.root)}
                      title={p.root}
                      className="group flex w-full items-baseline gap-3 rounded-md px-2 py-1.5 text-left hover:bg-ink-hover"
                    >
                      <span className="shrink-0 text-sm text-ink-text">{p.name}</span>
                      <span className="min-w-0 flex-1 truncate text-right text-xs text-ink-muted">
                        {tidyPath(dirname(p.root))}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
