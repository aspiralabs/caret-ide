// Pure helpers for the project/welcome windows' navigation policy. Kept free of
// electron imports so they're unit-testable.

/** Strip the fragment: `#welcome` etc. is routing inside the same document. */
function withoutHash(url: string): string {
  const i = url.indexOf('#')
  return i === -1 ? url : url.slice(0, i)
}

/**
 * Should a top-level navigation away from `currentUrl` to `targetUrl` be
 * blocked? The renderer is a single-page app: the only legitimate top-level
 * navigations are reloads of the same document (ErrorBoundary "Reload", View →
 * Force Reload). Anything else — most commonly Chromium's default handling of
 * a file dropped on the DOM, which navigates to `file:///…/dropped.txt` — would
 * replace the IDE UI and must be refused.
 */
export function shouldBlockNavigation(currentUrl: string, targetUrl: string): boolean {
  return withoutHash(currentUrl) !== withoutHash(targetUrl)
}

/**
 * Permission policy for pages loaded in the browser PREVIEW (its own session
 * partition, not the app renderer's). Deny by default: an arbitrary site
 * shouldn't get camera/mic/geolocation/notifications with no prompt. Only
 * permissions with no privacy surface are granted.
 */
export function previewPermissionAllowed(permission: string): boolean {
  return permission === 'fullscreen' || permission === 'pointerLock'
}

/** Session partition previews load in — isolated from the app renderer's cookies + permissions. */
export const PREVIEW_PARTITION = 'persist:preview'
