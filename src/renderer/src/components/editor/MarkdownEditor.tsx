import { useEffect, useRef, useState } from 'react'
import { EditorView } from '@codemirror/view'
import { EditorState, Compartment, Transaction, type Extension } from '@codemirror/state'
import { gotoLine, openSearchPanel } from '@codemirror/search'
import { useSettingsStore } from '../../stores/settings'
import { useTabsStore, type CenterTab } from '../../stores/tabs'
import { registerEditor } from '../../lib/editorBridge'
import { useEffectiveTheme } from '../../lib/theme'
import { useProjectStore } from '../../stores/project'
import { resolveMarkdownAsset } from '../../lib/markdownAssets'
import { mdGetContent, mdSetContent, mdGetBaseline, mdSetBaseline } from '../../lib/markdownDoc'
import { LoadErrorNotice } from './EditorView'
import { getFileMeta, setFileMeta } from '../../lib/editorModels'
import { takePendingReveal } from '../../lib/editorReveal'
import { takeViewPosition, type ViewPosition } from '../../lib/editorModels'
import { markdownHeadings } from '../../lib/symbols'
import { resolveMarkdownLink } from '../../lib/markdownLinks'
import { renderMermaid } from '../../lib/mermaid'
import { extForMime, pastedImageName, pastedImageTarget } from '../../lib/imagePaste'
import { reportFormat, requestFormat } from '../../lib/format'
import type { FormatResult } from '@shared/types'
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
  const wordWrap = useSettingsStore((s) => s.settings.wordWrap)
  const effectiveTheme = useEffectiveTheme()

  const [binary, setBinary] = useState(false)
  const [deleted, setDeleted] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
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
      // Root-relative `/images/x.png` resolves against the project root (then
      // public/); never rejects, so a missing image can't become a crash report.
      resolveAsset: (src) =>
        resolveMarkdownAsset(
          src,
          filePath,
          useProjectStore.getState().info?.root ?? '',
          (abs) => window.ide.fs.readDataUrl(abs)
        ),
      openLink: (href) => {
        const target = resolveMarkdownLink(href, filePath, useProjectStore.getState().info?.root ?? '')
        if (target.kind === 'external') {
          if (/^https?:/i.test(target.url)) useTabsStore.getState().newBrowserTab(target.url)
          else window.open(target.url)
        } else if (target.kind === 'file') {
          // Relative links open the linked file in a tab (missing files surface a notice).
          useTabsStore.getState().openFile(target.path)
        }
      },
      renderDiagram: renderMermaid
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

  const format = async (explicit = true): Promise<FormatResult> => {
    const view = viewRef.current
    if (!view) return { kind: 'error', message: 'Editor not ready' }
    const res = await requestFormat(filePath, view.state.doc.toString(), view.state.selection.main.head)
    if (res.kind === 'formatted' && res.changed && viewRef.current === view) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: res.formatted },
        selection: { anchor: Math.min(res.cursorOffset, res.formatted.length) },
        scrollIntoView: true
      })
    }
    reportFormat(res, explicit)
    return res
  }

  const save = async (): Promise<void> => {
    const view = viewRef.current
    if (!view) return
    if (useSettingsStore.getState().settings.formatOnSave && !conflict) await format(false)
    const value = view.state.doc.toString()
    await window.ide.fs.writeFile(filePath, value, getFileMeta(filePath))
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
    setLoadError(null)
    setConflict(null)

    void (async () => {
      let res: Awaited<ReturnType<typeof window.ide.fs.readFile>>
      try {
        res = await window.ide.fs.readFile(filePath)
      } catch (err) {
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
          onDocChanged: recomputeDirty,
          onPasteImage: async (blob) => {
            // Paste-image-to-assets: write beside the file, insert a reference.
            const buf = new Uint8Array(await blob.arrayBuffer())
            let bin = ''
            for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
            const name = pastedImageName(new Date(), extForMime(blob.type))
            const { absPath, markdown } = pastedImageTarget(filePath, name)
            await window.ide.fs.writeBinary(absPath, btoa(bin))
            return markdown
          }
        })
      }),
      parent: hostRef.current
    })
    viewRef.current = view
    recomputeDirty()
    const jump = takePendingReveal(filePath)
    if (jump) revealCm(view, jump.line, jump.column)
    else {
      const vp = takeViewPosition(filePath)
      // Scroll geometry needs a layout pass; defer one frame.
      if (vp) requestAnimationFrame(() => viewRef.current === view && applyCmViewPosition(view, vp))
    }
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
    return registerEditor(tab.id, {
      save,
      isDirty: () => dirtyRef.current,
      focus: () => viewRef.current?.focus(),
      revert: async () => {
        const res = await window.ide.fs.readFile(filePath)
        if (!res.binary) applyDiskContent(res.content)
      },
      format: () => format(true),
      getViewPosition: () => cmViewPosition(viewRef.current),
      setViewPosition: (pos) => applyCmViewPosition(viewRef.current, pos),
      find: () => {
        const v = viewRef.current
        if (v) {
          v.focus()
          openSearchPanel(v)
        }
      },
      goToLine: () => {
        const v = viewRef.current
        if (v) {
          v.focus()
          gotoLine(v)
        }
      },
      getSelection: () => {
        const v = viewRef.current
        if (!v) return null
        const r = v.state.selection.main
        if (r.empty) return null
        const endLine = v.state.doc.lineAt(r.to)
        return {
          text: v.state.sliceDoc(r.from, r.to),
          startLine: v.state.doc.lineAt(r.from).number,
          endLine: r.to === endLine.from && endLine.number > 1 ? endLine.number - 1 : endLine.number
        }
      },
      revealLine: (line, column) => revealCm(viewRef.current, line, column),
      getSymbols: async () => markdownHeadings(viewRef.current?.state.doc.toString() ?? '')
    })
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

  if (loadError) return <LoadErrorNotice tabId={tab.id} filePath={filePath} error={loadError} />

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

/** Move the CodeMirror caret to a 1-based line/column and scroll it into view. */
function revealCm(view: EditorView | null, line: number, column = 1): void {
  if (!view) return
  const n = Math.min(Math.max(1, line), view.state.doc.lines)
  const l = view.state.doc.line(n)
  const pos = Math.min(l.from + Math.max(0, column - 1), l.to)
  view.dispatch({ selection: { anchor: pos }, scrollIntoView: true })
  view.focus()
}

/** Caret + first visible line of a CodeMirror view. */
function cmViewPosition(view: EditorView | null): ViewPosition | null {
  if (!view) return null
  const head = view.state.selection.main.head
  const caret = view.state.doc.lineAt(head)
  const topBlock = view.lineBlockAtHeight(view.scrollDOM.scrollTop)
  return { line: caret.number, column: head - caret.from + 1, topLine: view.state.doc.lineAt(topBlock.from).number }
}

/** Restore a caret + scroll position: the top line goes to the top of the viewport. */
function applyCmViewPosition(view: EditorView | null, vp: ViewPosition): void {
  if (!view) return
  const lines = view.state.doc.lines
  const caretLine = view.state.doc.line(Math.min(Math.max(1, vp.line), lines))
  const anchor = Math.min(caretLine.from + Math.max(0, vp.column - 1), caretLine.to)
  const topLine = view.state.doc.line(Math.min(Math.max(1, vp.topLine), lines))
  view.dispatch({
    selection: { anchor },
    effects: EditorView.scrollIntoView(topLine.from, { y: 'start' })
  })
}
