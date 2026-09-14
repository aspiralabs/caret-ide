import { describe, expect, it } from 'vitest'
import type { GitStatus } from '@shared/types'
import { changeFor, dirHasChanges, repoLabel, stateColorClass, stateLetter } from './git'

const status = (over: Partial<GitStatus>): GitStatus => ({
  isRepo: true,
  branch: 'main',
  detached: false,
  ahead: 0,
  behind: 0,
  hasUpstream: false,
  staged: 0,
  modified: 0,
  untracked: 0,
  conflicted: 0,
  stashed: 0,
  repo: 'caret',
  files: [],
  ...over
})

describe('repoLabel', () => {
  it('is empty when there is no status or not a repo (bug #18)', () => {
    expect(repoLabel(null, 'caret')).toBeNull()
    expect(repoLabel(status({ isRepo: false, repo: 'caret' }), 'caret')).toBeNull()
  })

  it('hides a repo name that merely repeats the project folder name', () => {
    expect(repoLabel(status({ repo: 'caret' }), 'caret')).toBeNull()
  })

  it('shows the remote-derived repo name when it differs', () => {
    expect(repoLabel(status({ repo: 'simple-ide' }), 'SIMPLE_IDE')).toBe('simple-ide')
  })
})

describe('per-file helpers (integration #14)', () => {
  const s = status({
    files: [
      { path: '/p/src/a.ts', state: 'modified', staged: false, unstaged: true },
      { path: '/p/docs/new.md', state: 'untracked', staged: false, unstaged: true }
    ]
  })
  it('finds a file’s change and whether a folder contains changes', () => {
    expect(changeFor(s, '/p/src/a.ts')?.state).toBe('modified')
    expect(changeFor(s, '/p/src/b.ts')).toBeUndefined()
    expect(changeFor(null, '/p/src/a.ts')).toBeUndefined()
    expect(dirHasChanges(s, '/p/src')).toBe(true)
    expect(dirHasChanges(s, '/p/src/')).toBe(true)
    expect(dirHasChanges(s, '/p/srcx')).toBe(false)
    expect(dirHasChanges(s, '/p/lib')).toBe(false)
    expect(dirHasChanges(null, '/p')).toBe(false)
  })
  it('maps states to colours and letters', () => {
    expect(stateColorClass('modified')).toContain('amber')
    expect(stateColorClass('untracked')).toContain('emerald')
    expect(stateColorClass('conflicted')).toContain('red')
    expect(stateColorClass(undefined)).toBe('')
    expect(stateLetter('renamed')).toBe('R')
  })
})
