import { useEffect, useRef, useState } from 'react'
import { Code2, Eye } from 'lucide-react'
import { EditorView } from '@codemirror/view'
import { EditorState, Compartment, Transaction, type Extension } from '@codemirror/state'
import { useLayoutStore } from '../../stores/layout'
import { useTabsStore, type CenterTab } from '../../stores/tabs'
import { registerEditor } from '../../lib/editorBridge'
import { getPreviewMode, setPreviewMode } from '../../lib/markdownView'
import { useSettingsStore } from '../../stores/settings'
import { useEffectiveTheme } from '../../lib/theme'
import { dirname, join } from '../../lib/path'
import { buildExtensions } from './cm/setup'
import { cmTheme } from './cm/theme'
import { livePreview, type LivePreviewContext } from './cm/livePreview'

// Saved-disk baseline per path for dirty calculation. Separate from Monaco's
// (EditorView.tsx) map — markdown never touches Monaco. Panes stay mounted for a
// tab's whole life (CenterPanel mounts every tab), so the CM view + its undo
// history persist without an explicit state cache; only close→reopen resets undo.
const savedBaseline = new Map<string, string>()

/**
 * CodeMirror 6 markdown editor with an Obsidian-style Live Preview. The document
 * is pure markdown (the source of truth) — rendering is done with decorations,
 * so there is no HTML round-trip / serialization / escaping. Owns .md/.markdown/
 * .mdx files end-to-end (load / save / dirty / external-change / theme / wrap).
 */
export default function MarkdownEditor({ tab }: { tab: CenterTab }): JSX.Element {
  const filePath = tab.filePath ?? ''
  const wordWrap = useLayoutStore((s) => s.wordWrap)
  const effectiveTheme = useEffectiveTheme()

  const [binary, setBinary] = useState(false)
  const [deleted, setDeleted] = useState(false)
  const [conflict, setConflict] = useState<{ content: string } | null>(null)
  const [loaded, setLoaded] = useState(false)
  // Live Preview vs Source: remembered per open tab, else the default setting.
  const [previewOn, setPreviewOn] = useState(() => {
    const remembered = getPreviewMode(filePath)
    if (remembered !== undefined) return remembered
    return useSettingsStore.getState().settings.markdownDefaultOpenAs === 'preview'
  })

  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const dirtyRef = useRef<boolean>(tab.dirty ?? false)
  // Stable compartments for live reconfiguration (theme / wrap / preview).
  const comps = useRef({
    theme: new Compartment(),
    wrap: new Compartment(),
    live: new Compartment()
  }).current

  // The live-preview extension, built once against this file's asset/link context
  // (stable — depends only on the fixed filePath).
  const liveExtRef = useRef<Extension | null>(null)
  if (!liveExtRef.current) {
    const ctx: LivePreviewContext = {
      resolveAsset: (src) => {
        if (/^(https?:|data:)/i.test(src)) return Promise.resolve(src)
        const abs = src.startsWith('/') ? src : join(dirname(filePath), src)
        return window.ide.fs.readDataUrl(abs)
      },
      openLink: (href) => {
        if (/^https?:\/\//i.test(href)) useTabsStore.getState().newBrowserTab(href)
      }
    }
    liveExtRef.current = livePreview(ctx)
  }
  const previewExtOf = (on: boolean): Extension => (on ? (liveExtRef.current as Extension) : [])

  // --- Dirty recomputation ----------------------------------------------------
  const recomputeDirty = (): void => {
    const view = viewRef.current
    if (!view) return
    const dirty = view.state.doc.toString() !== (savedBaseline.get(filePath) ?? '')
    dirtyRef.current = dirty
    if ((useTabsStore.getState().getById(tab.id)?.dirty ?? false) !== dirty) {
      useTabsStore.getState().setDirty(tab.id, dirty)
    }
  }

  // --- Save -------------------------------------------------------------------
  const save = async (): Promise<void> => {
    const view = viewRef.current
    if (!view) return
    const value = view.state.doc.toString()
    await window.ide.fs.writeFile(filePath, value)
    savedBaseline.set(filePath, value)
    dirtyRef.current = false
    useTabsStore.getState().setDirty(tab.id, false)
    setConflict(null)
  }

  /** Replace buffer from disk without adding an undo step; selection maps itself. */
  const applyDiskContent = (content: string): void => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: content },
      annotations: Transaction.addToHistory.of(false)
    })
    savedBaseline.set(filePath, content)
    dirtyRef.current = false
    useTabsStore.getState().setDirty(tab.id, false)
    setConflict(null)
    setDeleted(false)
  }

  // --- Load the file ----------------------------------------------------------
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
      if (!savedBaseline.has(filePath)) savedBaseline.set(filePath, res.content)
      setLoaded(true)
    })()

    return () => {
      cancelled = true
    }
  }, [filePath])

  // --- Create the CodeMirror view (once loaded) -------------------------------
  useEffect(() => {
    if (!loaded || binary || !hostRef.current) return
    const view = new EditorView({
      state: EditorState.create({
        doc: savedBaseline.get(filePath) ?? '',
        extensions: buildExtensions({
          compartments: comps,
          effectiveTheme,
          wordWrap,
          previewExtension: previewExtOf(previewOn),
          onSave: () => void save(),
          onDocChanged: recomputeDirty
        })
      }),
      parent: hostRef.current
    })
    viewRef.current = view
    recomputeDirty()
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // Created once per load; theme/wrap/preview update via compartments below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, binary, filePath])

  // --- Live reconfiguration: theme / wrap / preview ---------------------------
  useEffect(() => {
    viewRef.current?.dispatch({ effects: comps.theme.reconfigure(cmTheme(effectiveTheme)) })
  }, [effectiveTheme, comps])

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: comps.wrap.reconfigure(wordWrap ? EditorView.lineWrapping : [])
    })
  }, [wordWrap, comps])

  useEffect(() => {
    viewRef.current?.dispatch({ effects: comps.live.reconfigure(previewExtOf(previewOn)) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewOn, comps])

  // Register with the bridge so global ⌘S / dirty-close prompt can drive us.
  useEffect(() => {
    return registerEditor(tab.id, { save, isDirty: () => dirtyRef.current })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.id, filePath])

  // --- External change subscription -------------------------------------------
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
        const view = viewRef.current
        if (!view) return
        if (view.state.doc.toString() === res.content) {
          savedBaseline.set(filePath, res.content)
          recomputeDirty()
          return
        }
        if (dirtyRef.current) setConflict({ content: res.content })
        else applyDiskContent(res.content)
      })()
    })
    return off
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath])

  const togglePreview = (): void =>
    setPreviewOn((on) => {
      const next = !on
      setPreviewMode(filePath, next)
      return next
    })

  if (binary) {
    return (
      <div className="flex h-full items-center justify-center bg-ink-panel text-sm text-ink-muted">
        Binary file not shown
      </div>
    )
  }

  return (
    <div className="relative h-full w-full bg-ink-panel">
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

      {deleted && !conflict && (
        <div className="absolute inset-x-0 top-0 z-20 border-b border-ink-border bg-ink-elevated px-3 py-1 text-xs text-ink-muted">
          File deleted on disk — unsaved buffer kept
        </div>
      )}

      <div ref={hostRef} className="h-full w-full overflow-hidden" />

      {loaded && (
        <button
          onClick={togglePreview}
          title={previewOn ? 'Show raw markdown (Source)' : 'Show Live Preview'}
          className="absolute right-3 top-2.5 z-30 flex items-center gap-1.5 rounded-md border border-ink-border bg-ink-elevated/95 px-2.5 py-1 text-xs text-ink-text shadow-lg backdrop-blur transition-colors hover:bg-ink-hover"
        >
          {previewOn ? (
            <>
              <Code2 size={14} strokeWidth={1.5} />
              Source
            </>
          ) : (
            <>
              <Eye size={14} strokeWidth={1.5} />
              Live Preview
            </>
          )}
        </button>
      )}
    </div>
  )
}
