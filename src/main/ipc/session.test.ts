import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ ipcMain: { handle: () => {} } }))
vi.mock('../window', () => ({ projectWindowFor: () => undefined, onWindowClosed: () => {} }))

import { _internals, listSessions, sessionPaths } from './session'
import type { ProjectWindow } from '../window'

describe('sessionPaths (bug #15)', () => {
  it('encodes the project root the way Claude Code does and nests it under the projects root', () => {
    const { projectsRoot, sessionDir } = sessionPaths('/Users/me/Dev/SIMPLE_IDE', '/Users/me')
    expect(projectsRoot).toBe('/Users/me/.claude/projects')
    expect(sessionDir).toBe('/Users/me/.claude/projects/-Users-me-Dev-SIMPLE-IDE')
  })
})

const until = async (pred: () => boolean, ms = 4000): Promise<void> => {
  const t0 = Date.now()
  while (!pred()) {
    if (Date.now() - t0 > ms) throw new Error('timed out')
    await new Promise((r) => setTimeout(r, 25))
  }
}

describe('session watcher', () => {
  let home: string
  const sent: Array<{ title: string; sessionId: string }> = []
  const pw = {
    id: 42,
    root: '/proj/app',
    name: 'app',
    win: {
      isDestroyed: () => false,
      webContents: { send: (_c: string, p: { title: string; sessionId: string }) => sent.push(p) }
    }
  } as unknown as ProjectWindow

  beforeEach(() => {
    home = realpathSync(mkdtempSync(join(tmpdir(), 'caret-home-')))
    mkdirSync(join(home, '.claude', 'projects'), { recursive: true })
    sent.length = 0
  })
  afterEach(async () => {
    await _internals.stop(pw.id)
    rmSync(home, { recursive: true, force: true })
  })

  it('watches only the projects root (depth 0) until the session dir appears, then swaps (bug #15)', async () => {
    const { projectsRoot, sessionDir } = sessionPaths(pw.root, home)
    // Another project's session files that must NOT be watched.
    const other = join(projectsRoot, '-proj-other')
    mkdirSync(other)
    writeFileSync(join(other, 'x.jsonl'), '')

    await _internals.startWatch(pw, home)
    const parent = _internals.watcherFor(pw.id)!
    await until(() => Object.keys(parent.getWatched()).length > 0)
    const watched = parent.getWatched()
    expect(Object.keys(watched)).toContain(projectsRoot)
    // depth 0: the other project's dir is known as a child, but nothing inside it is watched.
    expect(watched[other] ?? []).toEqual([])

    // Claude Code starts for this project: dir + fresh session file.
    mkdirSync(sessionDir)
    await until(() => _internals.watcherFor(pw.id) !== parent)
    const direct = _internals.watcherFor(pw.id)!
    await until(() => Object.keys(direct.getWatched()).some((d) => d === sessionDir))
    // The parent watcher was closed: chokidar sets `closed` internally.
    expect((parent as unknown as { closed: boolean }).closed).toBe(true)
  })

  it('never labels a brand-new session with the previous session’s title (bug #16)', async () => {
    const { sessionDir } = sessionPaths(pw.root, home)
    mkdirSync(sessionDir, { recursive: true })
    writeFileSync(join(sessionDir, 'old.jsonl'), '{"type":"summary","summary":"Old work"}\n')
    writeFileSync(
      join(sessionDir, 'sessions-index.json'),
      JSON.stringify({ entries: [{ sessionId: 'old', summary: 'Old work', fileMtime: 1 }] })
    )
    await _internals.startWatch(pw, home)
    await until(() => sent.length >= 1)
    expect(sent[0]).toMatchObject({ title: 'Old work', sessionId: 'old' })

    // A new session file appears (empty at first).
    await new Promise((r) => setTimeout(r, 30)) // ensure a newer mtime
    writeFileSync(join(sessionDir, 'new.jsonl'), '')
    await new Promise((r) => setTimeout(r, 400))
    expect(sent.filter((s) => s.sessionId === 'old')).toHaveLength(1)
    expect(sent.some((s) => s.sessionId === 'new')).toBe(false)

    // Once it has its own first prompt, that becomes the label.
    writeFileSync(join(sessionDir, 'new.jsonl'), '{"type":"user","message":{"content":"Ship it"}}\n')
    await until(() => sent.some((s) => s.sessionId === 'new'))
    expect(sent.at(-1)).toMatchObject({ title: 'Ship it', sessionId: 'new' })
  })
})

describe('listSessions (integration #16)', () => {
  it('lists titled sessions newest first, skipping untitled ones', async () => {
    const home = realpathSync(mkdtempSync(join(tmpdir(), 'caret-home-')))
    try {
      const { sessionDir } = sessionPaths('/proj/app', home)
      mkdirSync(sessionDir, { recursive: true })
      writeFileSync(join(sessionDir, 'old.jsonl'), '{"type":"user","message":{"content":"first prompt here"}}\n')
      await new Promise((r) => setTimeout(r, 20))
      writeFileSync(join(sessionDir, 'named.jsonl'), '{"type":"custom-title","customTitle":"caret-audit"}\n')
      await new Promise((r) => setTimeout(r, 20))
      writeFileSync(join(sessionDir, 'empty.jsonl'), '')
      writeFileSync(
        join(sessionDir, 'sessions-index.json'),
        JSON.stringify({ entries: [{ sessionId: 'old', summary: 'Indexed title', fileMtime: 1 }] })
      )
      const list = await listSessions(sessionDir)
      expect(list.map((s) => s.sessionId)).toEqual(['named', 'old'])
      expect(list[0].title).toBe('caret-audit')
      expect(list[1].title).toBe('Indexed title')
      expect(await listSessions(join(home, 'nope'))).toEqual([])
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })
})
