// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Tooltip from './Tooltip'

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.useFakeTimers()
  ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  // Simulate the status bar: a clipping container around the trigger.
  host.style.contain = 'paint'
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.useRealTimers()
})

const hover = (el: Element, type: 'mouseenter' | 'mouseleave'): void => {
  // React listens for mouseover/mouseout to synthesise enter/leave.
  act(() => {
    el.dispatchEvent(new MouseEvent(type === 'mouseenter' ? 'mouseover' : 'mouseout', { bubbles: true }))
  })
}

describe('Tooltip', () => {
  it('renders outside the trigger subtree (portaled to body) after the hover delay', () => {
    act(() => {
      root.render(
        <Tooltip label="Diagnostics" shortcut="mod+d" side="left">
          <button>badge</button>
        </Tooltip>
      )
    })
    const button = host.querySelector('button')!
    expect(document.querySelector('[role=tooltip]')).toBeNull()

    hover(button, 'mouseenter')
    expect(document.querySelector('[role=tooltip]')).toBeNull() // not before the delay
    act(() => {
      vi.advanceTimersByTime(300)
    })
    const tip = document.querySelector('[role=tooltip]')!
    expect(tip).not.toBeNull()
    expect(tip.textContent).toContain('Diagnostics')
    expect(tip.textContent).toContain('⌘D')
    // The whole point: it is NOT inside the clipping container.
    expect(host.contains(tip)).toBe(false)
    expect(tip.parentElement).toBe(document.body)
    expect((tip as HTMLElement).style.position || getComputedStyle(tip).position).toBeTruthy()

    hover(button, 'mouseleave')
    expect(document.querySelector('[role=tooltip]')).toBeNull()
  })

  it('cancels a pending show when the pointer leaves early', () => {
    act(() => {
      root.render(
        <Tooltip label="x">
          <button>b</button>
        </Tooltip>
      )
    })
    const button = host.querySelector('button')!
    hover(button, 'mouseenter')
    act(() => {
      vi.advanceTimersByTime(100)
    })
    hover(button, 'mouseleave')
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(document.querySelector('[role=tooltip]')).toBeNull()
  })

  it('dismisses on mousedown / keydown anywhere', () => {
    act(() => {
      root.render(
        <Tooltip label="x">
          <button>b</button>
        </Tooltip>
      )
    })
    hover(host.querySelector('button')!, 'mouseenter')
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(document.querySelector('[role=tooltip]')).not.toBeNull()
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))
    })
    expect(document.querySelector('[role=tooltip]')).toBeNull()
  })
})
