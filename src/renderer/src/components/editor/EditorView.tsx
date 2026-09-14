// Side-effect import FIRST: configures Monaco to load locally (CSP: script-src 'self')
// and wires the bundled web workers. Must run before <Editor/> mounts.
import './setupMonaco'

import { useEffect, useRef, useState } from 'react'
import { Code2, Eye } from 'lucide-react'
import Editor, { type OnMount } from '@monaco-editor/react'
import type * as monaco from 'monaco-editor'
import { useTabsStore, type CenterTab } from '../../stores/tabs'
import { getEditor, registerEditor } from '../../lib/editorBridge'
import { languageForPath } from './language'
import { extname } from '../../lib/path'
import MarkdownEditor from './MarkdownEditor'
import MediaView from './MediaView'
import { mediaKindForPath } from './mediaKind'
import { getPreviewMode, setPreviewMode } from '../../lib/markdownView'
import { mdGetContent, mdSetContent, mdGetBaseline, mdSetBaseline } from '../../lib/markdownDoc'
import { useSettingsStore } from '../../stores/settings'
import { useCommandPaletteStore } from '../../stores/commandPalette'
import { useEffectiveTheme, monacoTheme } from '../../lib/theme'
import { useGitStore } from '../../stores/git'
import { useProjectStore } from '../../stores/project'
import { isScratchpad, sendScratchpad } from '../../lib/scratchpad'
import { Send } from 'lucide-react'
import { diffLines, gutterMarkers } from '../../lib/lineDiff'
import { monacoOptionsFromSettings } from './editorOptions'
import { takePendingReveal } from '../../lib/editorReveal'
import { flattenNavTree, markdownHeadings, type DocSymbol } from '../../lib/symbols'
import { reportFormat, requestFormat } from '../../lib/format'
import { afterSaveReload } from '../../lib/preview'
import type { FormatResult } from '@shared/types'
import {
  getFileMeta,
  setFileMeta,
  setViewPosition,
  takeViewPosition,
  type ViewPosition,
  getEditorBaseline,
  getEditorModel,
  hasEditorBaseline,
  setEditorBaseline,
  setEditorModel,
  takePendingContent
} from '../../lib/editorModels'

type IEditor = monaco.editor.IStandaloneCodeEditor
type ITextModel = monaco.editor.ITextModel

// Per-file Monaco models + saved baselines live in lib/editorModels, keyed by
// absolute path, so switching tabs (which unmounts/remounts EditorView)
// preserves undo history. They're disposed when the tab closes (tabs.closeTab)
// — never on unmount (keepCurrentModel).

interface DiskConflict {
  /** New content on disk we could reload to. */
  content: string
}

export default function EditorView({ tab }: { tab: CenterTab }): JSX.Element {
  const filePath = tab.filePath ?? ''

  // Markdown files are handled by a dedicated CodeMirror 6 editor (Obsidian-style
  // live preview). Non-markdown files use Monaco below. A tab's file type is fixed
  // for its lifetime, so this early return keeps hook order consistent.
  const isMarkdown = ['.md', '.mdx', '.markdown'].includes(extname(filePath).toLowerCase())
  if (isMarkdown) return <MarkdownTabView tab={tab} filePath={filePath} />

  // Images / PDFs get a viewer instead of a text editor.
  const media = mediaKindForPath(filePath)
  if (media) return <MediaView tab={tab} kind={media} />

  return <MonacoEditor tab={tab} filePath={filePath} />
}

/**
 * A markdown tab: Live Preview (CodeMirror) or Source (Monaco), switchable via a
 * segmented control. Both editors share the per-file buffer in lib/markdownDoc,
 * so toggling never loses content. Only one is mounted at a time.
 */
function MarkdownTabView({ tab, filePath }: { tab: CenterTab; filePath: string }): JSX.Element {
  const [mode, setMode] = useState<'preview' | 'source'>(() => {
    const remembered = getPreviewMode(filePath)
    const preview =
      remembered !== undefined
        ? remembered
        : useSettingsStore.getState().settings.markdownDefaultOpenAs === 'preview'
    return preview ? 'preview' : 'source'
  })
  const choose = (next: 'preview' | 'source'): void => {
    if (next === mode) return
    // Carry the caret + scroll across: the outgoing editor unmounts and the
    // incoming one restores this on mount (both share the same buffer, so a
    // line/column mapping is exact).
    const pos = getEditor(tab.id)?.getViewPosition?.()
    if (pos) setViewPosition(filePath, pos)
    setMode(next)
    setPreviewMode(filePath, next === 'preview')
  }
  const root = useProjectStore((s) => s.info?.root ?? '')
  const scratch = isScratchpad(filePath, root)

  return (
    <div className="relative h-full w-full">
      {mode === 'preview' ? (
        <MarkdownEditor tab={tab} />
      ) : (
        <MonacoEditor tab={tab} filePath={filePath} markdown />
      )}
      {scratch && (
        <button
          onClick={() => sendScratchpad(tab.id, filePath)}
          title="Send the selection (or the whole file) to the running Claude Code session"
          className="absolute right-[180px] top-2.5 z-30 inline-flex items-center gap-1.5 rounded-lg border border-ink-border bg-ink-accent px-2.5 py-1 text-xs font-medium text-white shadow-lg hover:brightness-110"
        >
          <Send size={12} strokeWidth={2} />
          Send to Claude
        </button>
      )}
      <div className="absolute right-3 top-2.5 z-30 inline-flex items-center gap-0.5 rounded-lg border border-ink-border bg-ink-elevated/95 p-0.5 text-xs shadow-lg backdrop-blur">
        <SegButton active={mode === 'preview'} onClick={() => choose('preview')} Icon={Eye}>
          Preview
        </SegButton>
        <SegButton active={mode === 'source'} onClick={() => choose('source')} Icon={Code2}>
          Source
        </SegButton>
      </div>
    </div>
  )
}

function SegButton({
  active,
  onClick,
  Icon,
  children
}: {
  active: boolean
  onClick: () => void
  Icon: typeof Eye
  children: React.ReactNode
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 transition-colors ${
        active ? 'bg-ink-active text-ink-text' : 'text-ink-muted hover:text-ink-text'
      }`}
    >
      <Icon size={13} strokeWidth={1.5} />
      {children}
    </button>
  )
}

/**
 * The Monaco-backed editor. Used for all non-markdown files, and for the Source
 * mode of a markdown tab (`markdown` prop) — in which case it reads/writes the
 * shared markdown buffer (lib/markdownDoc) instead of its own baseline, so it
 * stays in sync with the CodeMirror Preview editor.
 */
function MonacoEditor({
  tab,
  filePath,
  markdown = false
}: {
  tab: CenterTab
  filePath: string
  markdown?: boolean
}): JSX.Element {
  const settings = useSettingsStore((s) => s.settings)
  const editorOptions = monacoOptionsFromSettings(settings)
  const effectiveTheme = useEffectiveTheme()

  const [binary, setBinary] = useState(false)
  const [deleted, setDeleted] = useState(false)
  /** Set when the file couldn't be read (e.g. a restored tab whose file is gone). */
  const [loadError, setLoadError] = useState<string | null>(null)
  const [conflict, setConflict] = useState<DiskConflict | null>(null)
  const [loaded, setLoaded] = useState(false)

  const editorRef = useRef<IEditor | null>(null)
  const modelRef = useRef<ITextModel | null>(null)
  // Mirror of the tab's dirty flag for the editorBridge isDirty() closure.
  const dirtyRef = useRef<boolean>(tab.dirty ?? false)

  // Baseline + live-content accessors. For markdown they route to the shared
  // markdownDoc buffer (kept in sync with the CM6 Preview editor); otherwise the
  // Monaco model itself is the buffer and only a baseline is tracked here.
  const readBaseline = (): string =>
    (markdown ? mdGetBaseline(filePath) : getEditorBaseline(filePath)) ?? ''
  const writeBaseline = (v: string): void => {
    if (markdown) mdSetBaseline(filePath, v)
    else setEditorBaseline(filePath, v)
  }
  const hasBaseline = (): boolean =>
    markdown ? mdGetBaseline(filePath) !== undefined : hasEditorBaseline(filePath)

  // --- Load the file (or reuse a cached model) --------------------------------
  useEffect(() => {
    let cancelled = false
    setLoaded(false)
    setBinary(false)
    setDeleted(false)
    setLoadError(null)
    setConflict(null)

    void (async () => {
      let res: Awaited<ReturnType<typeof window.ide.fs.readFile>>
      try {
        res = await window.ide.fs.readFile(filePath)
      } catch (err) {
        // ENOENT (a restored tab whose file was deleted), a path outside the
        // root, etc. Render a notice instead of letting the rejection escape
        // as a crash report.
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err))
        return
      }
      if (cancelled) return
      if (res.binary) {
        setBinary(true)
        setLoaded(true)
        return
      }
      setFileMeta(filePath, { encoding: res.encoding, bom: res.bom, eol: res.eol })
      // Seed the saved baseline (and, for markdown, the shared buffer) on first sight.
      if (!hasBaseline()) writeBaseline(res.content)
      if (markdown && mdGetContent(filePath) === undefined) mdSetContent(filePath, res.content)
      setLoaded(true)
    })()

    return () => {
      cancelled = true
    }
  }, [filePath])

  // --- Dirty recomputation ----------------------------------------------------
  const recomputeDirty = (): void => {
    const model = modelRef.current
    if (!model) return
    const value = model.getValue()
    // Keep the shared markdown buffer current so Preview picks up Source edits.
    if (markdown) mdSetContent(filePath, value)
    const dirty = value !== readBaseline()
    dirtyRef.current = dirty
    // Only push if it changed, to avoid needless store churn.
    if ((useTabsStore.getState().getById(tab.id)?.dirty ?? false) !== dirty) {
      useTabsStore.getState().setDirty(tab.id, dirty)
    }
  }

  // --- Format (Prettier) ------------------------------------------------------
  // Applied through pushEditOperations so undo history, cursor and scroll
  // survive; the caret lands where formatWithCursor mapped it.
  const format = async (explicit = true): Promise<FormatResult> => {
    const model = modelRef.current
    const editor = editorRef.current
    if (!model || !editor) return { kind: 'error', message: 'Editor not ready' }
    const pos = editor.getPosition()
    const res = await requestFormat(filePath, model.getValue(), pos ? model.getOffsetAt(pos) : 0)
    if (res.kind === 'formatted' && res.changed && modelRef.current === model) {
      const view = editor.saveViewState()
      model.pushEditOperations([], [{ range: model.getFullModelRange(), text: res.formatted }], () => null)
      if (view) editor.restoreViewState(view)
      editor.setPosition(model.getPositionAt(res.cursorOffset))
      editor.revealPositionInCenterIfOutsideViewport(model.getPositionAt(res.cursorOffset))
      recomputeDirty()
    }
    reportFormat(res, explicit)
    return res
  }

  // --- Save -------------------------------------------------------------------
  const save = async (): Promise<void> => {
    const model = modelRef.current
    if (!model) return
    // Format on save: never while a disk conflict is pending (the user is
    // choosing between two versions), and an error still saves the raw text.
    if (useSettingsStore.getState().settings.formatOnSave && !conflict) await format(false)
    const value = model.getValue()
    await window.ide.fs.writeFile(filePath, value, getFileMeta(filePath))
    writeBaseline(value)
    if (markdown) mdSetContent(filePath, value)
    dirtyRef.current = false
    useTabsStore.getState().setDirty(tab.id, false)
    // Saving resolves any pending disk conflict.
    setConflict(null)
    afterSaveReload()
  }

  // Keep the editor in sync with the settings toggles (onMount runs once).
  useEffect(() => {
    editorRef.current?.updateOptions(editorOptions)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.wordWrap, settings.editorFontSize, settings.editorMinimap, settings.editorBracketPairs, settings.editorStickyScroll])

  // Register with the bridge so global ⌘S / dirty-close prompt can drive us.
  useEffect(() => {
    const unregister = registerEditor(tab.id, {
      save,
      isDirty: () => dirtyRef.current,
      focus: () => editorRef.current?.focus(),
      revert: async () => {
        const res = await window.ide.fs.readFile(filePath)
        if (!res.binary) applyDiskContent(res.content)
      },
      format: () => format(true),
      getViewPosition: () => monacoViewPosition(editorRef.current),
      setViewPosition: (pos) => applyMonacoViewPosition(editorRef.current, pos),
      find: () => runEditorAction(editorRef.current, 'actions.find'),
      goToLine: () => runEditorAction(editorRef.current, 'editor.action.gotoLine'),
      getSelection: () => {
        const editor = editorRef.current
        const model = modelRef.current
        const sel = editor?.getSelection()
        if (!editor || !model || !sel || sel.isEmpty()) return null
        return {
          text: model.getValueInRange(sel),
          startLine: sel.startLineNumber,
          // A selection ending at column 1 of the next line doesn't include it.
          endLine: sel.endColumn === 1 && sel.endLineNumber > sel.startLineNumber ? sel.endLineNumber - 1 : sel.endLineNumber
        }
      },
      revealLine: (line, column = 1) => revealIn(editorRef.current, line, column),
      getSymbols: () => documentSymbols(modelRef.current, filePath)
    })
    return unregister
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.id, filePath])

  // --- External change subscription (spec §5.2) -------------------------------
  useEffect(() => {
    const off = window.ide.fs.onChanged((e) => {
      if (e.path !== filePath) return
      if (e.kind === 'unlink') {
        setDeleted(true)
        return
      }
      if (e.kind !== 'change') return
      void (async () => {
        const res = await window.ide.fs.readFile(filePath)
        if (res.binary) return
        const model = modelRef.current
        if (!model) return
        // If the buffer already matches disk, nothing to do.
        if (model.getValue() === res.content) {
          writeBaseline(res.content)
          recomputeDirty()
          return
        }
        if (dirtyRef.current) {
          // User has unsaved edits: don't clobber — offer a choice.
          setConflict({ content: res.content })
        } else {
          // Non-dirty: silently reload, preserving cursor/scroll where possible.
          applyDiskContent(res.content)
        }
      })()
    })
    return off
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath])

  /** Replace buffer content from disk while keeping the view state stable. */
  const applyDiskContent = (content: string): void => {
    const editor = editorRef.current
    const model = modelRef.current
    if (!editor || !model) return
    const view = editor.saveViewState()
    // pushEditOperations keeps undo history coherent vs. setValue.
    model.pushEditOperations(
      [],
      [{ range: model.getFullModelRange(), text: content }],
      () => null
    )
    if (view) editor.restoreViewState(view)
    writeBaseline(content)
    if (markdown) mdSetContent(filePath, content)
    dirtyRef.current = false
    useTabsStore.getState().setDirty(tab.id, false)
    setConflict(null)
    setDeleted(false)
  }

  // --- Git gutter (HEAD ↔ buffer) ---------------------------------------------
  // The file's content at HEAD, refetched whenever git status changes (commit,
  // checkout, stash) so markers reflect the current base. null = not tracked.
  const gitStatus = useGitStore((s) => s.status)
  const headRef = useRef<string | null>(null)
  const decorationsRef = useRef<monaco.editor.IEditorDecorationsCollection | null>(null)
  const gutterTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refreshGutter = (): void => {
    const model = modelRef.current
    const editor = editorRef.current
    if (!model || !editor) return
    const head = headRef.current
    if (head === null) {
      decorationsRef.current?.clear()
      return
    }
    const markers = gutterMarkers(diffLines(head, model.getValue()))
    const decos: monaco.editor.IModelDeltaDecoration[] = markers.map((m) => ({
      range: { startLineNumber: m.line, startColumn: 1, endLineNumber: m.line, endColumn: 1 },
      options: {
        isWholeLine: false,
        linesDecorationsClassName: `git-gutter git-gutter-${m.kind}`,
        overviewRuler: undefined
      }
    }))
    if (!decorationsRef.current) decorationsRef.current = editor.createDecorationsCollection(decos)
    else decorationsRef.current.set(decos)
  }
  const scheduleGutter = (): void => {
    if (gutterTimer.current) clearTimeout(gutterTimer.current)
    gutterTimer.current = setTimeout(() => {
      gutterTimer.current = null
      refreshGutter()
    }, 200)
  }

  useEffect(() => {
    let cancelled = false
    if (!gitStatus?.isRepo) {
      headRef.current = null
      refreshGutter()
      return
    }
    void window.ide.git
      .showHead(filePath)
      .then((head) => {
        if (cancelled) return
        headRef.current = head
        refreshGutter()
      })
      .catch(() => {})
    return () => {
      cancelled = true
      if (gutterTimer.current) clearTimeout(gutterTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath, gitStatus, loaded])

  // --- Monaco mount -----------------------------------------------------------
  const handleMount: OnMount = (editor, monacoApi) => {
    editorRef.current = editor
    decorationsRef.current = null

    // Reuse a cached model per path (preserves undo/scroll across tab switches),
    // otherwise create one seeded from the loaded baseline — or from the buffer
    // carried over a rename (unsaved edits follow the file to its new path).
    let model = getEditorModel(filePath) as ITextModel | undefined
    if (!model) {
      const uri = monacoApi.Uri.file(filePath)
      const carried = takePendingContent(filePath)
      const seed =
        carried ?? (markdown ? (mdGetContent(filePath) ?? readBaseline()) : readBaseline())
      const existing = monacoApi.editor.getModel(uri)
      if (existing && carried !== undefined) existing.setValue(carried)
      model = existing ?? monacoApi.editor.createModel(seed, languageForPath(filePath), uri)
      setEditorModel(filePath, model)
    }
    modelRef.current = model
    editor.setModel(model)

    // Entering Source mode: the shared buffer may have advanced while editing in
    // Preview — re-seed the (cached) model so Monaco shows the latest text.
    if (markdown) {
      const cur = mdGetContent(filePath)
      if (cur !== undefined && cur !== model.getValue()) model.setValue(cur)
    }

    // ⌘S while focused (in addition to the global bridge shortcut).
    editor.addCommand(monacoApi.KeyMod.CtrlCmd | monacoApi.KeyCode.KeyS, () => {
      void save()
    })

    // ⌘P / ⌘⇧P — open the app command palette. Monaco binds these to its own
    // "Go to File" / command palette and swallows the keydown before it can reach
    // the app-global handler, so we override them here to route to our palette.
    editor.addCommand(monacoApi.KeyMod.CtrlCmd | monacoApi.KeyCode.KeyP, () => {
      useCommandPaletteStore.getState().openPalette('')
    })
    editor.addCommand(
      monacoApi.KeyMod.CtrlCmd | monacoApi.KeyMod.Shift | monacoApi.KeyCode.KeyP,
      () => {
        useCommandPaletteStore.getState().openPalette('>')
      }
    )

    editor.onDidChangeModelContent(() => {
      recomputeDirty()
      scheduleGutter()
    })
    recomputeDirty()
    refreshGutter()

    // A "go to line" queued before we mounted (search result, breadcrumb…),
    // else the position handed over from the Preview editor.
    const jump = takePendingReveal(filePath)
    if (jump) revealIn(editor, jump.line, jump.column ?? 1)
    else {
      const vp = takeViewPosition(filePath)
      if (vp) applyMonacoViewPosition(editor, vp)
    }
  }

  if (binary) {
    return (
      <div className="flex h-full items-center justify-center bg-ink-panel text-sm text-ink-muted">
        Binary file not shown
      </div>
    )
  }

  if (loadError) return <LoadErrorNotice tabId={tab.id} filePath={filePath} error={loadError} />

  return (
    <div className="relative h-full w-full bg-ink-panel">
      {/* Non-blocking disk-conflict bar (spec §5.2). */}
      {conflict && (
        <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-2 border-b border-ink-border bg-ink-elevated px-3 py-1.5 text-xs text-ink-text">
          <span>File changed on disk</span>
          <div className="flex items-center gap-2">
            <button
              className="rounded bg-ink-accent px-2 py-0.5 text-white hover:bg-ink-accentHover"
              onClick={() => applyDiskContent(conflict.content)}
            >
              Reload
            </button>
            <button
              className="rounded bg-ink-active px-2 py-0.5 text-ink-text hover:bg-ink-hover"
              onClick={() => setConflict(null)}
            >
              Keep mine
            </button>
          </div>
        </div>
      )}

      {/* Subtle deleted-on-disk note (optional per spec). */}
      {deleted && !conflict && (
        <div className="absolute inset-x-0 top-0 z-20 border-b border-ink-border bg-ink-elevated px-3 py-1 text-xs text-ink-muted">
          File deleted on disk — unsaved buffer kept
        </div>
      )}

      {loaded && (
        <Editor
          // Remount when the tab is retargeted by a rename so onMount binds the
          // model for the new path.
          key={filePath}
          // Reuse our own cached model in onMount; don't let the wrapper create
          // its own from `path`, and never dispose it on unmount.
          keepCurrentModel
          theme={monacoTheme(effectiveTheme)}
          onMount={handleMount}
          options={{
            ...editorOptions,
            automaticLayout: true,
            scrollBeyondLastLine: false,
            // Match the file-explorer scrollbar width (10px, per index.css).
            scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
            // Drop the 1px divider Monaco draws left of the scrollbar/ruler lane,
            // and the ruler lane itself (the blue cursor/marker dashes it renders).
            overviewRulerBorder: false,
            overviewRulerLanes: 0,
            // Let the TS worker classify functions/variables/properties/classes
            // so the slim-dark semantic token colors apply.
            'semanticHighlighting.enabled': true
          }}
        />
      )}
    </div>
  )
}

/** Caret + first visible line of a Monaco editor. */
function monacoViewPosition(editor: IEditor | null): ViewPosition | null {
  if (!editor) return null
  const pos = editor.getPosition()
  const top = editor.getVisibleRanges()[0]?.startLineNumber ?? 1
  return { line: pos?.lineNumber ?? 1, column: pos?.column ?? 1, topLine: top }
}

/** Restore a caret + scroll position without animating. */
function applyMonacoViewPosition(editor: IEditor | null, vp: ViewPosition): void {
  if (!editor) return
  const model = editor.getModel()
  const max = model?.getLineCount() ?? vp.line
  const line = Math.min(Math.max(1, vp.line), max)
  editor.setPosition({ lineNumber: line, column: vp.column })
  editor.setScrollTop(editor.getTopForLineNumber(Math.min(Math.max(1, vp.topLine), max)))
}

/** Put the caret at line/column and centre it. */
function revealIn(editor: IEditor | null, line: number, column: number): void {
  if (!editor) return
  const model = editor.getModel()
  const lineNumber = Math.min(Math.max(1, line), model?.getLineCount() ?? line)
  editor.setPosition({ lineNumber, column })
  editor.revealLineInCenter(lineNumber)
  editor.focus()
}

/**
 * Symbols for the palette's `@` mode: TS/JS from Monaco's TypeScript worker
 * (navigation tree), markdown from its headings; empty for other languages.
 */
async function documentSymbols(model: ITextModel | null, filePath: string): Promise<DocSymbol[]> {
  if (!model) return []
  const lang = languageForPath(filePath)
  if (lang === 'markdown' || lang === 'mdx') return markdownHeadings(model.getValue())
  if (lang !== 'typescript' && lang !== 'javascript') return []
  try {
    const monacoApi = await import('monaco-editor')
    const getWorker =
      lang === 'typescript'
        ? monacoApi.languages.typescript.getTypeScriptWorker
        : monacoApi.languages.typescript.getJavaScriptWorker
    const worker = await (await getWorker())(model.uri)
    const tree = (await worker.getNavigationTree(model.uri.toString())) as Parameters<typeof flattenNavTree>[0]
    return flattenNavTree(tree, (offset) => model.getPositionAt(offset).lineNumber)
  } catch {
    return []
  }
}

/** Focus the editor and run one of Monaco's built-in actions by id. */
function runEditorAction(editor: IEditor | null, id: string): void {
  if (!editor) return
  editor.focus()
  void editor.getAction(id)?.run()
}

/**
 * Shown when a tab's file can't be read — typically a workspace-restored tab
 * whose file was deleted or moved while the app was closed.
 */
export function LoadErrorNotice({
  tabId,
  filePath,
  error
}: {
  tabId: string
  filePath: string
  error: string
}): JSX.Element {
  const missing = /ENOENT|no such file/i.test(error)
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 bg-ink-panel px-6 text-center">
      <div className="text-sm text-ink-text">{missing ? 'File not found' : "Couldn't open file"}</div>
      <div className="max-w-md break-all text-xs text-ink-muted">{filePath}</div>
      {!missing && <div className="max-w-md text-xs text-ink-muted">{error}</div>}
      <button
        onClick={() => useTabsStore.getState().closeTab(tabId)}
        className="mt-1 rounded border border-ink-border px-3 py-1 text-xs text-ink-text hover:bg-ink-hover"
      >
        Close tab
      </button>
    </div>
  )
}
