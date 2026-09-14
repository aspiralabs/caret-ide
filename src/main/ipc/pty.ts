// ---------------------------------------------------------------------------
// PTY / terminal IPC (spec §5.4, §9.1).
//
// Main owns every node-pty instance. Shells are spawned as LOGIN shells
// (`/bin/zsh -l`) so GUI-launched apps still resolve `claude`, `node`, `npm`
// via the user's PATH (spec §9.1). Each pty streams data to its owning window
// and is killed when that window closes.
// ---------------------------------------------------------------------------

import { execFile } from 'child_process'
import { app, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { ensureShellIntegration, shellIntegrationEnv } from './shellIntegration'
import * as pty from 'node-pty'
import { IPC } from '../../shared/ipc'
import type {
  PtyCreateOptions,
  PtyCreateResult,
  PtyDataEvent,
  PtyExitEvent,
  PtyForeground,
  PtyInfo
} from '../../shared/types'
import { onWindowClosed, projectWindowFor, type ProjectWindow } from '../window'
import { foregroundName, foregroundPidsFor, parseLsofCwd, parsePsPairs } from './foreground'

interface PtyRecord {
  proc: pty.IPty
  windowId: number
  shell: string
}

/** All live ptys, keyed by ptyId. */
const ptys = new Map<string, PtyRecord>()
/** ptyIds grouped per window so we can bulk-kill on window close. */
const byWindow = new Map<number, Set<string>>()

let counter = 0

function requireWindow(event: IpcMainInvokeEvent): ProjectWindow {
  const pw = projectWindowFor(event.sender)
  if (!pw) throw new Error('No project window for sender')
  return pw
}

function trackPty(ptyId: string, windowId: number): void {
  let set = byWindow.get(windowId)
  if (!set) {
    set = new Set()
    byWindow.set(windowId, set)
  }
  set.add(ptyId)
}

function untrackPty(ptyId: string, windowId: number): void {
  ptys.delete(ptyId)
  byWindow.get(windowId)?.delete(ptyId)
}

/** Shim directory for zsh shell integration, written once per run. */
let integrationDir: string | null = null

function createPty(pw: ProjectWindow, opts: PtyCreateOptions): PtyCreateResult {
  const shell = opts.shell ?? '/bin/zsh'
  if (!integrationDir) {
    try {
      integrationDir = ensureShellIntegration(app.getPath('userData'))
    } catch {
      integrationDir = ''
    }
  }
  const proc = pty.spawn(shell, ['-l'], {
    name: 'xterm-256color',
    cwd: opts.cwd,
    cols: opts.cols,
    rows: opts.rows,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      TERM_PROGRAM: 'Caret',
      ...(integrationDir ? shellIntegrationEnv(shell, integrationDir, process.env) : {})
    }
  })

  const ptyId = `pty_${Date.now()}_${counter++}`
  ptys.set(ptyId, { proc, windowId: pw.id, shell })
  trackPty(ptyId, pw.id)

  proc.onData((data) => {
    if (pw.win.isDestroyed()) return
    const payload: PtyDataEvent = { ptyId, data }
    pw.win.webContents.send(IPC.evtPtyData, payload)
  })

  proc.onExit(({ exitCode, signal }) => {
    if (!pw.win.isDestroyed()) {
      const payload: PtyExitEvent = { ptyId, exitCode, signal }
      pw.win.webContents.send(IPC.evtPtyExit, payload)
    }
    untrackPty(ptyId, pw.id)
  })

  return { ptyId }
}

/** Run `ps -o pid=,<col>= -p <pids>`; resolves an empty map on any failure. */
function ps(col: string, pids: number[]): Promise<Map<number, string>> {
  return new Promise((resolve) => {
    if (pids.length === 0) return resolve(new Map())
    execFile('/bin/ps', ['-o', `pid=,${col}=`, '-p', pids.join(',')], (err, out) =>
      resolve(err ? new Map() : parsePsPairs(out))
    )
  })
}

/** How long one batched snapshot is reused before spawning `ps` again. */
const FOREGROUND_CACHE_MS = 1000

let snapshot: { at: number; names: Map<string, string | null> } | null = null
let snapshotInFlight: Promise<Map<string, string | null>> | null = null

/**
 * Best-effort foreground-process detection for EVERY live pty at once (spec §6
 * "detecting what's running"). The command the user is interacting with (e.g.
 * `claude`) runs in the tty's FOREGROUND process group — under job control an
 * interactive login shell puts each foreground job in its OWN pgrp, so the
 * shell's group only ever contains the shell itself. We read every shell's
 * `tpgid` in one `ps`, then every distinct group leader's command in a second
 * `ps` (its pid == tpgid). When the shell itself is in front nothing is
 * running (null). Two `ps` spawns total, however many terminals — the
 * per-terminal renderer polls (every 3 s each) share one snapshot for a
 * second, so N terminals no longer mean 2N processes per tick.
 */
function foregroundSnapshot(): Promise<Map<string, string | null>> {
  if (snapshot && Date.now() - snapshot.at < FOREGROUND_CACHE_MS) {
    return Promise.resolve(snapshot.names)
  }
  if (snapshotInFlight) return snapshotInFlight
  snapshotInFlight = (async () => {
    const shells = [...ptys.entries()].map(([ptyId, rec]) => ({ ptyId, pid: rec.proc.pid }))
    const tpgidByPid = await ps('tpgid', shells.map((s) => s.pid))
    const commByPid = await ps(
      'comm',
      foregroundPidsFor(
        shells.map((s) => s.pid),
        tpgidByPid
      )
    )
    const names = new Map<string, string | null>()
    for (const s of shells) names.set(s.ptyId, foregroundName(s.pid, tpgidByPid, commByPid))
    snapshot = { at: Date.now(), names }
    return names
  })().finally(() => {
    snapshotInFlight = null
  })
  return snapshotInFlight
}

async function foreground(ptyId: string): Promise<PtyForeground> {
  if (!ptys.has(ptyId)) return { name: null }
  try {
    const names = await foregroundSnapshot()
    return { name: names.get(ptyId) ?? null }
  } catch {
    return { name: null }
  }
}

/** The shell's cwd via lsof (macOS has no /proc); null on any failure. */
function cwdOf(pid: number): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('/usr/sbin/lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], { timeout: 3000 }, (err, out) =>
      resolve(err ? null : parseLsofCwd(out))
    )
  })
}

async function ptyInfo(ptyId: string): Promise<PtyInfo | null> {
  const rec = ptys.get(ptyId)
  if (!rec) return null
  const [cwd, fg] = await Promise.all([cwdOf(rec.proc.pid), foreground(ptyId)])
  return { pid: rec.proc.pid, shell: rec.shell, cwd, foreground: fg.name }
}

function killPty(ptyId: string): void {
  const rec = ptys.get(ptyId)
  if (!rec) return
  try {
    rec.proc.kill()
  } catch {
    // Already dead — onExit cleanup (if any) covers the maps.
  }
  untrackPty(ptyId, rec.windowId)
}

export function registerPtyIpc(): void {
  ipcMain.handle(IPC.ptyCreate, (event, opts: PtyCreateOptions) => {
    const pw = requireWindow(event)
    return createPty(pw, opts)
  })

  // Fire-and-forget input; guard against a write to a dead pty.
  ipcMain.on(IPC.ptyWrite, (_event, ptyId: string, data: string) => {
    const rec = ptys.get(ptyId)
    if (!rec) return
    try {
      rec.proc.write(data)
    } catch {
      /* pty gone */
    }
  })

  ipcMain.on(IPC.ptyResize, (_event, ptyId: string, cols: number, rows: number) => {
    const rec = ptys.get(ptyId)
    if (!rec) return
    if (!Number.isFinite(cols) || !Number.isFinite(rows) || cols < 1 || rows < 1) return
    try {
      rec.proc.resize(Math.floor(cols), Math.floor(rows))
    } catch {
      /* pty gone */
    }
  })

  ipcMain.handle(IPC.ptyKill, (_event, ptyId: string) => {
    killPty(ptyId)
  })

  ipcMain.handle(IPC.ptyForeground, (_event, ptyId: string) => foreground(ptyId))
  ipcMain.handle(IPC.ptyInfo, (_event, ptyId: string) => ptyInfo(ptyId))

  // Kill every pty belonging to a window when it closes.
  onWindowClosed((windowId) => {
    const set = byWindow.get(windowId)
    if (!set) return
    for (const ptyId of [...set]) killPty(ptyId)
    byWindow.delete(windowId)
  })
}
