import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { debounceWithMax } from './throttle'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('debounceWithMax (#56)', () => {
  it('coalesces a burst into one trailing call', () => {
    const fn = vi.fn()
    const d = debounceWithMax(fn, 400, 1000)
    d.call()
    vi.advanceTimersByTime(300)
    d.call()
    vi.advanceTimersByTime(300)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('still fires at least every maxWait during a continuous stream', () => {
    const fn = vi.fn()
    const d = debounceWithMax(fn, 400, 1000)
    for (let t = 0; t < 3000; t += 100) {
      d.call()
      vi.advanceTimersByTime(100)
    }
    expect(fn.mock.calls.length).toBeGreaterThanOrEqual(3)
    expect(fn.mock.calls.length).toBeLessThanOrEqual(4)
  })

  it('cancel drops the pending call', () => {
    const fn = vi.fn()
    const d = debounceWithMax(fn, 400, 1000)
    d.call()
    d.cancel()
    vi.advanceTimersByTime(2000)
    expect(fn).not.toHaveBeenCalled()
  })
})
