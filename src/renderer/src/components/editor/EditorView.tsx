// Side-effect import FIRST: configures Monaco to load locally (CSP: script-src 'self')
// and wires the bundled web workers. Must run before <Editor/> mounts.
import './setupMonaco'

import { useEffect, useRef, useState } from 'react'
import { Code2, Eye } from 'lucide-react'
import Editor, { type OnMount } from '@monaco-editor/react'
import type * as monaco from 'monaco-editor'
import { useLayoutStore } from '../../stores/layout'
import { useTabsStore, type CenterTab } from '../../stores/tabs'
import { registerEditor } from '../../lib/editorBridge'
import { languageForPath } from './language'
import { extname } from '../../lib/path'
import MarkdownPreview from './MarkdownPreview'
import { getPreviewMode, setPreviewMode } from '../../lib/markdownView'
import { useSettingsStore } from '../../stores/settings'
import { useCommandPaletteStore } from '../../stores/commandPalette'
import { useEffectiveTheme, monacoTheme } from '../../lib/theme'

type IEditor = monaco.editor.IStandaloneCodeEditor
type ITextModel = monaco.editor.ITextModel

// Module-level caches, keyed by absolute file path, so switching tabs (which
// unmounts/remounts EditorView) preserves undo history + the saved baseline.
// Models are intentionally never disposed on unmount (keepCurrentModel).
const modelCache = new Map<string, ITextModel>()
const savedBaseline = new Map<string, string>()

interface DiskConflict {
  /** New content on disk we could reload to. */
  content: string
}

export default function EditorView({ tab }: { tab: CenterTab }): JSX.Element {
  const filePath = tab.filePath ?? ''
  const wordWrap = useLayoutStore((s) => s.wordWrap)
  const effectiveTheme = useEffectiveTheme()

  const [binary, setBinary] = useState(false)
  const [deleted, setDeleted] = useState(false)
  const [conflict, setConflict] = useState<DiskConflict | null>(null)
  const [loaded, setLoaded] = useState(false)

  // Markdown raw/preview toggle (floating button, spec-added feature).
  const isMarkdown = ['.md', '.mdx', '.markdown'].includes(extname(filePath).toLowerCase())
  // Initial mode: an open tab's remembered toggle wins; otherwise fall back to
  // the markdownDefaultOpenAs setting (a fresh "new" open of this file).
  const [previewOn, setPreviewOn] = useState(() => {
    const remembered = getPreviewMode(filePath)
    if (remembered !== undefined) return remembered
    return useSettingsStore.getState().settings.markdownDefaultOpenAs === 'preview'
  })
  // Seed from the cached model (survives tab switches) so returning to a file
  // already in preview mode renders immediately, without a blank flash.
  const [previewContent, setPreviewContent] = useState(
    () => modelCache.get(filePath)?.getValue() ?? savedBaseline.get(filePath) ?? ''
  )
  const togglePreview = (): void =>
    setPreviewOn((on) => {
      const next = !on
      setPreviewMode(filePath, next)
      if (next) setPreviewContent(modelRef.current?.getValue() ?? savedBaseline.get(filePath) ?? '')
      return next
    })

  // WYSIWYG edits in the preview: serialize back to markdown and push into the
  // Monaco model so save / dirty-tracking / undo all flow through one source of
  // truth. pushEditOperations (vs setValue) keeps undo history coherent.
  const onPreviewEdit = (markdown: string): void => {
    const model = modelRef.current
    if (!model || model.getValue() === markdown) return
    model.pushEditOperations(
      [],
      [{ range: model.getFullModelRange(), text: markdown }],
      () => null
    )
    recomputeDirty()
  }

  const editorRef = useRef<IEditor | null>(null)
  const modelRef = useRef<ITextModel | null>(null)
  // Mirror of the tab's dirty flag for the editorBridge isDirty() closure.
  const dirtyRef = useRef<boolean>(tab.dirty ?? false)

  // --- Load the file (or reuse a cached model) --------------------------------
  useEffect(() => {
    let cancelled = false
    setLoaded(false)
    setBinary(false)
    setDeleted(false)
    setConflict(null)

    void (async () => {
      const res = await window.ide.fs.readFile(filePath)
      if (cancelled) return
      if (res.binary) {
        setBinary(true)
        setLoaded(true)
        return
      }
      // Seed the saved baseline the first time we see this path.
      if (!savedBaseline.has(filePath)) savedBaseline.set(filePath, res.content)
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
    const dirty = model.getValue() !== (savedBaseline.get(filePath) ?? '')
    dirtyRef.current = dirty
    // Only push if it changed, to avoid needless store churn.
    if ((useTabsStore.getState().getById(tab.id)?.dirty ?? false) !== dirty) {
      useTabsStore.getState().setDirty(tab.id, dirty)
    }
  }

  // --- Save -------------------------------------------------------------------
  const save = async (): Promise<void> => {
    const model = modelRef.current
    if (!model) return
    const value = model.getValue()
    await window.ide.fs.writeFile(filePath, value)
    savedBaseline.set(filePath, value)
    dirtyRef.current = false
    useTabsStore.getState().setDirty(tab.id, false)
    // Saving resolves any pending disk conflict.
    setConflict(null)
  }

  // Keep word-wrap in sync with the layout store toggle (onMount runs once).
  useEffect(() => {
    editorRef.current?.updateOptions({ wordWrap: wordWrap ? 'on' : 'off' })
  }, [wordWrap])

  // Register with the bridge so global ⌘S / dirty-close prompt can drive us.
  useEffect(() => {
    const unregister = registerEditor(tab.id, {
      save,
      isDirty: () => dirtyRef.current
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
          savedBaseline.set(filePath, res.content)
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
    savedBaseline.set(filePath, content)
    dirtyRef.current = false
    useTabsStore.getState().setDirty(tab.id, false)
    setConflict(null)
    setDeleted(false)
    // Keep the markdown preview in sync: it renders from `previewContent` state,
    // not the model, so a disk reload while preview is open would otherwise show
    // stale content until the user toggled raw↔preview. Safe during a WYSIWYG
    // edit too — MarkdownPreview ignores content that echoes its own last emit.
    setPreviewContent(content)
  }

  // --- Monaco mount -----------------------------------------------------------
  const handleMount: OnMount = (editor, monacoApi) => {
    editorRef.current = editor

    // Reuse a cached model per path (preserves undo/scroll across tab switches),
    // otherwise create one seeded from the loaded baseline.
    let model = modelCache.get(filePath)
    if (!model || model.isDisposed()) {
      const uri = monacoApi.Uri.file(filePath)
      model =
        monacoApi.editor.getModel(uri) ??
        monacoApi.editor.createModel(
          savedBaseline.get(filePath) ?? '',
          languageForPath(filePath),
          uri
        )
      modelCache.set(filePath, model)
    }
    modelRef.current = model
    editor.setModel(model)

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

    editor.onDidChangeModelContent(() => recomputeDirty())
    recomputeDirty()

    // Refresh the preview seed from the (possibly dirty) model now that it's
    // attached, so a file reopened in preview mode shows its latest content.
    if (previewOn) setPreviewContent(model.getValue())
  }

  if (binary) {
    return (
      <div className="flex h-full items-center justify-center bg-ink-panel text-sm text-ink-muted">
        Binary file not shown
      </div>
    )
  }

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
          // Reuse our own cached model in onMount; don't let the wrapper create
          // its own from `path`, and never dispose it on unmount.
          keepCurrentModel
          theme={monacoTheme(effectiveTheme)}
          onMount={handleMount}
          options={{
            minimap: { enabled: false },
            wordWrap: wordWrap ? 'on' : 'off',
            automaticLayout: true,
            fontSize: 13,
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

      {/* Markdown preview overlay (Monaco stays mounted underneath). Editable:
          typing on the rendered output serializes back into the model. */}
      {isMarkdown && previewOn && (
        <div className="absolute inset-0 z-10">
          <MarkdownPreview content={previewContent} editable onChange={onPreviewEdit} />
        </div>
      )}

      {/* Floating raw/preview toggle for markdown files. */}
      {isMarkdown && loaded && !binary && (
        <button
          onClick={togglePreview}
          title={previewOn ? 'Show raw markdown' : 'Show rendered preview (editable)'}
          className="absolute right-3 top-2.5 z-30 flex items-center gap-1.5 rounded-md border border-ink-border bg-ink-elevated/95 px-2.5 py-1 text-xs text-ink-text shadow-lg backdrop-blur transition-colors hover:bg-ink-hover"
        >
          {previewOn ? (
            <>
              <Code2 size={14} strokeWidth={1.5} />
              Raw
            </>
          ) : (
            <>
              <Eye size={14} strokeWidth={1.5} />
              Preview
            </>
          )}
        </button>
      )}
    </div>
  )
}
