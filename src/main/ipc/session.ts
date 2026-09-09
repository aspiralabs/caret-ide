// ---------------------------------------------------------------------------
// Claude Code session watcher (spec §6 fallback mechanism).
//
// When Claude Code does not emit an OSC title (or does so unreliably), we watch
// its on-disk session metadata and surface the session title to the renderer so
// a terminal tab can follow a `/rename`.
//
// EMPIRICAL FINDINGS (verified against ~/.claude on this machine, 2026-09):
//
//  • Encoded dir name: Claude replaces EVERY non-alphanumeric character in the
//    absolute project path with '-' (so '/', '.', and '_' all become '-') and
//    keeps the leading '-' from the leading slash. Example:
//        /Users/davidludemann/Documents/.../SIMPLE_IDE
//      →  -Users-davidludemann-Documents-...-SIMPLE-IDE
//    (note the '_' in SIMPLE_IDE collapsed to '-'). We reproduce this with
//    `path.replace(/[^A-Za-z0-9]/g, '-')`.
//
//  • Inside <dir> Claude keeps one `<sessionId>.jsonl` per session, plus a
//    `sessions-index.json` roll-up: { version, entries: [{ sessionId, summary,
//    firstPrompt, fileMtime, modified, ... }] }. The `summary` field is the
//    human session title (what `/rename` / auto-summary produces) and is by far
//    the best title source, so we prefer it. When there is no index yet we fall
//    back to scanning the newest `.jsonl` for a `type:"summary"` line and then
//    to its first user prompt.
//
// LIMITATION (spec §6 acceptance criterion #3): the watcher reports the title
// of the most-recently-modified session for the project. It cannot reliably
// correlate two CONCURRENT `claude` sessions to their individual terminal tabs
// (there is no pty↔sessionId link on disk), so with two live sessions the tabs
// may briefly cross-label. This is the documented, accepted relaxation of
// criterion #3 under the fallback mechanism; the OSC-title primary mechanism
// (renderer-side) does not have this limitation.
// ---------------------------------------------------------------------------

import { promises as fsp } from 'fs'
import { homedir } from 'os'
import { basename, extname, join } from 'path'
import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import chokidar, { type FSWatcher } from 'chokidar'
import { IPC } from '../../shared/ipc'
import type { SessionUpdateEvent } from '../../shared/types'
import { onWindowClosed, projectWindowFor, type ProjectWindow } from '../window'

/** One watcher per window. */
const watchers = new Map<number, FSWatcher>()

/** Encode a project root the way Claude Code names its session directory. */
function encodeProjectPath(root: string): string {
  return root.replace(/[^A-Za-z0-9]/g, '-')
}

function requireWindow(event: IpcMainInvokeEvent): ProjectWindow {
  const pw = projectWindowFor(event.sender)
  if (!pw) throw new Error('No project window for sender')
  return pw
}

/** Read the newest `summary` for a session from the sessions-index roll-up. */
async function titleFromIndex(
  dir: string
): Promise<{ title: string; sessionId: string; file: string; mtimeMs: number } | null> {
  try {
    const raw = await fsp.readFile(join(dir, 'sessions-index.json'), 'utf8')
    const parsed = JSON.parse(raw) as {
      entries?: Array<{
        sessionId?: string
        summary?: string
        fullPath?: string
        fileMtime?: number
      }>
    }
    const entries = parsed.entries ?? []
    let best: { title: string; sessionId: string; file: string; mtimeMs: number } | null = null
    for (const e of entries) {
      if (!e.summary || !e.sessionId) continue
      const mtimeMs = e.fileMtime ?? 0
      if (!best || mtimeMs > best.mtimeMs) {
        best = {
          title: e.summary,
          sessionId: e.sessionId,
          file: e.fullPath ?? join(dir, `${e.sessionId}.jsonl`),
          mtimeMs
        }
      }
    }
    return best
  } catch {
    return null
  }
}

/** Fallback: scan the newest .jsonl for a summary line, else its first prompt. */
async function titleFromJsonl(
  file: string,
  mtimeMs: number
): Promise<{ title: string; sessionId: string; file: string; mtimeMs: number } | null> {
  try {
    const raw = await fsp.readFile(file, 'utf8')
    const sessionId = basename(file, extname(file))
    let firstPrompt: string | null = null

    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      let obj: Record<string, unknown>
      try {
        obj = JSON.parse(trimmed)
      } catch {
        continue
      }
      // Preferred: an explicit summary/title/name field.
      const summary =
        (obj.type === 'summary' && typeof obj.summary === 'string' && obj.summary) ||
        (typeof obj.title === 'string' && obj.title) ||
        (typeof obj.name === 'string' && obj.name) ||
        (typeof obj.summary === 'string' && obj.summary)
      if (summary) {
        return { title: summary, sessionId, file, mtimeMs }
      }
      // Remember the first human prompt as a last-resort label.
      if (firstPrompt === null && obj.type === 'user') {
        const msg = obj.message as { content?: unknown } | undefined
        if (typeof msg?.content === 'string') firstPrompt = msg.content
      }
    }

    if (firstPrompt) {
      const clipped = firstPrompt.replace(/\s+/g, ' ').trim().slice(0, 80)
      if (clipped) return { title: clipped, sessionId, file, mtimeMs }
    }
    return null
  } catch {
    return null
  }
}

/** Find the newest-modified *.jsonl in the session dir. */
async function newestJsonl(dir: string): Promise<{ file: string; mtimeMs: number } | null> {
  try {
    const names = await fsp.readdir(dir)
    let best: { file: string; mtimeMs: number } | null = null
    for (const name of names) {
      if (!name.endsWith('.jsonl') && !name.endsWith('.json')) continue
      if (name === 'sessions-index.json') continue
      const full = join(dir, name)
      try {
        const st = await fsp.stat(full)
        if (!st.isFile()) continue
        if (!best || st.mtimeMs > best.mtimeMs) best = { file: full, mtimeMs: st.mtimeMs }
      } catch {
        /* skip unreadable */
      }
    }
    return best
  } catch {
    return null
  }
}

/** Resolve the best session title for the project dir and push it to renderer. */
async function emitUpdate(pw: ProjectWindow, dir: string): Promise<void> {
  // Prefer the index roll-up (best titles); fall back to the newest jsonl.
  let result = await titleFromIndex(dir)
  if (!result) {
    const newest = await newestJsonl(dir)
    if (newest) result = await titleFromJsonl(newest.file, newest.mtimeMs)
  }
  if (!result) return
  if (pw.win.isDestroyed()) return

  const payload: SessionUpdateEvent = {
    title: result.title,
    sessionId: result.sessionId,
    file: result.file,
    mtimeMs: result.mtimeMs
  }
  pw.win.webContents.send(IPC.evtSessionUpdate, payload)
}

async function startWatch(pw: ProjectWindow): Promise<void> {
  if (watchers.has(pw.id)) return // already watching

  const projectsRoot = join(homedir(), '.claude', 'projects')
  const encoded = encodeProjectPath(pw.root)
  const sessionDir = join(projectsRoot, encoded)

  // If the exact session dir exists, watch it directly; otherwise watch the
  // parent so we pick the dir up when Claude Code creates it (best-effort).
  let watchTarget = sessionDir
  try {
    const st = await fsp.stat(sessionDir)
    if (!st.isDirectory()) watchTarget = projectsRoot
  } catch {
    watchTarget = projectsRoot
  }

  const watcher = chokidar.watch(watchTarget, {
    ignoreInitial: true,
    depth: watchTarget === projectsRoot ? 2 : 1,
    ignorePermissionErrors: true
  })

  const onChange = (changedPath: string): void => {
    // Only react to files belonging to THIS project's session dir.
    if (!changedPath.startsWith(sessionDir)) return
    const b = basename(changedPath)
    if (b === 'sessions-index.json' || b.endsWith('.jsonl') || b.endsWith('.json')) {
      void emitUpdate(pw, sessionDir)
    }
  }

  watcher
    .on('add', onChange)
    .on('change', onChange)
    .on('error', (err) => console.error('[session] chokidar error:', err))

  watchers.set(pw.id, watcher)

  // Emit an initial snapshot if the dir already has data.
  void emitUpdate(pw, sessionDir)
}

export function registerSessionIpc(): void {
  ipcMain.handle(IPC.sessionWatchStart, (event) => {
    const pw = requireWindow(event)
    return startWatch(pw)
  })

  onWindowClosed((windowId) => {
    const watcher = watchers.get(windowId)
    if (watcher) {
      watcher.close().catch(() => {})
      watchers.delete(windowId)
    }
  })
}
