import { beforeEach, describe, expect, it } from 'vitest'
import { useOverlayStore } from './overlay'

beforeEach(() => useOverlayStore.setState({ count: 0 }))

describe('useOverlayStore (bug #4)', () => {
  it('counts nested overlays and releases each exactly once', () => {
    const a = useOverlayStore.getState().acquire()
    const b = useOverlayStore.getState().acquire()
    expect(useOverlayStore.getState().count).toBe(2)
    a()
    a() // double release is harmless
    expect(useOverlayStore.getState().count).toBe(1)
    b()
    expect(useOverlayStore.getState().count).toBe(0)
  })

  it('never goes negative', () => {
    useOverlayStore.setState({ count: 0 })
    const r = useOverlayStore.getState().acquire()
    useOverlayStore.setState({ count: 0 })
    r()
    expect(useOverlayStore.getState().count).toBe(0)
  })
})
