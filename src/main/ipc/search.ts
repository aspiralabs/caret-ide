// ---------------------------------------------------------------------------
// Project search (find in project, ⌘⇧F). `git grep` does the heavy lifting —
// fast, honours .gitignore, includes untracked files. Outside a git repo a
// bounded manual scan of the file list runs instead.
// ---------------------------------------------------------------------------

import { execFile } from 'child_process'
import { promises as fsp } from 'fs'
import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { IPC } from '../../shared/ipc'
import type { SearchMatch } from '../../shared/types'
import { projectWindowFor, type ProjectWindow } from '../window'
import { listProjectFiles } from './fs'
import { parseGrepOutput, searchText } from './searchParse'
import { decodeText } from './textDecode'

const MAX_RESULTS = 500
/** Fallback scan limits so a huge non-git folder can't hang the app. */
const FALLBACK_MAX_FILES = 3000
const FALLBACK_MAX_BYTES = 512 * 1024

function requireWindow(event: IpcMainInvokeEvent): ProjectWindow {
  const pw = projectWindowFor(event.sender)
  if (!pw) throw new Error('No project window for sender')
  return pw
}

/** `git grep`; null when git fails for a reason other than "no matches" (exit 1). */
function gitGrep(root: string, query: string): Promise<SearchMatch[] | null> {
  return new Promise((resolve) => {
    execFile(
      'git',
      ['grep', '-n', '--column', '-I', '-i', '-F', '--untracked', '--no-color', '-e', query, '--', '.'],
      { cwd: root, timeout: 8000, maxBuffer: 32 * 1024 * 1024, windowsHide: true },
      (err, stdout) => {
        if (err && (err as { code?: number }).code !== 1) return resolve(null)
        resolve(parseGrepOutput(stdout, root, MAX_RESULTS))
      }
    )
  })
}

async function fallbackSearch(root: string, query: string): Promise<SearchMatch[]> {
  const paths = (await listProjectFiles(root)).slice(0, FALLBACK_MAX_FILES)
  const files: Array<{ path: string; text: string }> = []
  for (const path of paths) {
    try {
      const st = await fsp.stat(path)
      if (st.size > FALLBACK_MAX_BYTES) continue
      const d = decodeText(await fsp.readFile(path))
      if (!d.binary) files.push({ path, text: d.content })
    } catch {
      /* unreadable */
    }
  }
  return searchText(files, query, MAX_RESULTS)
}

export async function searchProject(root: string, query: string): Promise<SearchMatch[]> {
  const q = query.trim()
  if (!q) return []
  return (await gitGrep(root, q)) ?? fallbackSearch(root, q)
}

export function registerSearchIpc(): void {
  ipcMain.handle(IPC.searchProject, (event, query: string) => {
    const pw = requireWindow(event)
    return searchProject(pw.root, typeof query === 'string' ? query : '')
  })
}
