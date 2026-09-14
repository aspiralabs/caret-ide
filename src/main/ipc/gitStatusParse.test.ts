import { describe, expect, it } from 'vitest'
import { countStashes, parsePorcelainV2, repoNameFromRemote } from './gitStatusParse'

const sample = [
  '# branch.oid abc',
  '# branch.head main',
  '# branch.upstream origin/main',
  '# branch.ab +2 -1',
  '1 .M N... 100644 100644 100644 abc def src/App.tsx',
  '1 M. N... 100644 100644 100644 abc def src/staged.ts',
  '1 MM N... 100644 100644 100644 abc def src/both.ts',
  '1 A. N... 000000 100644 100644 000 def src/new file.ts',
  '1 .D N... 100644 100644 000000 abc 000 gone.ts',
  '2 R. N... 100644 100644 100644 abc def R100 src/renamed.ts\tsrc/old.ts',
  'u UU N... 100644 100644 100644 100644 a b c conflict.ts',
  '? notes.md',
  ''
].join('\n')

describe('parsePorcelainV2 (integration #14)', () => {
  const s = parsePorcelainV2(sample, '/p')

  it('reads branch, upstream, ahead/behind and counts', () => {
    expect(s).toMatchObject({
      isRepo: true,
      branch: 'main',
      detached: false,
      hasUpstream: true,
      ahead: 2,
      behind: 1,
      staged: 4, // staged.ts, both.ts, new file.ts, renamed.ts
      modified: 3, // App.tsx, both.ts, gone.ts
      untracked: 1,
      conflicted: 1
    })
  })

  it('lists every changed file with its state and absolute path', () => {
    const by = Object.fromEntries(s.files.map((f) => [f.path, f]))
    expect(by['/p/src/App.tsx']).toMatchObject({ state: 'modified', staged: false, unstaged: true })
    expect(by['/p/src/staged.ts']).toMatchObject({ state: 'modified', staged: true, unstaged: false })
    expect(by['/p/src/both.ts']).toMatchObject({ state: 'modified', staged: true, unstaged: true })
    expect(by['/p/src/new file.ts']).toMatchObject({ state: 'added', staged: true })
    expect(by['/p/gone.ts']).toMatchObject({ state: 'deleted' })
    expect(by['/p/src/renamed.ts']).toMatchObject({ state: 'renamed', staged: true })
    expect(by['/p/conflict.ts']).toMatchObject({ state: 'conflicted' })
    expect(by['/p/notes.md']).toMatchObject({ state: 'untracked' })
    expect(s.files).toHaveLength(8)
  })

  it('handles a detached head and a clean tree', () => {
    const d = parsePorcelainV2('# branch.head (detached)\n', '/p')
    expect(d).toMatchObject({ detached: true, branch: null, files: [] })
  })
})

describe('helpers', () => {
  it('counts stashes and derives repo names', () => {
    expect(countStashes(null)).toBe(0)
    expect(countStashes('stash@{0}: x\nstash@{1}: y\n')).toBe(2)
    expect(repoNameFromRemote('git@github.com:aspiralabs/caret-ide.git')).toBe('caret-ide')
    expect(repoNameFromRemote('https://github.com/aspiralabs/caret-ide')).toBe('caret-ide')
    expect(repoNameFromRemote('  ')).toBeNull()
  })
})
