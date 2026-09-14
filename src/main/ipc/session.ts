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
// of the most-recently-modified session for the project — and ONLY that
// session's own title (index summary, else its .jsonl), never an older
// session's, so a fresh session doesn't inherit the previous name. It cannot reliably
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
import { parseSessionsIndex, resolveSessionTitle } from './sessionTitle'

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

/** Find the newest-modified *.jsonl in the session dir. */
async function newestJsonl(dir: string): Promise<{ file: string; mtimeMs: number } | null> {
  try {
    const names = await fsp.readdir(dir)
    let best: { file: string; mtimeMs: number } | null = null
    for (const name of names) {
      if (!name.endsWith('.jsonl')) continue
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

/**
 * Resolve the CURRENT session's title (newest .jsonl, its own summary or first
 * prompt — see sessionTitle.resolveSessionTitle) and push it to the renderer.
 * Emits nothing for a fresh session that has no title of its own yet, so a new
 * `claude` tab never inherits the previous session's name.
 */
async function emitUpdate(pw: ProjectWindow, dir: string): Promise<void> {
  const newest = await newestJsonl(dir)
  if (!newest) return
  const sessionId = basename(newest.file, extname(newest.file))
  const [indexRaw, jsonlText] = await Promise.all([
    fsp.readFile(join(dir, 'sessions-index.json'), 'utf8').catch(() => ''),
    fsp.readFile(newest.file, 'utf8').catch(() => '')
  ])
  const title = resolveSessionTitle(parseSessionsIndex(indexRaw), { sessionId, jsonlText })
  if (!title) return
  if (pw.win.isDestroyed()) return

  const payload: SessionUpdateEvent = {
    title,
    sessionId,
    file: newest.file,
    mtimeMs: newest.mtimeMs
  }
  pw.win.webContents.send(IPC.evtSessionUpdate, payload)
}

/** Watch the project's own session dir (depth 1: its files only). */
function watchSessionDir(pw: ProjectWindow, sessionDir: string): void {
  const watcher = chokidar.watch(sessionDir, {
    ignoreInitial: true,
    depth: 1,
    ignorePermissionErrors: true
  })
  const onChange = (changedPath: string): void => {
    const b = basename(changedPath)
    if (b === 'sessions-index.json' || b.endsWith('.jsonl')) void emitUpdate(pw, sessionDir)
  }
  watcher
    .on('add', onChange)
    .on('change', onChange)
    .on('error', (err) => console.error('[session] chokidar error:', err))
  watchers.set(pw.id, watcher)
  // Emit an initial snapshot if the dir already has data.
  void emitUpdate(pw, sessionDir)
}

/**
 * The session dir doesn't exist yet (Claude Code hasn't run for this project).
 * Watch ONLY the projects root's immediate children (depth 0) to notice the dir
 * being created, then swap to a direct watcher on it. Previously this watched
 * every other project's .jsonl files at depth 2 — per window, forever.
 */
function watchForSessionDir(pw: ProjectWindow, projectsRoot: string, sessionDir: string): void {
  const watcher = chokidar.watch(projectsRoot, {
    ignoreInitial: true,
    depth: 0,
    ignorePermissionErrors: true
  })
  watcher
    .on('addDir', (p: string) => {
      if (p !== sessionDir) return
      if (watchers.get(pw.id) === watcher) {
        watchers.delete(pw.id)
        watcher.close().catch(() => {})
      }
      watchSessionDir(pw, sessionDir)
    })
    .on('error', (err) => console.error('[session] chokidar error:', err))
  watchers.set(pw.id, watcher)
}

/** Build the two watch targets for a project root (exported for tests). */
export function sessionPaths(root: string, home = homedir()): { projectsRoot: string; sessionDir: string } {
  const projectsRoot = join(home, '.claude', 'projects')
  return { projectsRoot, sessionDir: join(projectsRoot, encodeProjectPath(root)) }
}

/** Test hooks. */
export const _internals = {
  startWatch,
  watcherFor: (windowId: number): FSWatcher | undefined => watchers.get(windowId),
  stop: async (windowId: number): Promise<void> => {
    await watchers.get(windowId)?.close()
    watchers.delete(windowId)
  }
}

async function startWatch(pw: ProjectWindow, home?: string): Promise<void> {
  if (watchers.has(pw.id)) return // already watching

  const { projectsRoot, sessionDir } = sessionPaths(pw.root, home)
  let exists = false
  try {
    exists = (await fsp.stat(sessionDir)).isDirectory()
  } catch {
    /* not yet created */
  }
  if (exists) watchSessionDir(pw, sessionDir)
  else watchForSessionDir(pw, projectsRoot, sessionDir)
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
