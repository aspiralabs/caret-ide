// ---------------------------------------------------------------------------
// PTY / terminal IPC (spec §5.4, §9.1).
//
// Main owns every node-pty instance. Shells are spawned as LOGIN shells
// (`/bin/zsh -l`) so GUI-launched apps still resolve `claude`, `node`, `npm`
// via the user's PATH (spec §9.1). Each pty streams data to its owning window
// and is killed when that window closes.
// ---------------------------------------------------------------------------

import { execFile } from 'child_process'
import { basename } from 'path'
import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import * as pty from 'node-pty'
import { IPC } from '../../shared/ipc'
import type {
  PtyCreateOptions,
  PtyCreateResult,
  PtyDataEvent,
  PtyExitEvent,
  PtyForeground
} from '../../shared/types'
import { onWindowClosed, projectWindowFor, type ProjectWindow } from '../window'

interface PtyRecord {
  proc: pty.IPty
  windowId: number
}

/** All live ptys, keyed by ptyId. */
const ptys = new Map<string, PtyRecord>()
/** ptyIds grouped per window so we can bulk-kill on window close. */
const byWindow = new Map<number, Set<string>>()

let counter = 0

/** Login-shell basenames we do NOT want to report as the "foreground" process. */
const SHELL_NAMES = new Set(['zsh', '-zsh', 'bash', '-bash', 'sh', '-sh', 'login'])

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

function createPty(pw: ProjectWindow, opts: PtyCreateOptions): PtyCreateResult {
  const shell = opts.shell ?? '/bin/zsh'
  const proc = pty.spawn(shell, ['-l'], {
    name: 'xterm-256color',
    cwd: opts.cwd,
    cols: opts.cols,
    rows: opts.rows,
    env: { ...process.env, TERM: 'xterm-256color' }
  })

  const ptyId = `pty_${Date.now()}_${counter++}`
  ptys.set(ptyId, { proc, windowId: pw.id })
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

/**
 * Best-effort foreground-process detection for a pty (spec §6 "detecting what's
 * running"). The command the user is interacting with (e.g. `claude`) runs in
 * the tty's FOREGROUND process group — under job control an interactive login
 * shell puts each foreground job in its OWN pgrp, so the shell's group only ever
 * contains the shell itself. We therefore read the tty's foreground group id
 * (`tpgid`) off the pty child, then read that group leader's command (its pid ==
 * tpgid). When the shell itself is in front (tpgid == shell pid) nothing is
 * running, so we report null. Wrapped so it can never throw.
 */
function foreground(ptyId: string): Promise<PtyForeground> {
  return new Promise((resolve) => {
    const rec = ptys.get(ptyId)
    if (!rec) {
      resolve({ name: null })
      return
    }
    const shellPid = rec.proc.pid
    execFile('/bin/ps', ['-o', 'tpgid=', '-p', String(shellPid)], (err, out) => {
      const tpgid = err ? NaN : parseInt(out.trim(), 10)
      // No distinct foreground group (lookup failed, or the shell is in front).
      if (!Number.isFinite(tpgid) || tpgid <= 0 || tpgid === shellPid) {
        resolve({ name: null })
        return
      }
      // The foreground group's leader pid == tpgid; its command is the running CLI.
      execFile('/bin/ps', ['-o', 'comm=', '-p', String(tpgid)], (err2, out2) => {
        if (err2) {
          resolve({ name: null })
          return
        }
        const name = basename(out2.trim()) // strip absolute path → command basename
        resolve({ name: name && !SHELL_NAMES.has(name) ? name : null })
      })
    })
  })
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

  // Kill every pty belonging to a window when it closes.
  onWindowClosed((windowId) => {
    const set = byWindow.get(windowId)
    if (!set) return
    for (const ptyId of [...set]) killPty(ptyId)
    byWindow.delete(windowId)
  })
}
