// ---------------------------------------------------------------------------
// Git status IPC (status bar).
//
// Read-only. Shells out to the system `git` once per request and parses the
// `--porcelain=v2 --branch` output — a single call yields the branch, upstream
// ahead/behind, and every file's staged/worktree state. The renderer polls this
// (debounced on fs changes) to drive the bottom status bar.
// ---------------------------------------------------------------------------

import { execFile } from 'child_process'
import { basename } from 'path'
import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { IPC } from '../../shared/ipc'
import type { GitStatus } from '../../shared/types'
import { projectWindowFor, type ProjectWindow } from '../window'

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
      { cwd, timeout: 4000, maxBuffer: 8 * 1024 * 1024, windowsHide: true },
      (err, stdout) => resolve(err ? null : stdout)
    )
  })
}

function notRepo(root: string): GitStatus {
  return {
    isRepo: false,
    branch: null,
    detached: false,
    ahead: 0,
    behind: 0,
    hasUpstream: false,
    staged: 0,
    modified: 0,
    untracked: 0,
    conflicted: 0,
    stashed: 0,
    repo: basename(root)
  }
}

/** Derive a repo display name from an origin remote URL, stripping `.git`. */
function repoNameFromRemote(url: string): string | null {
  const trimmed = url.trim().replace(/\.git$/, '')
  if (!trimmed) return null
  // Handles both scp-style (git@host:owner/repo) and URL-style remotes.
  const seg = trimmed.split(/[/:]/).filter(Boolean).pop()
  return seg || null
}

async function readStatus(root: string): Promise<GitStatus> {
  const porcelain = await git(root, ['status', '--porcelain=v2', '--branch', '--untracked-files=all'])
  if (porcelain === null) return notRepo(root)

  const status = notRepo(root)
  status.isRepo = true

  for (const line of porcelain.split('\n')) {
    if (!line) continue

    if (line.startsWith('# branch.head ')) {
      const head = line.slice('# branch.head '.length).trim()
      if (head === '(detached)') {
        status.detached = true
      } else {
        status.branch = head
      }
      continue
    }
    if (line.startsWith('# branch.upstream ')) {
      status.hasUpstream = true
      continue
    }
    if (line.startsWith('# branch.ab ')) {
      // Format: "# branch.ab +<ahead> -<behind>"
      const m = line.match(/\+(\d+)\s+-(\d+)/)
      if (m) {
        status.ahead = Number(m[1])
        status.behind = Number(m[2])
      }
      continue
    }
    if (line.startsWith('#')) continue

    // Entry lines. Field 2 (for 1/2) is the two-char XY code: X=index, Y=worktree.
    const type = line[0]
    if (type === '1' || type === '2') {
      const xy = line.split(' ')[1] ?? '..'
      if (xy[0] !== '.') status.staged++
      if (xy[1] !== '.') status.modified++
    } else if (type === 'u') {
      status.conflicted++
    } else if (type === '?') {
      status.untracked++
    }
  }

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

  // Stash count (cheap; one line per stash).
  if (stash) status.stashed = stash.split('\n').filter(Boolean).length

  // Prefer the origin remote name for display, else the folder name.
  const remoteName = remote ? repoNameFromRemote(remote) : null
  if (remoteName) status.repo = remoteName

  return status
}

export function registerGitIpc(): void {
  ipcMain.handle(IPC.gitStatus, (event) => {
    const pw = requireWindow(event)
    return readStatus(pw.root)
  })
}
