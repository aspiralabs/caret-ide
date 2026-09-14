import { describe, expect, it } from 'vitest'
import type { GitStatus } from '@shared/types'
import { repoLabel } from './git'

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
