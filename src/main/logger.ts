// ---------------------------------------------------------------------------
// Crash reporting / diagnostics.
//
// Captures unexpected failures across every process Electron runs and persists
// each one as a self-contained JSON report on the local machine, under the
// per-app userData dir (so the dev instance's `-dev` userData keeps its own
// reports, isolated from the packaged app — see main/index.ts).
//
// Sources captured:
//   • main process   — uncaughtException, unhandledRejection
//   • renderer        — window.onerror / unhandledrejection (forwarded via IPC)
//   • crashed processes — render-process-gone, child-process-gone
//
// Writes are SYNCHRONOUS so a report survives even when the exception is about
// to tear the process down. Reports are surfaced in-app via the `logs` IPC
// (Diagnostics panel) and can be opened raw with "Reveal in Finder".
// ---------------------------------------------------------------------------

import { app, BrowserWindow, ipcMain, shell, type WebContents } from 'electron'
import { mkdirSync, writeFileSync, readdirSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'
import { IPC } from '../shared/ipc'
import type { CrashReport, CrashReportMeta, RendererErrorPayload } from '../shared/types'
import { projectWindowFor } from './window'

/** Keep the newest N reports; older ones are pruned on each new write. */
const MAX_REPORTS = 200

let reportsDir: string | null = null

/** Absolute path to the crash-reports directory (created on first use). */
export function crashReportsDir(): string {
  if (!reportsDir) {
    reportsDir = join(app.getPath('userData'), 'crash-reports')
    mkdirSync(reportsDir, { recursive: true })
  }
  return reportsDir
}

/** Snapshot of runtime versions, embedded in every report for triage. */
function appContext(): CrashReport['app'] {
  return {
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch
  }
}

/**
 * Filesystem-safe id from an ISO timestamp + type, e.g.
 * `2026-09-03T14-22-01-123Z__uncaughtException`. Sorts chronologically as text.
 */
function makeId(timestamp: string, type: string): string {
  return `${timestamp.replace(/[:.]/g, '-')}__${type}`
}

/** Drop the oldest reports beyond MAX_REPORTS (best-effort). */
function prune(dir: string): void {
  try {
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .sort()
    for (const f of files.slice(0, Math.max(0, files.length - MAX_REPORTS))) {
      try {
        rmSync(join(dir, f))
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

/**
 * Persist a crash report synchronously and return it (with id/timestamp filled
 * in). Never throws — a failure to log must not itself crash the app.
 */
export function writeReport(
  partial: Omit<CrashReport, 'id' | 'timestamp' | 'app'> & { timestamp?: string }
): CrashReport | null {
  try {
    const timestamp = partial.timestamp ?? new Date().toISOString()
    const id = makeId(timestamp, partial.type)
    const report: CrashReport = { ...partial, id, timestamp, app: appContext() }
    const dir = crashReportsDir()
    writeFileSync(join(dir, `${id}.json`), JSON.stringify(report, null, 2), 'utf8')
    prune(dir)
    // Mirror to the console so it also shows up in terminal / devtools logs.
    console.error(`[crash] ${report.type}: ${report.message}`)
    return report
  } catch (err) {
    console.error('[crash] failed to write report:', err)
    return null
  }
}

/** Serialize an arbitrary thrown value into a message + stack pair. */
function describeError(value: unknown): { message: string; stack?: string } {
  if (value instanceof Error) {
    return { message: value.message || value.name, stack: value.stack }
  }
  if (typeof value === 'string') return { message: value }
  try {
    return { message: JSON.stringify(value) }
  } catch {
    return { message: String(value) }
  }
}

/** Lightweight list of reports (newest first) for the Diagnostics panel. */
function listReports(): CrashReportMeta[] {
  const dir = crashReportsDir()
  const out: CrashReportMeta[] = []
  let files: string[]
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.json'))
  } catch {
    return out
  }
  for (const f of files) {
    try {
      const raw = readFileSync(join(dir, f), 'utf8')
      const r = JSON.parse(raw) as CrashReport
      out.push({
        id: r.id,
        timestamp: r.timestamp,
        type: r.type,
        source: r.source,
        message: r.message
      })
    } catch {
      /* skip corrupt report */
    }
  }
  return out.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
}

/** Read a single full report by id, or null if missing/unreadable. */
function readReport(id: string): CrashReport | null {
  // Guard against path traversal: ids are our own generated stems only.
  if (!/^[\w.-]+$/.test(id)) return null
  try {
    const raw = readFileSync(join(crashReportsDir(), `${id}.json`), 'utf8')
    return JSON.parse(raw) as CrashReport
  } catch {
    return null
  }
}

/** Delete every stored report. Returns the number removed. */
function clearReports(): number {
  const dir = crashReportsDir()
  let n = 0
  try {
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.json')) continue
      try {
        rmSync(join(dir, f))
        n++
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  return n
}

/**
 * Notify all live windows that a new report exists so the Diagnostics indicator
 * can light up without a manual refresh.
 */
function broadcastNewReport(report: CrashReport): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC.evtCrashReported, {
        id: report.id,
        timestamp: report.timestamp,
        type: report.type,
        source: report.source,
        message: report.message
      } satisfies CrashReportMeta)
    }
  }
}

/** Resolve the project root for a reporting renderer, if any. */
function projectFor(sender: WebContents): string | undefined {
  return projectWindowFor(sender)?.root
}

/**
 * Install process-wide crash handlers and register the `logs` IPC surface.
 * Call once, after `app` is ready and after window/IPC bookkeeping is set up.
 */
export function installCrashReporting(): void {
  // --- main process fatal errors -------------------------------------------
  process.on('uncaughtException', (err) => {
    const { message, stack } = describeError(err)
    const r = writeReport({ type: 'uncaughtException', source: 'main', message, stack })
    if (r) broadcastNewReport(r)
  })

  process.on('unhandledRejection', (reason) => {
    const { message, stack } = describeError(reason)
    const r = writeReport({ type: 'unhandledRejection', source: 'main', message, stack })
    if (r) broadcastNewReport(r)
  })

  // --- crashed renderer / child processes ----------------------------------
  app.on('render-process-gone', (_e, contents, details) => {
    const r = writeReport({
      type: 'render-process-gone',
      source: 'renderer',
      message: `Renderer process gone: ${details.reason} (exit ${details.exitCode})`,
      details: { ...details },
      project: projectFor(contents)
    })
    if (r) broadcastNewReport(r)
  })

  app.on('child-process-gone', (_e, details) => {
    const r = writeReport({
      type: 'child-process-gone',
      source: details.type === 'GPU' ? 'gpu' : 'child',
      message: `${details.type} process gone: ${details.reason} (exit ${details.exitCode})`,
      details: { ...details }
    })
    if (r) broadcastNewReport(r)
  })

  // --- IPC surface ----------------------------------------------------------
  ipcMain.handle(IPC.logList, () => listReports())
  ipcMain.handle(IPC.logRead, (_e, id: string) => readReport(id))
  ipcMain.handle(IPC.logClear, () => clearReports())
  ipcMain.handle(IPC.logReveal, async (_e, id?: string) => {
    const dir = crashReportsDir()
    if (id && /^[\w.-]+$/.test(id)) {
      shell.showItemInFolder(join(dir, `${id}.json`))
    } else {
      await shell.openPath(dir)
    }
  })

  // Renderer-reported errors (window.onerror / unhandledrejection / React boundary).
  ipcMain.handle(IPC.logReport, (event, payload: RendererErrorPayload) => {
    const r = writeReport({
      type: payload.type,
      source: 'renderer',
      message: payload.message,
      stack: payload.stack,
      details: payload.details,
      project: projectFor(event.sender)
    })
    return r?.id ?? null
  })
}
