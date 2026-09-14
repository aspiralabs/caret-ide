// ---------------------------------------------------------------------------
// Prettier integration (Format Document / format on save).
//
// Main does the work so the renderer never loads or spawns Prettier. The
// project's OWN prettier (node_modules/prettier, loaded in-process via
// createRequire so its exact version and plugins are honoured) is preferred;
// a bundled Prettier is the fallback for projects without one. Config
// resolution: the project's .prettierrc* / package.json / .editorconfig, else
// the global config pasted into Settings, else Prettier defaults.
// .prettierignore is respected.
// ---------------------------------------------------------------------------

import { createRequire } from 'module'
import { join, relative, sep } from 'path'
import { pathToFileURL } from 'url'
import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { IPC } from '../../shared/ipc'
import type { FormatRequest, FormatResult } from '../../shared/types'
import { assertInsideRoot } from '../security'
import { projectWindowFor, type ProjectWindow } from '../window'
import { chooseConfig, MAX_FORMAT_BYTES, type PrettierOptions } from '../../shared/prettierConfig'

/** The slice of Prettier's API we use (typed loosely: the project's copy may differ in version). */
interface PrettierLike {
  version: string
  formatWithCursor: (
    text: string,
    options: PrettierOptions & { filepath: string; cursorOffset: number }
  ) => Promise<{ formatted: string; cursorOffset: number }>
  resolveConfig: (file: string, opts: { editorconfig?: boolean }) => Promise<PrettierOptions | null>
  resolveConfigFile: (file: string) => Promise<string | null>
  getFileInfo: (
    file: string,
    opts: { ignorePath?: string | string[]; resolveConfig?: boolean }
  ) => Promise<{ ignored: boolean; inferredParser: string | null }>
  clearConfigCache?: () => Promise<void>
}

/** Per-project loaded Prettier (project copy or bundled) so plugins/config caches persist. */
const loaded = new Map<string, Promise<{ prettier: PrettierLike; source: 'project' | 'bundled' }>>()

const FORMAT_TIMEOUT_MS = 10000

function requireWindow(event: IpcMainInvokeEvent): ProjectWindow {
  const pw = projectWindowFor(event.sender)
  if (!pw) throw new Error('No project window for sender')
  return pw
}

async function importPrettier(specifier: string): Promise<PrettierLike> {
  const mod = (await import(specifier)) as { default?: PrettierLike } & PrettierLike
  return mod.default ?? mod
}

/** Load the project's prettier if installed, else the bundled one. */
export function loadPrettier(root: string): Promise<{ prettier: PrettierLike; source: 'project' | 'bundled' }> {
  let p = loaded.get(root)
  if (!p) {
    p = (async () => {
      try {
        const req = createRequire(join(root, 'package.json'))
        const resolved = req.resolve('prettier')
        return { prettier: await importPrettier(pathToFileURL(resolved).href), source: 'project' as const }
      } catch {
        return { prettier: await importPrettier('prettier'), source: 'bundled' as const }
      }
    })()
    loaded.set(root, p)
  }
  return p
}

/** Test hook: forget loaded copies (e.g. after installing prettier in a temp project). */
export function _resetPrettierCache(): void {
  loaded.clear()
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Prettier timed out after ${ms / 1000}s`)), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      }
    )
  })
}

/** Format one buffer. Never throws — every outcome is a FormatResult. */
export async function formatText(root: string, req: FormatRequest): Promise<FormatResult> {
  let abs: string
  try {
    abs = assertInsideRoot(root, req.path)
  } catch (err) {
    return { kind: 'error', message: err instanceof Error ? err.message : String(err) }
  }
  if (Buffer.byteLength(req.text, 'utf8') > MAX_FORMAT_BYTES) return { kind: 'skipped', reason: 'too-large' }
  if (relative(root, abs).split(sep).includes('node_modules')) return { kind: 'skipped', reason: 'ignored' }

  try {
    const { prettier, source } = await loadPrettier(root)
    const info = await prettier.getFileInfo(abs, { ignorePath: join(root, '.prettierignore'), resolveConfig: false })
    if (info.ignored) return { kind: 'skipped', reason: 'ignored' }
    if (!info.inferredParser) return { kind: 'skipped', reason: 'no-parser' }

    // Only a config file INSIDE the project counts as "the project has one";
    // Prettier would otherwise walk up to ~/.prettierrc and shadow the global
    // config from Settings.
    const configFile = await prettier.resolveConfigFile(abs)
    const inProject = configFile !== null && !relative(root, configFile).startsWith('..')
    const projectConfig = inProject ? await prettier.resolveConfig(abs, { editorconfig: true }) : null
    const { options, source: configSource } = chooseConfig(projectConfig, req.globalConfig ?? '')
    const out = await withTimeout(
      prettier.formatWithCursor(req.text, { ...options, filepath: abs, cursorOffset: req.cursorOffset ?? 0 }),
      FORMAT_TIMEOUT_MS
    )
    return {
      kind: 'formatted',
      formatted: out.formatted,
      cursorOffset: out.cursorOffset,
      changed: out.formatted !== req.text,
      prettier: source,
      version: prettier.version,
      config: configSource
    }
  } catch (err) {
    return { kind: 'error', message: err instanceof Error ? err.message : String(err) }
  }
}

export function registerFormatIpc(): void {
  ipcMain.handle(IPC.formatText, (event, req: FormatRequest) => {
    const pw = requireWindow(event)
    return formatText(pw.root, req)
  })
}
