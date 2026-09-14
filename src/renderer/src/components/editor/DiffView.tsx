import './setupMonaco'

import { useEffect, useState } from 'react'
import { DiffEditor } from '@monaco-editor/react'
import type { CenterTab } from '../../stores/tabs'
import { useGitStore } from '../../stores/git'
import { useSettingsStore } from '../../stores/settings'
import { useEffectiveTheme, monacoTheme } from '../../lib/theme'
import { getEditorModel } from '../../lib/editorModels'
import { mdGetContent } from '../../lib/markdownDoc'
import { languageForPath } from './language'
import { basename } from '../../lib/path'

/**
 * Side-by-side review of a file against HEAD (⌘⇧D / the Changes list): the
 * natural way to check what Claude just edited without leaving the IDE. The
 * right side is the LIVE buffer when the file is open (unsaved edits included),
 * else the file on disk; both sides refresh when git status changes (commit,
 * checkout) or the file is edited elsewhere.
 */
export default function DiffView({ tab }: { tab: CenterTab }): JSX.Element {
  const filePath = tab.filePath ?? ''
  const effectiveTheme = useEffectiveTheme()
  const wordWrap = useSettingsStore((s) => s.settings.wordWrap)
  const gitStatus = useGitStore((s) => s.status)
  const [original, setOriginal] = useState<string | null>(null)
  const [modified, setModified] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  // Re-read when the file changes on disk (Claude editing it, a save).
  useEffect(() => {
    return window.ide.fs.onChanged((e) => {
      if (e.path === filePath) setTick((t) => t + 1)
    })
  }, [filePath])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [head, live] = await Promise.all([
        window.ide.git.showHead(filePath).catch(() => null),
        (async () => {
          const model = getEditorModel(filePath)
          if (model) return model.getValue()
          const md = mdGetContent(filePath)
          if (md !== undefined) return md
          try {
            const res = await window.ide.fs.readFile(filePath)
            return res.binary ? '' : res.content
          } catch {
            return ''
          }
        })()
      ])
      if (cancelled) return
      setOriginal(head ?? '')
      setModified(live)
    })()
    return () => {
      cancelled = true
    }
  }, [filePath, gitStatus, tick])

  if (original === null || modified === null) {
    return <div className="flex h-full items-center justify-center bg-ink-panel text-xs text-ink-muted">Loading diff…</div>
  }

  return (
    <div className="flex h-full flex-col bg-ink-panel">
      <div className="flex h-7 shrink-0 items-center gap-3 border-b border-ink-border px-3 text-[11px] text-ink-muted">
        <span>
          <span className="text-ink-text">HEAD</span> ← → <span className="text-ink-text">working tree</span>
        </span>
        <span className="truncate">{basename(filePath)}</span>
      </div>
      <div className="min-h-0 flex-1">
        <DiffEditor
          original={original}
          modified={modified}
          language={languageForPath(filePath)}
          theme={monacoTheme(effectiveTheme)}
          options={{
            readOnly: true,
            renderSideBySide: true,
            minimap: { enabled: false },
            wordWrap: wordWrap ? 'on' : 'off',
            automaticLayout: true,
            fontSize: 13,
            scrollBeyondLastLine: false,
            overviewRulerBorder: false,
            scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 }
          }}
        />
      </div>
    </div>
  )
}
