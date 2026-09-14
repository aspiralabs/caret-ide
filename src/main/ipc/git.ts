// ---------------------------------------------------------------------------
// Git status IPC (status bar).
//
// Read-only. Shells out to the system `git` once per request and parses the
// `--porcelain=v2 --branch` output — a single call yields the branch, upstream
// ahead/behind, and every file's staged/worktree state. The renderer polls this
// (debounced on fs changes) to drive the bottom status bar.
// ---------------------------------------------------------------------------

import { execFile } from 'child_process'
import { relative, sep } from 'path'
import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { IPC } from '../../shared/ipc'
import type { GitStatus } from '../../shared/types'
import { assertInsideRoot } from '../security'
import { projectWindowFor, type ProjectWindow } from '../window'
import { countStashes, emptyStatus, parsePorcelainV2, repoNameFromRemote } from './gitStatusParse'

function requireWindow(event: IpcMainInvokeEvent): ProjectWindow {
  const pw = projectWindowFor(event.sender)
  if (!pw) throw new Error('No project window for sender')
  return pw
}

/** Run `git` in `cwd`; resolves stdout, or null on any failure (git missing, not a repo, etc.). */
function git(cwd: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(
      'git',
      args,
      { cwd, timeout: 8000, maxBuffer: 32 * 1024 * 1024, windowsHide: true },
      (err, stdout) => resolve(err ? null : stdout)
    )
  })
}

async function readStatus(root: string): Promise<GitStatus> {
  const porcelain = await git(root, ['status', '--porcelain=v2', '--branch', '--untracked-files=all'])
  if (porcelain === null) return emptyStatus(root)

  const status = parsePorcelainV2(porcelain, root)

  // The remaining lookups are independent — run them concurrently rather than
  // spawning git three more times back-to-back.
  const needSha = status.detached && !status.branch
  const [sha, stash, remote] = await Promise.all([
    needSha ? git(root, ['rev-parse', '--short', 'HEAD']) : Promise.resolve(null),
    git(root, ['stash', 'list']),
    git(root, ['remote', 'get-url', 'origin'])
  ])

  // Detached HEAD: surface the short SHA as the "branch" label.
  if (needSha) status.branch = sha ? sha.trim() : 'detached'
  status.stashed = countStashes(stash)
  // Prefer the origin remote name for display, else the folder name.
  const remoteName = remote ? repoNameFromRemote(remote) : null
  if (remoteName) status.repo = remoteName

  return status
}

/**
 * A tracked file's content at HEAD (for gutter diffs / the quick-diff view),
 * or null when it isn't in HEAD (new file) or the root isn't a repo. Uses
 * `git show HEAD:<rel>` with the path made root-relative; the path is
 * validated against the root first like every other fs access.
 */
async function showHead(root: string, path: string): Promise<string | null> {
  const abs = assertInsideRoot(root, path)
  const rel = relative(root, abs)
  if (!rel || rel.startsWith('..')) return null
  return git(root, ['show', `HEAD:${rel.split(sep).join('/')}`])
}

export function registerGitIpc(): void {
  ipcMain.handle(IPC.gitStatus, (event) => {
    const pw = requireWindow(event)
    return readStatus(pw.root)
  })

  ipcMain.handle(IPC.gitShowHead, (event, path: string) => {
    const pw = requireWindow(event)
    return showHead(pw.root, path)
  })
}
