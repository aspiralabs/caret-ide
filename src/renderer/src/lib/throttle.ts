/**
 * Trailing debounce with a maximum wait: bursts coalesce (each call restarts
 * the `wait` timer) but the callback is guaranteed to run at least every
 * `maxWait` ms while calls keep arriving — so Claude writing files
 * continuously still refreshes ~once a second instead of never.
 */
export function debounceWithMax(fn: () => void, wait: number, maxWait: number): { call: () => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null
  let firstCall: number | null = null
  const fire = (): void => {
    if (timer) clearTimeout(timer)
    timer = null
    firstCall = null
    fn()
  }
  return {
    call: () => {
      const now = Date.now()
      if (firstCall === null) firstCall = now
      if (timer) clearTimeout(timer)
      const remainingMax = maxWait - (now - firstCall)
      timer = setTimeout(fire, Math.max(0, Math.min(wait, remainingMax)))
    },
    cancel: () => {
      if (timer) clearTimeout(timer)
      timer = null
      firstCall = null
    }
  }
}
