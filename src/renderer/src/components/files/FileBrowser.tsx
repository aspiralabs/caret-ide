import { useEffect, useLayoutEffect, useRef, useState, type DragEvent } from 'react'
import { ChevronsDownUp, Eye, EyeOff, MoreHorizontal, Search, X } from 'lucide-react'
import { useProjectStore } from '../../stores/project'
import { useFilesStore } from '../../stores/files'
import { useTabsStore } from '../../stores/tabs'
import { useOverlay } from '../../stores/overlay'
import { useSettingsStore } from '../../stores/settings'
import { useCommandPaletteStore } from '../../stores/commandPalette'
import { useToastStore } from '../../stores/toast'
import { basename, dirname, join } from '../../lib/path'
import { relativePath } from '../../lib/claudeRefs'
import { sendFileReference, sendToClaude } from '../../lib/sendToClaude'
import { fileReference } from '../../lib/claudeRefs'
import { FILE_TEMPLATES } from '../../lib/fileTemplates'
import { entryShown, filterPaths, visibleRows } from '../../lib/treeOps'
import { visibleRange } from '../../lib/virtual'
import { dropLabel, executeDrop, INTERNAL_DRAG_TYPE, planDrop } from '../../lib/treeDrop'
import TreeNode, { type NodeContextTarget } from './TreeNode'
import ChangesSection from './ChangesSection'
import CopyPathItems, { copyText } from '../CopyPathItems'
import Tooltip from '../Tooltip'
import { fileIcon } from './icons'
import type { DirEntry } from '@shared/types'

type MenuAction = 'newFile' | 'newFolder' | 'rename' | 'delete' | 'reveal' | 'duplicate' | 'openExternal'

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
 *
 * Right-click anywhere (header, Changes, empty space) targets the project root;
 * rows target themselves (or the multi-selection). Files dropped from Finder are
 * moved (⌥: copied) into the hovered folder, or the root.
 */
export default function FileBrowser(): JSX.Element {
  const info = useProjectStore((s) => s.info)
  const root = info?.root ?? null
  const rootChildren = useFilesStore((s) => (root ? s.children[root] : undefined))
  const filter = useFilesStore((s) => s.filter)
  const dropTarget = useFilesStore((s) => s.dropTarget)
  const showIgnored = useSettingsStore((s) => s.settings.explorerShowIgnored)
  const showDotfiles = useSettingsStore((s) => s.settings.explorerShowDotfiles)
  const [menu, setMenu] = useState<NodeContextTarget | null>(null)
  const [headerMenu, setHeaderMenu] = useState(false)
  const [prompt, setPrompt] = useState<PromptState | null>(null)
  /** Non-null while files from outside are being dragged over the panel. */
  const [extDrag, setExtDrag] = useState<'move' | 'copy' | null>(null)
  const dragDepth = useRef(0)
  // Both float over the center panel; detach the browser preview while open.
  useOverlay(menu !== null || prompt !== null || headerMenu)

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

  // Auto-reveal the active editor's file (setting: explorerAutoReveal).
  const activeFile = useTabsStore((s) => {
    const t = s.tabs.find((x) => x.id === s.activeId)
    return t?.kind === 'editor' || t?.kind === 'diff' ? t.filePath ?? null : null
  })
  const autoReveal = useSettingsStore((s) => s.settings.explorerAutoReveal)
  useEffect(() => {
    if (!root || !activeFile || !autoReveal) return
    void useFilesStore.getState().revealPath(activeFile, root)
  }, [activeFile, root, autoReveal])

  // Close menus on any outside click / escape.
  useEffect(() => {
    if (!menu && !headerMenu) return
    const close = (): void => {
      setMenu(null)
      setHeaderMenu(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('click', close)
    window.addEventListener('contextmenu', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('contextmenu', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu, headerMenu])

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
          useTabsStore.getState().openFile(join(parent, name))
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
          const target = join(dirname(entry.path), next)
          await window.ide.fs.rename(entry.path, target)
          // Open tabs follow the file (or anything under a renamed folder) so
          // ⌘S never recreates the old path.
          useTabsStore.getState().retargetFile(entry.path, target)
          break
        }
        case 'delete': {
          const ok = window.confirm(`Move "${basename(entry.path)}" to Trash?`)
          if (!ok) return
          await window.ide.fs.trash(entry.path)
          // Drop clean tabs for the trashed file/folder; dirty ones stay so
          // unsaved work isn't lost.
          useTabsStore.getState().closeFilesUnder(entry.path)
          break
        }
        case 'duplicate': {
          // Finder-style "name copy.ext"; main refuses to overwrite so bump the number on collision.
          const dir = dirname(entry.path)
          const { stem, ext } = splitName(basename(entry.path))
          let n = 1
          for (;;) {
            const candidate = join(dir, `${stem} copy${n > 1 ? ` ${n}` : ''}${ext}`)
            try {
              await window.ide.fs.copy(entry.path, candidate)
              useFilesStore.getState().setSelected(candidate)
              break
            } catch (err) {
              if (++n > 50) throw err
            }
          }
          break
        }
        case 'openExternal':
          await window.ide.fs.openExternal(entry.path)
          break
        case 'reveal':
          await window.ide.fs.reveal(entry.path)
          break
      }
    } catch (err) {
      // Surface failures without a hard crash; the fs layer validates paths.
      useToastStore.getState().show(`Action failed: ${(err as Error)?.message ?? String(err)}`)
    } finally {
      setMenu(null)
    }
    // No manual tree refresh: chokidar → App → useFilesStore.handleFsChange.
  }

  /** New file from a template: prompt for the name (pre-filled), write the body, open it. */
  const newFromTemplate = async (entry: DirEntry, templateId: string): Promise<void> => {
    const t = FILE_TEMPLATES.find((x) => x.id === templateId)
    if (!t) return
    const name = await askName({ title: t.label, label: 'File name', initial: t.defaultName, confirmLabel: 'Create' })
    if (!name) return
    const path = join(parentDirFor(entry), name)
    try {
      await window.ide.fs.createFile(path)
      await window.ide.fs.writeFile(path, t.body(name))
      if (entry.isDir) void useFilesStore.getState().expandDir(entry.path)
      useTabsStore.getState().openFile(path)
    } catch (err) {
      useToastStore.getState().show(`Action failed: ${(err as Error)?.message ?? String(err)}`)
    }
  }

  /** Bulk actions over the multi-selection. */
  const bulkTrash = async (paths: string[]): Promise<void> => {
    setMenu(null)
    if (!window.confirm(`Move ${paths.length} items to Trash?`)) return
    for (const p of paths) {
      try {
        await window.ide.fs.trash(p)
        useTabsStore.getState().closeFilesUnder(p)
      } catch (err) {
        useToastStore.getState().show(`Couldn't trash ${basename(p)}: ${(err as Error)?.message ?? String(err)}`)
      }
    }
  }

  // --- External / internal drops onto empty space → project root --------------
  const onPanelDragEnter = (e: DragEvent): void => {
    if (!Array.from(e.dataTransfer.types).includes('Files')) return
    dragDepth.current++
    setExtDrag(e.altKey ? 'copy' : 'move')
  }
  const onPanelDragLeave = (): void => {
    if (dragDepth.current > 0) dragDepth.current--
    if (dragDepth.current === 0) {
      setExtDrag(null)
      useFilesStore.getState().setDropTarget(null)
    }
  }
  const onPanelDragOver = (e: DragEvent): void => {
    const types = Array.from(e.dataTransfer.types)
    if (!types.includes(INTERNAL_DRAG_TYPE) && !types.includes('Files')) return
    e.preventDefault()
    if (types.includes('Files')) {
      const mode = e.altKey ? 'copy' : 'move'
      if (extDrag !== mode) setExtDrag(mode)
      e.dataTransfer.dropEffect = mode
    }
    // Rows stopPropagation when they handle it; reaching here means empty space → root.
    if (root && useFilesStore.getState().dropTarget !== root) useFilesStore.getState().setDropTarget(root)
  }
  const onPanelDrop = (e: DragEvent): void => {
    dragDepth.current = 0
    setExtDrag(null)
    useFilesStore.getState().setDropTarget(null)
    if (!root) return
    const plan = planDrop(e.dataTransfer, e.altKey)
    if (plan.kind === 'none') return
    e.preventDefault()
    void executeDrop(plan, root)
  }

  if (!info) {
    return <div className="flex h-full items-center justify-center bg-ink-sidebar text-xs text-ink-muted">
      Loading…
    </div>
  }

  const selectedPaths = useFilesStore.getState().selectedPaths
  const multi = menu && selectedPaths.size > 1 && selectedPaths.has(menu.entry.path) ? [...selectedPaths] : null

  return (
    <div
      className="relative flex h-full flex-col bg-ink-sidebar text-ink-text"
      // Right-click anywhere that isn't a row → root menu.
      onContextMenu={(e) => {
        if (!root) return
        e.preventDefault()
        setHeaderMenu(false)
        setMenu({ entry: rootEntry(info.name, root), x: e.clientX, y: e.clientY })
      }}
      onDragEnter={onPanelDragEnter}
      onDragLeave={onPanelDragLeave}
      onDragOver={onPanelDragOver}
      onDrop={onPanelDrop}
    >
      {/* Header: section label + filter + quick create affordances. */}
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-ink-border px-3">
        <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-ink-muted">Explorer</span>
        <div className="relative ml-1 min-w-0 flex-1">
          <Search size={12} className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input
            value={filter}
            onChange={(e) => useFilesStore.getState().setFilter(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') useFilesStore.getState().setFilter('')
            }}
            placeholder="Filter files"
            spellCheck={false}
            className="h-6 w-full rounded-md border border-transparent bg-ink-panel pl-6 pr-5 text-[11px] text-ink-text placeholder:text-ink-muted focus:border-ink-accent focus:outline-none"
          />
          {filter && (
            <button
              aria-label="Clear filter"
              onClick={() => useFilesStore.getState().setFilter('')}
              className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-ink-muted hover:text-ink-text"
            >
              <X size={11} />
            </button>
          )}
        </div>
        {root && (
          <div className="flex shrink-0 items-center gap-0.5 text-ink-muted">
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
            <Tooltip label="New Folder" align="center">
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
            <div className="relative">
              <Tooltip label="View options" align="right">
                <button
                  aria-label="View options"
                  aria-expanded={headerMenu}
                  className="flex h-6 w-6 items-center justify-center rounded hover:bg-ink-hover hover:text-ink-text"
                  onClick={(e) => {
                    e.stopPropagation()
                    setMenu(null)
                    setHeaderMenu((o) => !o)
                  }}
                >
                  <MoreHorizontal size={15} />
                </button>
              </Tooltip>
              {headerMenu && (
                <div
                  className="absolute right-0 top-full z-50 mt-1 min-w-[200px] rounded border border-ink-border bg-ink-elevated py-1 text-[13px] text-ink-text shadow-lg"
                  onClick={(e) => e.stopPropagation()}
                  onContextMenu={(e) => e.stopPropagation()}
                >
                  <MenuItem
                    label="Collapse all"
                    icon={<ChevronsDownUp size={13} />}
                    onClick={() => {
                      useFilesStore.getState().collapseAll()
                      setHeaderMenu(false)
                    }}
                  />
                  <div className="my-1 h-px bg-ink-border" />
                  <MenuItem
                    label={`${showIgnored ? 'Hide' : 'Show'} git-ignored files`}
                    icon={showIgnored ? <EyeOff size={13} /> : <Eye size={13} />}
                    onClick={() => void useSettingsStore.getState().update({ explorerShowIgnored: !showIgnored })}
                  />
                  <MenuItem
                    label={`${showDotfiles ? 'Hide' : 'Show'} dotfiles`}
                    icon={showDotfiles ? <EyeOff size={13} /> : <Eye size={13} />}
                    onClick={() => void useSettingsStore.getState().update({ explorerShowDotfiles: !showDotfiles })}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <ChangesSection />

      {/* Tree (virtualised), or flat filter results while a filter is typed. */}
      {filter.trim() ? (
        <FilterResults root={root ?? ''} query={filter} />
      ) : (
        <VirtualTree root={root ?? ''} loaded={rootChildren !== undefined} onContextMenu={setMenu} />
      )}

      {/* Drop overlay while files from Finder are over the panel: names the target folder. */}
      {extDrag && root && (
        <div className="pointer-events-none absolute inset-2 z-40 flex items-end justify-center rounded-lg border-2 border-dashed border-ink-accent bg-ink-accent/10 pb-4">
          <span className="rounded-md bg-ink-elevated px-3 py-1.5 text-xs font-medium text-ink-text shadow">
            {dropLabel(extDrag === 'copy' ? 'external-copy' : 'external-move', dropTarget ?? root, root)}
          </span>
        </div>
      )}

      {/* Context menu (spec §5.1). Positioned at the click point. */}
      {menu && (
        <div
          className="fixed z-50 min-w-[200px] rounded border border-ink-border bg-ink-elevated py-1 text-[13px] text-ink-text shadow-lg"
          style={{ left: menu.x, top: menu.y }}
          // Stop the window click handler from closing before the item fires.
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
        >
          {multi ? (
            <>
              <div className="px-3 py-1 text-[11px] text-ink-muted">{multi.length} items selected</div>
              <MenuItem
                label="Add all to Claude Prompt"
                onClick={() => {
                  const r = root ?? ''
                  sendToClaude(multi.map((p) => fileReference(p, r)).join(' ') + ' ', null)
                  setMenu(null)
                }}
              />
              <MenuItem
                label="Copy Paths"
                onClick={() => {
                  copyText(multi.join('\n'))
                  setMenu(null)
                }}
              />
              <MenuItem
                label="Copy Relative Paths"
                onClick={() => {
                  copyText(multi.map((p) => relativePath(p, root ?? '')).join('\n'))
                  setMenu(null)
                }}
              />
              <div className="my-1 h-px bg-ink-border" />
              <MenuItem label={`Move ${multi.length} to Trash`} onClick={() => void bulkTrash(multi)} />
            </>
          ) : (
            <>
              <MenuItem label="New File" onClick={() => void runAction('newFile', menu.entry)} />
              <MenuItem label="New Folder" onClick={() => void runAction('newFolder', menu.entry)} />
              <Submenu label="New File from Template">
                {FILE_TEMPLATES.map((t) => (
                  <MenuItem key={t.id} label={t.label} onClick={() => void newFromTemplate(menu.entry, t.id)} />
                ))}
              </Submenu>
              {/* Rename/Delete are meaningless for the project root (empty-space target). */}
              {menu.entry.path !== root && (
                <>
                  <div className="my-1 h-px bg-ink-border" />
                  <MenuItem label="Rename" onClick={() => void runAction('rename', menu.entry)} />
                  <MenuItem label="Duplicate" onClick={() => void runAction('duplicate', menu.entry)} />
                  <MenuItem label="Delete (Move to Trash)" onClick={() => void runAction('delete', menu.entry)} />
                  <div className="my-1 h-px bg-ink-border" />
                  <MenuItem
                    label="Add to Claude Prompt"
                    onClick={() => {
                      sendFileReference(menu.entry.path)
                      setMenu(null)
                    }}
                  />
                  <div className="my-1 h-px bg-ink-border" />
                  <CopyPathItems path={menu.entry.path} MenuItem={MenuItem} onDone={() => setMenu(null)} />
                </>
              )}
              <div className="my-1 h-px bg-ink-border" />
              {menu.entry.path !== root && !menu.entry.isDir && (
                <MenuItem label="Open in Default App" onClick={() => void runAction('openExternal', menu.entry)} />
              )}
              <MenuItem label="Reveal in Finder" onClick={() => void runAction('reveal', menu.entry)} />
            </>
          )}
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

const ROW_HEIGHT = 24

/**
 * Flat, windowed rendering of the tree: only rows within the scroll viewport
 * (plus overscan) mount, so a repo with tens of thousands of expanded entries
 * stays smooth. Rows come from `visibleRows` over the store's children +
 * expanded sets, filtered by the show-ignored / dotfiles toggles.
 */
function VirtualTree({
  root,
  loaded,
  onContextMenu
}: {
  root: string
  loaded: boolean
  onContextMenu: (t: NodeContextTarget) => void
}): JSX.Element {
  const children = useFilesStore((s) => s.children)
  const expanded = useFilesStore((s) => s.expanded)
  const showIgnored = useSettingsStore((s) => s.settings.explorerShowIgnored)
  const showDotfiles = useSettingsStore((s) => s.settings.explorerShowDotfiles)
  const rows = visibleRows(root, children, expanded, (e) => entryShown(e, { showIgnored, showDotfiles }))
  const scrollRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState({ top: 0, height: 600 })

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const update = (): void => setViewport({ top: el.scrollTop, height: el.clientHeight })
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [])

  const { start, end, topPad, bottomPad } = visibleRange(viewport.top, viewport.height, ROW_HEIGHT, rows.length)

  return (
    <div ref={scrollRef} role="tree" className="min-h-0 flex-1 overflow-auto px-2 py-1">
      {!loaded && <div className="px-3 py-1 text-[11px] text-ink-muted">loading…</div>}
      {loaded && rows.length === 0 && <div className="px-3 py-1 text-[11px] text-ink-muted">empty</div>}
      <div style={{ height: topPad }} />
      {rows.slice(start, end).map(({ entry, depth }) => (
        <TreeNode key={entry.path} entry={entry} depth={depth} onContextMenu={onContextMenu} />
      ))}
      <div style={{ height: bottomPad }} />
    </div>
  )
}

/** `report.final.pdf` → stem/ext (dotfiles keep no ext). */
function splitName(name: string): { stem: string; ext: string } {
  const i = name.lastIndexOf('.')
  return i <= 0 ? { stem: name, ext: '' } : { stem: name.slice(0, i), ext: name.slice(i) }
}

/**
 * Flat results for the header filter: every project file (the quick-open
 * list) whose path contains the query, basename hits first. Click opens.
 */
function FilterResults({ root, query }: { root: string; query: string }): JSX.Element {
  const files = useCommandPaletteStore((s) => s.files)
  useEffect(() => {
    void useCommandPaletteStore.getState().ensureFiles()
  }, [])
  const hits = files ? filterPaths(files.map((f) => f.rel), query) : null
  return (
    <div className="min-h-0 flex-1 overflow-auto px-2 py-1">
      {hits === null && <div className="px-3 py-1 text-[11px] text-ink-muted">loading…</div>}
      {hits?.length === 0 && <div className="px-3 py-1 text-[11px] text-ink-muted">No files match</div>}
      {hits?.map((rel) => {
        const abs = join(root, rel)
        const name = basename(rel)
        const dir = rel.slice(0, rel.length - name.length).replace(/\/$/, '')
        return (
          <div
            key={rel}
            role="button"
            title={abs}
            onClick={() => {
              useFilesStore.getState().setSelected(abs)
              useTabsStore.getState().openFile(abs)
            }}
            className="flex h-[24px] cursor-pointer items-center gap-1.5 rounded-md px-2 text-[13px] leading-none text-ink-tree hover:bg-ink-hover"
          >
            <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center">{fileIcon(name)}</span>
            <span className="truncate">{name}</span>
            {dir && <span className="min-w-0 truncate text-[11px] text-ink-muted">{dir}</span>}
          </div>
        )
      })}
    </div>
  )
}

/** Hover-to-open nested menu (templates). */
function Submenu({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button className="flex w-full items-center justify-between px-3 py-1 text-left hover:bg-ink-accent hover:text-white">
        {label}
        <span className="text-ink-muted">›</span>
      </button>
      {open && (
        <div className="absolute left-full top-0 z-50 -ml-px min-w-[220px] rounded border border-ink-border bg-ink-elevated py-1 shadow-lg">
          {children}
        </div>
      )}
    </div>
  )
}

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

function MenuItem({
  label,
  icon,
  onClick
}: {
  label: string
  icon?: React.ReactNode
  onClick: () => void
}): JSX.Element {
  return (
    <button
      className="flex w-full items-center gap-2 px-3 py-1 text-left hover:bg-ink-accent hover:text-white"
      onClick={onClick}
    >
      {icon && <span className="inline-flex w-4 shrink-0 items-center justify-center">{icon}</span>}
      {label}
    </button>
  )
}
