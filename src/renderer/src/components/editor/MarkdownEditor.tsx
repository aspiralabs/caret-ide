import { useEffect, useRef, useState } from 'react'
import { EditorView } from '@codemirror/view'
import { EditorState, Compartment, Transaction, type Extension } from '@codemirror/state'
import { useLayoutStore } from '../../stores/layout'
import { useTabsStore, type CenterTab } from '../../stores/tabs'
import { registerEditor } from '../../lib/editorBridge'
import { useEffectiveTheme } from '../../lib/theme'
import { dirname, join } from '../../lib/path'
import { mdGetContent, mdSetContent, mdGetBaseline, mdSetBaseline } from '../../lib/markdownDoc'
import { buildExtensions } from './cm/setup'
import { cmTheme } from './cm/theme'
import { livePreview, type LivePreviewContext } from './cm/livePreview'

/**
 * CodeMirror 6 markdown editor with an Obsidian-style Live Preview. The document
 * is pure markdown (the source of truth) — rendering is done with decorations,
 * so there is no HTML round-trip / serialization / escaping. This is the Preview
 * half of a markdown tab; Source mode uses Monaco (see EditorView's
 * MarkdownTabView). Both share the per-file buffer in lib/markdownDoc so toggling
 * modes never loses content.
 */
export default function MarkdownEditor({ tab }: { tab: CenterTab }): JSX.Element {
  const filePath = tab.filePath ?? ''
  const wordWrap = useLayoutStore((s) => s.wordWrap)
  const effectiveTheme = useEffectiveTheme()

  const [binary, setBinary] = useState(false)
  const [deleted, setDeleted] = useState(false)
  const [conflict, setConflict] = useState<{ content: string } | null>(null)
  const [loaded, setLoaded] = useState(false)

  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const dirtyRef = useRef<boolean>(tab.dirty ?? false)
  const comps = useRef({ theme: new Compartment(), wrap: new Compartment() }).current

  // Live-preview extension built once against this file's asset/link context.
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

  const recomputeDirty = (): void => {
    const view = viewRef.current
    if (!view) return
    const text = view.state.doc.toString()
    mdSetContent(filePath, text)
    const dirty = text !== (mdGetBaseline(filePath) ?? '')
    dirtyRef.current = dirty
    if ((useTabsStore.getState().getById(tab.id)?.dirty ?? false) !== dirty) {
      useTabsStore.getState().setDirty(tab.id, dirty)
    }
  }

  const save = async (): Promise<void> => {
    const view = viewRef.current
    if (!view) return
    const value = view.state.doc.toString()
    await window.ide.fs.writeFile(filePath, value)
    mdSetBaseline(filePath, value)
    mdSetContent(filePath, value)
    dirtyRef.current = false
    useTabsStore.getState().setDirty(tab.id, false)
    setConflict(null)
  }

  const applyDiskContent = (content: string): void => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: content },
      annotations: Transaction.addToHistory.of(false)
    })
    mdSetBaseline(filePath, content)
    mdSetContent(filePath, content)
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
      if (mdGetBaseline(filePath) === undefined) mdSetBaseline(filePath, res.content)
      if (mdGetContent(filePath) === undefined) mdSetContent(filePath, res.content)
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
        doc: mdGetContent(filePath) ?? mdGetBaseline(filePath) ?? '',
        extensions: buildExtensions({
          compartments: comps,
          effectiveTheme,
          wordWrap,
          previewExtension: liveExtRef.current as Extension,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, binary, filePath])

  useEffect(() => {
    viewRef.current?.dispatch({ effects: comps.theme.reconfigure(cmTheme(effectiveTheme)) })
  }, [effectiveTheme, comps])

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: comps.wrap.reconfigure(wordWrap ? EditorView.lineWrapping : [])
    })
  }, [wordWrap, comps])

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
          mdSetBaseline(filePath, res.content)
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
    </div>
  )
}
