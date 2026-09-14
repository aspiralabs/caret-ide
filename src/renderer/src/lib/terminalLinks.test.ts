// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { browserTabForUrl, isLocalUrl, linkTarget, openTerminalLink } from './terminalLinks'
import { useTabsStore } from '../stores/tabs'
import { useLayoutStore } from '../stores/layout'

describe('isLocalUrl / linkTarget', () => {
  it('recognises dev-server hosts', () => {
    for (const u of [
      'http://localhost:5173',
      'http://127.0.0.1:8080/app',
      'http://0.0.0.0:3000',
      'http://[::1]:3000/',
      'http://app.localhost:3000',
      'https://mybox.local'
    ]) {
      expect(isLocalUrl(u)).toBe(true)
      expect(linkTarget(u)).toBe('preview')
    }
  })
  it('sends everything else to the OS browser', () => {
    expect(linkTarget('https://github.com/x')).toBe('external')
    expect(linkTarget('not a url')).toBe('external')
    expect(isLocalUrl('http://localhost.evil.com')).toBe(false)
  })
})

describe('browserTabForUrl', () => {
  const tabs = [
    { id: 'e', kind: 'editor' },
    { id: 'b1', kind: 'browser', url: 'http://localhost:5173/about' },
    { id: 'b2', kind: 'browser', url: 'http://localhost:3000/' }
  ]
  it('matches on origin, ignoring path', () => {
    expect(browserTabForUrl(tabs, 'http://localhost:5173/')).toBe('b1')
    expect(browserTabForUrl(tabs, 'http://localhost:3000/x?y')).toBe('b2')
    expect(browserTabForUrl(tabs, 'http://localhost:4000/')).toBeNull()
    expect(browserTabForUrl(tabs, 'garbage')).toBeNull()
  })
})

describe('openTerminalLink (quick win #4)', () => {
  const navigate = vi.fn(async () => {})
  beforeEach(() => {
    ;(window as unknown as { ide: unknown }).ide = { browser: { navigate } }
    navigate.mockClear()
    window.open = vi.fn() as unknown as typeof window.open
    useTabsStore.setState({ tabs: [], activeId: null })
    useLayoutStore.setState({ centerVisible: false })
  })

  it('opens a new preview tab for a fresh local URL and reveals the center panel', () => {
    openTerminalLink('http://localhost:5173/')
    const tabs = useTabsStore.getState().tabs
    expect(tabs).toHaveLength(1)
    expect(tabs[0]).toMatchObject({ kind: 'browser', url: 'http://localhost:5173/' })
    expect(useLayoutStore.getState().centerVisible).toBe(true)
  })

  it('focuses an existing tab on the same origin and navigates it to the new path', () => {
    const id = useTabsStore.getState().newBrowserTab('http://localhost:5173/')
    useTabsStore.getState().openFile('/p/a.ts')
    openTerminalLink('http://localhost:5173/docs')
    expect(useTabsStore.getState().activeId).toBe(id)
    expect(navigate).toHaveBeenCalledWith(id, 'http://localhost:5173/docs')
    expect(useTabsStore.getState().tabs.filter((t) => t.kind === 'browser')).toHaveLength(1)
  })

  it('does not re-navigate when the URL is already loaded', () => {
    const id = useTabsStore.getState().newBrowserTab('http://localhost:5173/')
    openTerminalLink('http://localhost:5173/')
    expect(useTabsStore.getState().activeId).toBe(id)
    expect(navigate).not.toHaveBeenCalled()
  })

  it('hands external URLs to window.open (→ OS browser)', () => {
    openTerminalLink('https://example.com/')
    expect(window.open).toHaveBeenCalledWith('https://example.com/')
    expect(useTabsStore.getState().tabs).toHaveLength(0)
  })
})
