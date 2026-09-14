import { useTabsStore } from '../stores/tabs'
import { useLayoutStore } from '../stores/layout'

/** Hosts that mean "my dev server" — open these in the in-app preview. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]', '::1'])

/** True for a URL pointing at a local dev server. */
export function isLocalUrl(url: string): boolean {
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase()
    return LOCAL_HOSTS.has(host) || host.endsWith('.localhost') || host.endsWith('.local')
  } catch {
    return false
  }
}

/** Origin (scheme + host + port) of a URL, or null when unparsable. */
function originOf(url: string): string | null {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

/**
 * Which browser tab a terminal link should land in: an existing tab on the
 * same origin (so clicking `http://localhost:5173` twice doesn't stack tabs),
 * else null (open a new one). Pure for testing.
 */
export function browserTabForUrl(
  tabs: ReadonlyArray<{ id: string; kind: string; url?: string }>,
  url: string
): string | null {
  const origin = originOf(url)
  if (!origin) return null
  const hit = tabs.find((t) => t.kind === 'browser' && t.url && originOf(t.url) === origin)
  return hit?.id ?? null
}

/** Where a terminal link goes when activated. */
export function linkTarget(url: string): 'preview' | 'external' {
  return isLocalUrl(url) ? 'preview' : 'external'
}

/**
 * Open a URL clicked in the terminal: local dev servers open (or focus) an
 * in-app browser tab; anything else goes to the OS browser via window.open,
 * which main's window-open handler routes to shell.openExternal.
 */
export function openTerminalLink(url: string): void {
  if (linkTarget(url) === 'external') {
    window.open(url)
    return
  }
  const tabs = useTabsStore.getState()
  const existing = browserTabForUrl(tabs.tabs, url)
  if (existing) {
    tabs.setActive(existing)
    const tab = tabs.getById(existing)
    if (tab?.url !== url) void window.ide.browser.navigate(existing, url)
  } else {
    tabs.newBrowserTab(url)
  }
  const layout = useLayoutStore.getState()
  if (!layout.centerVisible) layout.togglePanel('center')
}
