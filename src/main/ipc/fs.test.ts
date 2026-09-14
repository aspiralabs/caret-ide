import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const handlers = new Map<string, (...args: unknown[]) => unknown>()
let root = ''

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => handlers.set(channel, fn)
  },
  shell: { trashItem: async () => {}, showItemInFolder: () => {} }
}))
vi.mock('../window', () => ({
  projectWindowFor: () => ({ id: 1, root, name: 'proj', win: { isDestroyed: () => false } }),
  onWindowClosed: () => {}
}))

import { IPC } from '../../shared/ipc'
import { registerFsIpc, renameSafe, writeFileAtomic } from './fs'

const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> =>
  Promise.resolve(handlers.get(channel)!({ sender: {} }, ...args) as T)

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'caret-fs-')))
  handlers.clear()
  registerFsIpc()
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('renameSafe (bug #8)', () => {
  it('renames when the target is free', async () => {
    writeFileSync(join(root, 'a.txt'), 'a')
    await renameSafe(root, join(root, 'a.txt'), join(root, 'b.txt'))
    expect(existsSync(join(root, 'b.txt'))).toBe(true)
    expect(existsSync(join(root, 'a.txt'))).toBe(false)
  })

  it('refuses to overwrite an existing target with EEXIST', async () => {
    writeFileSync(join(root, 'a.txt'), 'a')
    writeFileSync(join(root, 'b.txt'), 'b')
    await expect(renameSafe(root, join(root, 'a.txt'), join(root, 'b.txt'))).rejects.toMatchObject({
      code: 'EEXIST'
    })
    expect(existsSync(join(root, 'a.txt'))).toBe(true)
  })

  it('refuses to rename over a directory', async () => {
    writeFileSync(join(root, 'a.txt'), 'a')
    mkdirSync(join(root, 'dir'))
    await expect(renameSafe(root, join(root, 'a.txt'), join(root, 'dir'))).rejects.toMatchObject({
      code: 'EEXIST'
    })
  })

  it('allows a case-only rename (same inode) on case-insensitive filesystems', async () => {
    writeFileSync(join(root, 'README.md'), 'r')
    await renameSafe(root, join(root, 'README.md'), join(root, 'readme.md'))
    expect(existsSync(join(root, 'readme.md'))).toBe(true)
  })

  it('rejects paths outside the root', async () => {
    writeFileSync(join(root, 'a.txt'), 'a')
    await expect(renameSafe(root, join(root, 'a.txt'), join(root, '..', 'x.txt'))).rejects.toThrow(
      /escapes/
    )
  })

  it('goes through the IPC handler', async () => {
    writeFileSync(join(root, 'a.txt'), 'a')
    writeFileSync(join(root, 'b.txt'), 'b')
    await expect(invoke(IPC.fsRename, join(root, 'a.txt'), join(root, 'b.txt'))).rejects.toThrow(
      /EEXIST/
    )
  })
})

describe('fs:readFile', () => {
  it('rejects (rather than crashing) on a missing file so the renderer can render a notice', async () => {
    await expect(invoke(IPC.fsReadFile, join(root, 'nope.ts'))).rejects.toMatchObject({
      code: 'ENOENT'
    })
  })

  it('reads text and flags binary', async () => {
    writeFileSync(join(root, 't.txt'), 'hi')
    writeFileSync(join(root, 'b.bin'), Buffer.from([0, 1, 2]))
    expect(await invoke(IPC.fsReadFile, join(root, 't.txt'))).toEqual({
      content: 'hi',
      encoding: 'utf8',
      binary: false
    })
    expect(await invoke<{ binary: boolean }>(IPC.fsReadFile, join(root, 'b.bin'))).toMatchObject({
      binary: true
    })
  })
})

describe('fs:readDir (bug #14)', () => {
  it('lists in-project symlinks but skips ones that escape the root', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'caret-out-'))
    try {
      mkdirSync(join(root, 'real'))
      symlinkSync(join(root, 'real'), join(root, 'alias'))
      symlinkSync(outside, join(root, 'leak'))
      const entries = await invoke<Array<{ name: string }>>(IPC.fsReadDir, root)
      const names = entries.map((e) => e.name)
      expect(names).toContain('alias')
      expect(names).toContain('real')
      expect(names).not.toContain('leak')
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  })
})

describe('fs:readDataUrl', () => {
  it('returns null for missing/non-image files instead of rejecting', async () => {
    expect(await invoke(IPC.fsReadDataUrl, join(root, 'missing.png'))).toBeNull()
    writeFileSync(join(root, 'x.txt'), 'x')
    expect(await invoke(IPC.fsReadDataUrl, join(root, 'x.txt'))).toBeNull()
  })

  it('inlines an image as a data URL', async () => {
    writeFileSync(join(root, 'p.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    expect(await invoke(IPC.fsReadDataUrl, join(root, 'p.png'))).toBe('data:image/png;base64,iVBORw==')
  })
})

describe('fs:readDataUrl outside root (bug #11)', () => {
  it('resolves null instead of rejecting for a path that escapes the root', async () => {
    await expect(invoke(IPC.fsReadDataUrl, '/images/x.png')).resolves.toBeNull()
  })
})

describe('writeFileAtomic (#28)', () => {
  it('replaces the content, preserves the mode, and leaves no temp file', async () => {
    const f = join(root, 'run.sh')
    writeFileSync(f, '#!/bin/sh\necho old\n')
    chmodSync(f, 0o755)
    await invoke(IPC.fsWriteFile, f, '#!/bin/sh\necho new\n')
    expect(readFileSync(f, 'utf8')).toBe('#!/bin/sh\necho new\n')
    expect(statSync(f).mode & 0o777).toBe(0o755)
    expect(readdirSync(root).filter((n) => n.includes('.caret-'))).toEqual([])
  })

  it('creates a new file', async () => {
    await writeFileAtomic(join(root, 'new.txt'), 'x')
    expect(readFileSync(join(root, 'new.txt'), 'utf8')).toBe('x')
  })
})
