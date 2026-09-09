// Raw settings.json editor (Command: "Preferences: Open Settings (JSON)").
// Reads/writes through the settings IPC — NOT the fs IPC — because the file
// lives in userData, outside the project root the fs layer guards. Saving
// applies settings live (main broadcasts settings:changed on a valid write).

import '../editor/setupMonaco'

import { useEffect, useRef, useState } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import type * as monaco from 'monaco-editor'
import { useLayoutStore } from '../../stores/layout'
import { useTabsStore, type CenterTab } from '../../stores/tabs'
import { registerEditor } from '../../lib/editorBridge'
import { useEffectiveTheme, monacoTheme } from '../../lib/theme'

type IEditor = monaco.editor.IStandaloneCodeEditor
type ITextModel = monaco.editor.ITextModel

export default function SettingsJsonView({ tab }: { tab: CenterTab }): JSX.Element {
  const wordWrap = useLayoutStore((s) => s.wordWrap)
  const effectiveTheme = useEffectiveTheme()
  const [loaded, setLoaded] = useState(false)
  const [content, setContent] = useState('')
  const [error, setError] = useState<string | null>(null)

  const [loadError, setLoadError] = useState<string | null>(null)

  const modelRef = useRef<ITextModel | null>(null)
  const baselineRef = useRef('')
  const dirtyRef = useRef(false)

  // Load the raw file text once.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const { content } = await window.ide.settings.getRaw()
        if (cancelled) return
        baselineRef.current = content
        setContent(content)
        setLoaded(true)
      } catch (e) {
        if (cancelled) return
        setLoadError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const recomputeDirty = (): void => {
    const model = modelRef.current
    if (!model) return
    const dirty = model.getValue() !== baselineRef.current
    dirtyRef.current = dirty
    if ((useTabsStore.getState().getById(tab.id)?.dirty ?? false) !== dirty) {
      useTabsStore.getState().setDirty(tab.id, dirty)
    }
  }

  const save = async (): Promise<void> => {
    const model = modelRef.current
    if (!model) return
    const value = model.getValue()
    const res = await window.ide.settings.setRaw(value)
    // File on disk now equals the buffer either way, so clear dirty; surface a
    // non-blocking error when the JSON didn't parse (settings weren't applied).
    baselineRef.current = value
    setError(res.ok ? null : res.error ?? 'Invalid JSON')
    recomputeDirty()
  }

  useEffect(() => {
    const unregister = registerEditor(tab.id, { save, isDirty: () => dirtyRef.current })
    return unregister
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.id])

  useEffect(() => {
    return () => useTabsStore.getState().setDirty(tab.id, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleMount: OnMount = (editor: IEditor, monacoApi) => {
    const uri = monacoApi.Uri.parse('inmemory://settings/settings.json')
    let model = monacoApi.editor.getModel(uri)
    if (!model) {
      model = monacoApi.editor.createModel(content, 'json', uri)
    } else {
      model.setValue(content)
    }
    modelRef.current = model
    editor.setModel(model)

    editor.addCommand(monacoApi.KeyMod.CtrlCmd | monacoApi.KeyCode.KeyS, () => void save())
    editor.onDidChangeModelContent(() => recomputeDirty())
    recomputeDirty()
  }

  if (loadError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-ink-bg px-6 text-center">
        <div className="text-sm text-ink-text">Couldn&apos;t load settings.json</div>
        <div className="max-w-md text-xs text-ink-muted">{loadError}</div>
        <div className="mt-1 text-xs text-ink-muted">
          If you just updated the app, fully quit and relaunch it.
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-full w-full bg-ink-bg">
      {error && (
        <div className="absolute inset-x-0 top-0 z-20 border-b border-red-900/60 bg-red-950/80 px-3 py-1.5 text-xs text-red-200">
          Invalid JSON — settings not applied: {error}
        </div>
      )}
      {loaded && (
        <Editor
          keepCurrentModel
          theme={monacoTheme(effectiveTheme)}
          onMount={handleMount}
          options={{
            minimap: { enabled: false },
            wordWrap: wordWrap ? 'on' : 'off',
            automaticLayout: true,
            fontSize: 13,
            scrollBeyondLastLine: false,
            scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
            overviewRulerBorder: false,
            overviewRulerLanes: 0
          }}
        />
      )}
    </div>
  )
}
