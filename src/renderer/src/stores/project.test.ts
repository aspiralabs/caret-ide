// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { containingRoot, isInsideRoot, useProjectStore } from './project'

describe('multi-root project store (#47)', () => {
  const addRoot = vi.fn(async () => '/other')
  const setRoots = vi.fn(async (roots: string[]) => roots.filter((r) => r !== '/gone'))
  beforeEach(() => {
    ;(window as unknown as { ide: unknown }).ide = { project: { addRoot, setRoots } }
    useProjectStore.setState({ info: { root: '/p', name: 'p', mode: 'project' }, mode: 'project', extraRoots: [] })
  })

  it('adds a picked folder once, removes it, and hydrates only what main validates', async () => {
    await useProjectStore.getState().addRoot()
    await useProjectStore.getState().addRoot()
    expect(useProjectStore.getState().extraRoots).toEqual(['/other'])
    await useProjectStore.getState().removeRoot('/other')
    expect(useProjectStore.getState().extraRoots).toEqual([])
    expect(setRoots).toHaveBeenLastCalledWith([])
    await useProjectStore.getState().hydrateRoots(['/a', '/gone'])
    expect(useProjectStore.getState().extraRoots).toEqual(['/a'])
  })
})

describe('terminal mode roots (spec §3.4)', () => {
  const setRoots = vi.fn(async (roots: string[]) => roots)
  beforeEach(() => {
    setRoots.mockClear()
    ;(window as unknown as { ide: unknown }).ide = { project: { setRoots } }
    useProjectStore.setState({ info: null, mode: 'project', extraRoots: [], workspaceRoot: null })
    useProjectStore.getState().setInfo({ root: '/Users/me', name: 'Terminal', mode: 'terminal' })
  })

  it('has no workspace root until a folder is adopted, then uses the first one', async () => {
    expect(useProjectStore.getState().mode).toBe('terminal')
    expect(useProjectStore.getState().workspaceRoot).toBeNull()
    expect(await useProjectStore.getState().adoptRoot('/Users/me/notes')).toBe('/Users/me/notes')
    expect(useProjectStore.getState().workspaceRoot).toBe('/Users/me/notes')
    expect(setRoots).toHaveBeenCalledWith(['/Users/me/notes'])
  })

  it('does not add a duplicate or a subfolder of an existing root (AC15)', async () => {
    await useProjectStore.getState().adoptRoot('/Users/me/notes')
    expect(await useProjectStore.getState().adoptRoot('/Users/me/notes')).toBe('/Users/me/notes')
    expect(await useProjectStore.getState().adoptRoot('/Users/me/notes/2026')).toBe('/Users/me/notes')
    expect(useProjectStore.getState().extraRoots).toEqual(['/Users/me/notes'])
    expect(setRoots).toHaveBeenCalledTimes(1)
  })

  it('treats the home root itself as nothing to adopt (main refuses it)', async () => {
    setRoots.mockImplementationOnce(async () => [])
    expect(await useProjectStore.getState().adoptRoot('/Users/me')).toBeNull()
    expect(useProjectStore.getState().extraRoots).toEqual([])
  })

  it('in a project window the project root already covers its subfolders', async () => {
    useProjectStore.getState().setInfo({ root: '/p', name: 'p', mode: 'project' })
    expect(useProjectStore.getState().workspaceRoot).toBe('/p')
    expect(await useProjectStore.getState().adoptRoot('/p/src')).toBe('/p')
    expect(setRoots).not.toHaveBeenCalled()
  })
})

describe('isInsideRoot / containingRoot', () => {
  it('matches the root itself and descendants, not sibling prefixes', () => {
    expect(isInsideRoot('/a/b', '/a/b')).toBe(true)
    expect(isInsideRoot('/a/b/c', '/a/b')).toBe(true)
    expect(isInsideRoot('/a/bc', '/a/b')).toBe(false)
    expect(containingRoot('/x/y/z', ['/q', '/x/y'])).toBe('/x/y')
    expect(containingRoot('/x', ['/x/y'])).toBeNull()
  })
})
