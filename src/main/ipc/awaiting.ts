// ---------------------------------------------------------------------------
// Awaiting input: a Claude session in a Caret terminal paused for the user.
//
// Every pty gets CARET_NOTIFY_SOCK + CARET_PTY_ID in its env and the
// `notify-ide` script on PATH (see shellIntegration). Claude Code hooks (or a
// skill, or the user) run `notify-ide awaiting|clear|hook`, which writes one
// message to our unix socket. We keep the set of awaiting ptys per project and
// push it to that project's renderer (session-tab dot, AwaitingState) and, when
// the project flips between none and some, re-push the title-bar tab strip
// (ProjectTab.awaiting). The renderer clears a pty when the user types into it.
// ---------------------------------------------------------------------------

import { chmodSync, unlinkSync } from 'fs'
import { createServer, type Server } from 'net'
import { tmpdir } from 'os'
import { join } from 'path'
import { app, ipcMain } from 'electron'
import { IPC } from '../../shared/ipc'
import type { AwaitingState } from '../../shared/types'
import { projectWindowFor, setProjectAwaiting, type ProjectWindow } from '../window'
import { MAX_NOTIFY_BYTES, parseNotifyMessage, type AwaitingAction } from './awaitingParse'

interface PtyEntry {
  pw: ProjectWindow
  awaiting: boolean
}

/** Every live pty, so a message can be routed to its project. */
const entries = new Map<string, PtyEntry>()

let server: Server | null = null
let socketPath: string | null = null

function stateFor(pw: ProjectWindow): AwaitingState {
  const ptyIds: string[] = []
  for (const [ptyId, e] of entries) if (e.pw === pw && e.awaiting) ptyIds.push(ptyId)
  return { ptyIds }
}

function publish(pw: ProjectWindow): void {
  const state = stateFor(pw)
  if (!pw.wc.isDestroyed()) pw.wc.send(IPC.evtAwaitingChanged, state)
  setProjectAwaiting(pw, state.ptyIds.length > 0)
}

function apply(ptyId: string, action: AwaitingAction): void {
  const e = entries.get(ptyId)
  const awaiting = action === 'awaiting'
  if (!e || e.awaiting === awaiting) return
  e.awaiting = awaiting
  publish(e.pw)
}

/** Env vars for a new pty; {} when the server isn't running. */
export function awaitingEnv(ptyId: string): Record<string, string> {
  return socketPath ? { CARET_NOTIFY_SOCK: socketPath, CARET_PTY_ID: ptyId } : {}
}

export function awaitingPtyOpened(ptyId: string, pw: ProjectWindow): void {
  entries.set(ptyId, { pw, awaiting: false })
}

/** A pty exited or was killed: drop it (and its dot). */
export function awaitingPtyClosed(ptyId: string): void {
  const e = entries.get(ptyId)
  if (!e) return
  entries.delete(ptyId)
  if (e.awaiting) publish(e.pw)
}

/**
 * Socket path: per Caret process (dev and an installed build don't collide)
 * in the per-user temp dir. sun_path is 104 bytes on macOS, so fall back to
 * /tmp if TMPDIR is unusually long.
 */
function pickSocketPath(): string {
  const name = `caret-${process.pid}.sock`
  const preferred = join(tmpdir(), name)
  return Buffer.byteLength(preferred) < 100 ? preferred : join('/tmp', name)
}

function startServer(): void {
  const path = pickSocketPath()
  try {
    unlinkSync(path)
  } catch {
    // No stale socket.
  }
  const srv = createServer((sock) => {
    let raw = ''
    sock.setEncoding('utf8')
    sock.setTimeout(2000, () => sock.destroy())
    sock.on('data', (chunk: string) => {
      raw += chunk
      if (raw.length > MAX_NOTIFY_BYTES) sock.destroy()
    })
    sock.on('end', () => {
      const msg = parseNotifyMessage(raw)
      if (msg) apply(msg.ptyId, msg.action)
      sock.end()
    })
    sock.on('error', () => {
      // Client went away mid-write; nothing to do.
    })
  })
  srv.on('error', () => {
    // Can't listen (or died): notify-ide sees no socket and no-ops.
    socketPath = null
  })
  // Set now, not in the listen callback: ptys created in the meantime still
  // get the env (a message sent before we're listening just no-ops).
  socketPath = path
  srv.listen(path, () => {
    try {
      chmodSync(path, 0o600)
    } catch {
      // Best effort; the temp dir is already per-user on macOS.
    }
  })
  server = srv
  app.on('will-quit', () => {
    server?.close()
    try {
      unlinkSync(path)
    } catch {
      // Already gone.
    }
  })
}

export function registerAwaitingIpc(enabled: boolean): void {
  if (enabled) startServer()

  ipcMain.handle(IPC.awaitingGet, (event): AwaitingState => {
    const pw = projectWindowFor(event.sender)
    return pw ? stateFor(pw) : { ptyIds: [] }
  })

  ipcMain.on(IPC.awaitingClear, (event, payload: { ptyId?: unknown }) => {
    const ptyId = typeof payload?.ptyId === 'string' ? payload.ptyId : null
    const pw = projectWindowFor(event.sender)
    // Only the pty's own project may clear it.
    if (ptyId && pw && entries.get(ptyId)?.pw === pw) apply(ptyId, 'clear')
  })
}
