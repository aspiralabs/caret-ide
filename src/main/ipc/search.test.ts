import { execFileSync } from 'child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ ipcMain: { handle: () => {} }, shell: {} }))
vi.mock('../window', () => ({ projectWindowFor: () => undefined, onWindowClosed: () => {} }))

import { searchProject } from './search'

let root: string
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'caret-search-')))
  mkdirSync(join(root, 'src'))
  writeFileSync(join(root, 'src', 'a.ts'), 'const useTabsStore = 1\nexport { useTabsStore }\n')
  writeFileSync(join(root, 'README.md'), '# Caret\nTabs store docs\n')
  writeFileSync(join(root, 'bin.dat'), Buffer.from([0, 1, 2, 3]))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('searchProject (#19)', () => {
  it('searches a git repo (including untracked files) with git grep', async () => {
    execFileSync('git', ['init', '-q'], { cwd: root })
    const hits = await searchProject(root, 'tabsstore')
    expect(hits.map((h) => `${h.path.slice(root.length)}:${h.line}:${h.column}`)).toEqual([
      '/src/a.ts:1:10',
      '/src/a.ts:2:13'
    ])
    expect(hits[0].text).toBe('const useTabsStore = 1')
    // Case-insensitive, and untracked files are included.
    expect((await searchProject(root, 'tabs store')).map((h) => h.path.slice(root.length))).toEqual(['/README.md'])
    expect(await searchProject(root, 'nothing-here-xyz')).toEqual([])
    expect(await searchProject(root, '   ')).toEqual([])
  })

  it('falls back to a manual scan outside git, skipping binary files', async () => {
    const hits = await searchProject(root, 'tabs')
    expect(hits.map((h) => h.path.slice(root.length))).toEqual(['/README.md', '/src/a.ts', '/src/a.ts'])
  })
})
