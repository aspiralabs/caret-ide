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

describe('multi-select (#30)', () => {
  beforeEach(() => useFilesStore.setState({ selectedPath: null, selectedPaths: new Set(), expanded: new Set(['/p/src']) }))
  const order = ['/p/src', '/p/src/a.ts', '/p/src/b.ts', '/p/c.ts']

  it('plain click selects one, ⌘ toggles, ⇧ ranges from the anchor', () => {
    const s = useFilesStore.getState()
    s.select('/p/src/a.ts', {})
    expect([...useFilesStore.getState().selectedPaths]).toEqual(['/p/src/a.ts'])
    s.select('/p/c.ts', { toggle: true })
    expect([...useFilesStore.getState().selectedPaths]).toEqual(['/p/src/a.ts', '/p/c.ts'])
    expect(useFilesStore.getState().selectedPath).toBe('/p/c.ts')
    s.select('/p/c.ts', { toggle: true }) // remove
    expect([...useFilesStore.getState().selectedPaths]).toEqual(['/p/src/a.ts'])
    s.select('/p/src/a.ts', { toggle: true }) // can't deselect the last one
    expect(useFilesStore.getState().selectedPaths.size).toBe(1)
    s.select('/p/c.ts', { range: true, order })
    expect([...useFilesStore.getState().selectedPaths]).toEqual(['/p/src/a.ts', '/p/src/b.ts', '/p/c.ts'])
  })

  it('setSelected resets to a single selection; collapseAll clears expansion', () => {
    useFilesStore.getState().select('/p/c.ts', { toggle: true })
    useFilesStore.getState().setSelected('/p/src/b.ts')
    expect([...useFilesStore.getState().selectedPaths]).toEqual(['/p/src/b.ts'])
    useFilesStore.getState().collapseAll()
    expect(useFilesStore.getState().expanded.size).toBe(0)
  })
})
