import { useEffect, useRef } from 'react'
import type { Rect } from '@shared/types'

// ---------------------------------------------------------------------------
// BrowserViewport — the in-DOM placeholder that the main-owned WebContentsView
// will float above. It has no visible content of its own; its only job is to
// occupy the correct rectangle and report that rectangle to main so the view
// gets positioned/sized to match.
//
// Bounds are reported on mount and re-synced on every relevant change (element
// resize via ResizeObserver, window resize), all coalesced into a single
// requestAnimationFrame so a burst of layout events produces at most one
// setBounds per frame (spec §5.3 requires rAF throttling; fractional bounds
// blur the view, so we round).
//
// Only ever mounted for the active + visible browser tab (CenterPanel mounts
// content for the active tab only, and BrowserManager show()s that view).
// ---------------------------------------------------------------------------

function readRect(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect()
  return {
    x: Math.round(r.left),
    y: Math.round(r.top),
    width: Math.round(r.width),
    height: Math.round(r.height)
  }
}

export default function BrowserViewport({ tabId }: { tabId: string }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    let rafId = 0

    // Coalesce multiple triggers (observer + resize) into one rAF-batched send.
    const scheduleSync = (): void => {
      if (rafId) return
      rafId = requestAnimationFrame(() => {
        rafId = 0
        window.ide.browser.setBounds(tabId, readRect(el))
      })
    }

    // Report immediately on mount so the view snaps into place without a frame
    // of the placeholder showing through.
    window.ide.browser.setBounds(tabId, readRect(el))

    const ro = new ResizeObserver(scheduleSync)
    ro.observe(el)
    window.addEventListener('resize', scheduleSync)

    return () => {
      if (rafId) cancelAnimationFrame(rafId)
      ro.disconnect()
      window.removeEventListener('resize', scheduleSync)
    }
  }, [tabId])

  // Neutral ink background so the placeholder doesn't flash white before the
  // Chromium view attaches on top of it.
  return <div ref={ref} className="h-full w-full bg-ink-bg" />
}
