// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useFilesStore } from './files'

describe('files.revealPath (#26)', () => {
  const readDir = vi.fn(async (p: string) => [{ name: 'x', path: p + '/x', isDir: false, isSymlink: false, ignored: false }])
  beforeEach(() => {
    ;(window as unknown as { ide: unknown }).ide = { fs: { readDir } }
    readDir.mockClear()
    useFilesStore.setState({ children: {}, expanded: new Set(), loading: new Set(), selectedPath: null })
  })

  it('expands every ancestor (loading unseen dirs) and selects the file', async () => {
    await useFilesStore.getState().revealPath('/p/src/a/b.ts', '/p')
    const s = useFilesStore.getState()
    expect([...s.expanded]).toEqual(['/p/src', '/p/src/a'])
    expect(s.selectedPath).toBe('/p/src/a/b.ts')
    expect(readDir.mock.calls.map((c) => c[0])).toEqual(['/p/src', '/p/src/a'])
  })

  it('does not reload already-expanded dirs', async () => {
    await useFilesStore.getState().expandDir('/p/src')
    readDir.mockClear()
    await useFilesStore.getState().revealPath('/p/src/c.ts', '/p')
    expect(readDir).not.toHaveBeenCalled()
    expect(useFilesStore.getState().selectedPath).toBe('/p/src/c.ts')
  })
})
