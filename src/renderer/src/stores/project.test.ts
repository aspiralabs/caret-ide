// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useProjectStore } from './project'

describe('multi-root project store (#47)', () => {
  const addRoot = vi.fn(async () => '/other')
  const setRoots = vi.fn(async (roots: string[]) => roots.filter((r) => r !== '/gone'))
  beforeEach(() => {
    ;(window as unknown as { ide: unknown }).ide = { project: { addRoot, setRoots } }
    useProjectStore.setState({ info: { root: '/p', name: 'p' }, extraRoots: [] })
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
