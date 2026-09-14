// Pure parser for `git status --porcelain=v2 --branch` (no electron / child
// process imports so it's unit-testable).

import { basename, join } from 'path'
import type { GitFileChange, GitFileState, GitStatus } from '../../shared/types'

export function emptyStatus(root: string): GitStatus {
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
    repo: basename(root),
    files: []
  }
}

/** Map one side's XY code letter to a file state. */
function stateFor(code: string): GitFileState | null {
  switch (code) {
    case 'M':
    case 'T':
      return 'modified'
    case 'A':
      return 'added'
    case 'D':
      return 'deleted'
    case 'R':
    case 'C':
      return 'renamed'
    default:
      return null
  }
}

/**
 * Parse porcelain v2 output into the status-bar counts plus a per-file list.
 * Entry lines: `1 XY … path`, `2 XY … path\torigPath` (rename), `u XY … path`
 * (conflict), `? path` (untracked). `X` is the index side, `Y` the worktree.
 */
export function parsePorcelainV2(text: string, root: string): GitStatus {
  const status = emptyStatus(root)
  status.isRepo = true

  for (const line of text.split('\n')) {
    if (!line) continue

    if (line.startsWith('# branch.head ')) {
      const head = line.slice('# branch.head '.length).trim()
      if (head === '(detached)') status.detached = true
      else status.branch = head
      continue
    }
    if (line.startsWith('# branch.upstream ')) {
      status.hasUpstream = true
      continue
    }
    if (line.startsWith('# branch.ab ')) {
      const m = line.match(/\+(\d+)\s+-(\d+)/)
      if (m) {
        status.ahead = Number(m[1])
        status.behind = Number(m[2])
      }
      continue
    }
    if (line.startsWith('#')) continue

    const type = line[0]
    if (type === '1' || type === '2') {
      const parts = line.split(' ')
      const xy = parts[1] ?? '..'
      // Path is everything after the 8th (type 1) / 9th (type 2) field; a
      // rename line carries `newPath\toldPath`.
      const pathField = parts.slice(type === '1' ? 8 : 9).join(' ')
      const path = pathField.split('\t')[0]
      const staged = xy[0] !== '.'
      const unstaged = xy[1] !== '.'
      if (staged) status.staged++
      if (unstaged) status.modified++
      const state = stateFor(xy[1] !== '.' ? xy[1] : xy[0]) ?? 'modified'
      status.files.push({ path: join(root, path), state, staged, unstaged })
    } else if (type === 'u') {
      const parts = line.split(' ')
      status.conflicted++
      status.files.push({ path: join(root, parts.slice(10).join(' ')), state: 'conflicted', staged: false, unstaged: true })
    } else if (type === '?') {
      status.untracked++
      status.files.push({ path: join(root, line.slice(2)), state: 'untracked', staged: false, unstaged: true })
    }
  }
  return status
}

/** Number of stash entries in `git stash list` output. */
export function countStashes(out: string | null): number {
  return out ? out.split('\n').filter(Boolean).length : 0
}

/** Derive a repo display name from an origin remote URL, stripping `.git`. */
export function repoNameFromRemote(url: string): string | null {
  const trimmed = url.trim().replace(/\.git$/, '')
  if (!trimmed) return null
  // Handles both scp-style (git@host:owner/repo) and URL-style remotes.
  const seg = trimmed.split(/[/:]/).filter(Boolean).pop()
  return seg || null
}

export type { GitFileChange }
