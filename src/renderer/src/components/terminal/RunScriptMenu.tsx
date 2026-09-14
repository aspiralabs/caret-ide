import { useEffect, useState } from 'react'
import { Play } from 'lucide-react'
import { useTerminalsStore } from '../../stores/terminals'
import { useProjectStore } from '../../stores/project'
import { useOverlay } from '../../stores/overlay'
import { join } from '../../lib/path'
import {
  detectPackageManager,
  parseScripts,
  runScriptCommand,
  type PackageManager,
  type PackageScript
} from '../../lib/packageScripts'
import Tooltip from '../Tooltip'

/**
 * ▶ menu in the terminal header listing `package.json` scripts. Each runs in
 * a new tab named after the script (`dev`, `test`, …) using the package
 * manager implied by the lockfile. When the script prints a dev-server URL
 * the terminal offers to open it in the preview (see TerminalView).
 */
export default function RunScriptMenu(): JSX.Element | null {
  const root = useProjectStore((s) => s.info?.root ?? '')
  const [open, setOpen] = useState(false)
  const [scripts, setScripts] = useState<PackageScript[] | null>(null)
  const [pm, setPm] = useState<PackageManager>('npm')
  useOverlay(open)

  // Load once per project (and re-read when the menu opens, so an edited
  // package.json is reflected).
  useEffect(() => {
    if (!root) return
    let cancelled = false
    void (async () => {
      try {
        const [pkg, entries] = await Promise.all([
          window.ide.fs.readFile(join(root, 'package.json')),
          window.ide.fs.readDir(root)
        ])
        if (cancelled) return
        setScripts(pkg.binary ? [] : parseScripts(pkg.content))
        setPm(detectPackageManager(entries.map((e) => e.name)))
      } catch {
        if (!cancelled) setScripts([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [root, open])

  useEffect(() => {
    if (!open) return
    const close = (): void => setOpen(false)
    window.addEventListener('click', close)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', close)
    }
  }, [open])

  if (!scripts || scripts.length === 0) return null

  return (
    <div className="relative">
      <Tooltip label="Run a package.json script" side="left">
        <button
          aria-label="Run script"
          aria-expanded={open}
          onClick={(e) => {
            e.stopPropagation()
            setOpen((o) => !o)
          }}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-transparent text-ink-muted transition-colors hover:bg-ink-hover hover:text-ink-text"
        >
          <Play size={14} strokeWidth={1.8} />
        </button>
      </Tooltip>
      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-1 max-h-80 min-w-[220px] overflow-auto rounded border border-ink-border bg-ink-elevated py-1 text-xs text-ink-text shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-ink-muted">
            {pm} scripts
          </div>
          {scripts.map((s) => (
            <button
              key={s.name}
              title={s.command}
              onClick={() => {
                useTerminalsStore.getState().addTerminal(s.name, { command: runScriptCommand(pm, s.name) })
                setOpen(false)
              }}
              className="flex w-full items-center gap-3 px-3 py-1.5 text-left hover:bg-ink-hover"
            >
              <span className="shrink-0 font-medium">{s.name}</span>
              <span className="min-w-0 flex-1 truncate text-[10px] text-ink-muted">{s.command}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
