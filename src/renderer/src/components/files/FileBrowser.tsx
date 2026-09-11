import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useProjectStore } from '../../stores/project'
import { useFilesStore } from '../../stores/files'
import { basename, dirname, join } from '../../lib/path'
import TreeNode, { type NodeContextTarget } from './TreeNode'
import Tooltip from '../Tooltip'
import type { DirEntry } from '@shared/types'

type MenuAction = 'newFile' | 'newFolder' | 'rename' | 'delete' | 'reveal'

/** A pending name prompt. `resolve` is called with the input, or null on cancel. */
interface PromptState {
  title: string
  label: string
  initial?: string
  confirmLabel: string
  resolve: (value: string | null) => void
}

/** Synthetic DirEntry for the project root (used by the header create buttons). */
function rootEntry(name: string, path: string): DirEntry {
  return { name, path, isDir: true, isSymlink: false, ignored: false }
}

/**
 * Left-panel file browser (spec §5.1). Lazy tree rooted at the project root.
 * The tree data lives in useFilesStore; App routes chokidar events to the store,
 * so this component just reads and re-renders — no manual refresh after mutations.
 */
export default function FileBrowser(): JSX.Element {
  const info = useProjectStore((s) => s.info)
  const root = info?.root ?? null
  const rootChildren = useFilesStore((s) => (root ? s.children[root] : undefined))
  const [menu, setMenu] = useState<NodeContextTarget | null>(null)
  const [prompt, setPrompt] = useState<PromptState | null>(null)

  /**
   * Electron's renderer has no window.prompt(), so we ask for a name with an
   * in-app dialog. Resolves to the trimmed input, or null if cancelled.
   */
  const askName = (opts: Omit<PromptState, 'resolve'>): Promise<string | null> =>
    new Promise((resolve) => {
      setMenu(null) // close the context menu before the dialog takes focus
      setPrompt({ ...opts, resolve })
    })

  // On mount (and whenever the root changes), load + expand the top level.
  useEffect(() => {
    if (!root) return
    void useFilesStore.getState().expandDir(root)
  }, [root])

  // Close the context menu on any outside click / escape.
  useEffect(() => {
    if (!menu) return
    const close = (): void => setMenu(null)
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setMenu(null)
    }
    window.addEventListener('click', close)
    window.addEventListener('contextmenu', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('contextmenu', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  /** For a node, the directory new children should be created inside. */
  const parentDirFor = (entry: DirEntry): string =>
    entry.isDir ? entry.path : dirname(entry.path)

  const runAction = async (action: MenuAction, entry: DirEntry): Promise<void> => {
    try {
      switch (action) {
        case 'newFile': {
          const name = await askName({ title: 'New File', label: 'File name', confirmLabel: 'Create' })
          if (!name) return
          const parent = parentDirFor(entry)
          await window.ide.fs.createFile(join(parent, name))
          // Optimistically make sure the parent is expanded so the new file shows.
          if (entry.isDir) void useFilesStore.getState().expandDir(parent)
          break
        }
        case 'newFolder': {
          const name = await askName({ title: 'New Folder', label: 'Folder name', confirmLabel: 'Create' })
          if (!name) return
          const parent = parentDirFor(entry)
          await window.ide.fs.createDir(join(parent, name))
          if (entry.isDir) void useFilesStore.getState().expandDir(parent)
          break
        }
        case 'rename': {
          const next = await askName({
            title: 'Rename',
            label: 'New name',
            initial: basename(entry.path),
            confirmLabel: 'Rename'
          })
          if (!next || next === basename(entry.path)) return
          await window.ide.fs.rename(entry.path, join(dirname(entry.path), next))
          break
        }
        case 'delete': {
          const ok = window.confirm(`Move "${basename(entry.path)}" to Trash?`)
          if (!ok) return
          await window.ide.fs.trash(entry.path)
          break
        }
        case 'reveal':
          await window.ide.fs.reveal(entry.path)
          break
      }
    } catch (err) {
      // Surface failures without a hard crash; the fs layer validates paths.
      window.alert(`Action failed: ${(err as Error)?.message ?? String(err)}`)
    } finally {
      setMenu(null)
    }
    // No manual tree refresh: chokidar → App → useFilesStore.handleFsChange.
  }

  if (!info) {
    return <div className="flex h-full items-center justify-center bg-ink-sidebar text-xs text-ink-muted">
      Loading…
    </div>
  }

  return (
    <div className="flex h-full flex-col bg-ink-sidebar text-ink-text">
      {/* Header: section label + quick create affordances (project name lives in the title bar). */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-ink-border px-3">
        <span className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
          Explorer
        </span>
        {root && (
          <div className="flex items-center gap-0.5 text-ink-muted">
            <Tooltip label="New File" align="center">
              <button
                aria-label="New File"
                className="flex h-6 w-6 items-center justify-center rounded hover:bg-ink-hover hover:text-ink-text"
                onClick={() => void runAction('newFile', rootEntry(info.name, root))}
              >
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                  <path d="M4 1.5h5L12.5 5v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2.5a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
                  <path d="M9 1.6V5h3.3" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
                  <path d="M7.5 8v4M5.5 10h4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
                </svg>
              </button>
            </Tooltip>
            <Tooltip label="New Folder" align="right">
              <button
                aria-label="New Folder"
                className="flex h-6 w-6 items-center justify-center rounded hover:bg-ink-hover hover:text-ink-text"
                onClick={() => void runAction('newFolder', rootEntry(info.name, root))}
              >
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                  <path d="M1.5 4.2a1 1 0 0 1 1-1h3l1.3 1.4h6.7a1 1 0 0 1 1 1v6.7a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
                  <path d="M8 7v3.4M6.3 8.7h3.4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
                </svg>
              </button>
            </Tooltip>
          </div>
        )}
      </div>

      {/* Tree. Right-clicking empty space (TreeNode rows stopPropagation) targets
          the project root, so you can create/reveal at the top level anywhere. */}
      <div
        role="tree"
        className="min-h-0 flex-1 overflow-auto px-2 py-1"
        onContextMenu={(e) => {
          if (!root) return
          e.preventDefault()
          setMenu({ entry: rootEntry(info.name, root), x: e.clientX, y: e.clientY })
        }}
      >
        {rootChildren?.map((child) => (
          <TreeNode key={child.path} entry={child} depth={0} onContextMenu={setMenu} />
        ))}
        {rootChildren === undefined && (
          <div className="px-3 py-1 text-[11px] text-ink-muted">loading…</div>
        )}
        {rootChildren?.length === 0 && (
          <div className="px-3 py-1 text-[11px] text-ink-muted">empty</div>
        )}
      </div>

      {/* Context menu (spec §5.1). Positioned at the click point. */}
      {menu && (
        <div
          className="fixed z-50 min-w-[160px] rounded border border-ink-border bg-ink-elevated py-1 text-[13px] text-ink-text shadow-lg"
          style={{ left: menu.x, top: menu.y }}
          // Stop the window click handler from closing before the item fires.
          onClick={(e) => e.stopPropagation()}
        >
          <MenuItem label="New File" onClick={() => void runAction('newFile', menu.entry)} />
          <MenuItem label="New Folder" onClick={() => void runAction('newFolder', menu.entry)} />
          {/* Rename/Delete are meaningless for the project root (empty-space target). */}
          {menu.entry.path !== root && (
            <>
              <div className="my-1 h-px bg-ink-border" />
              <MenuItem label="Rename" onClick={() => void runAction('rename', menu.entry)} />
              <MenuItem label="Delete (Move to Trash)" onClick={() => void runAction('delete', menu.entry)} />
            </>
          )}
          <div className="my-1 h-px bg-ink-border" />
          <MenuItem label="Reveal in Finder" onClick={() => void runAction('reveal', menu.entry)} />
        </div>
      )}

      {/* Name prompt (replaces window.prompt, unavailable in Electron). */}
      {prompt && (
        <PromptDialog
          state={prompt}
          onDone={(value) => {
            prompt.resolve(value)
            setPrompt(null)
          }}
        />
      )}
    </div>
  )
}

/** Modal single-field prompt. Enter confirms, Escape / backdrop cancels. */
function PromptDialog({
  state,
  onDone
}: {
  state: PromptState
  onDone: (value: string | null) => void
}): JSX.Element {
  const [value, setValue] = useState(state.initial ?? '')
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus on open; for a rename, select the basename (minus extension) so the
  // user can retype the name while keeping the extension.
  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.focus()
    const dot = el.value.lastIndexOf('.')
    if (dot > 0) el.setSelectionRange(0, dot)
    else el.select()
  }, [])

  const submit = (): void => {
    const trimmed = value.trim()
    onDone(trimmed || null)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center bg-black/50 pt-[18vh] backdrop-blur-sm"
      onMouseDown={() => onDone(null)}
    >
      <div
        className="flex h-fit w-[420px] max-w-[92vw] flex-col gap-4 rounded-2xl border border-white/10 bg-ink-elevated/95 p-5 shadow-2xl backdrop-blur-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="text-sm font-medium text-ink-text">{state.title}</div>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submit()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              onDone(null)
            }
          }}
          placeholder={state.label}
          spellCheck={false}
          className="w-full rounded-lg border border-ink-border bg-ink-sidebar px-3 py-2 text-[13px] text-ink-text placeholder:text-ink-muted focus:border-ink-accent focus:outline-none"
        />
        <div className="flex justify-end gap-2">
          <button
            className="rounded-lg px-3 py-1.5 text-[13px] text-ink-muted hover:bg-ink-hover hover:text-ink-text"
            onClick={() => onDone(null)}
          >
            Cancel
          </button>
          <button
            disabled={!value.trim()}
            className="rounded-lg bg-ink-accent px-3 py-1.5 text-[13px] font-medium text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={submit}
          >
            {state.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function MenuItem({ label, onClick }: { label: string; onClick: () => void }): JSX.Element {
  return (
    <button
      className="block w-full px-3 py-1 text-left hover:bg-ink-accent hover:text-white"
      onClick={onClick}
    >
      {label}
    </button>
  )
}
