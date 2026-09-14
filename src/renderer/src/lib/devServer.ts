// Detects "your dev server is at http://localhost:5173" lines in terminal
// output so the app can offer to open them in the preview.

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]/g

const LOCAL_URL_RE =
  /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|[a-z0-9-]+\.localhost)(?::\d{2,5})?(?:\/[^\s'"<>)\]]*)?/gi

/** Strip ANSI escapes and return the distinct local dev-server URLs in a chunk. */
export function detectDevServerUrls(chunk: string): string[] {
  const clean = chunk.replace(ANSI_RE, '')
  const out = new Set<string>()
  for (const m of clean.matchAll(LOCAL_URL_RE)) {
    // Trailing punctuation from prose ("…at http://localhost:3000.") isn't part of the URL.
    let url = m[0].replace(/[.,;:!?]+$/, '')
    // 0.0.0.0 is a bind address, not something to browse to.
    url = url.replace('://0.0.0.0', '://localhost')
    out.add(url)
  }
  return [...out]
}

/**
 * Per-terminal memory of which URLs we've already offered, so a dev server
 * that reprints its banner on every HMR reload only prompts once.
 */
export class DevServerOffers {
  private seen = new Set<string>()
  /** URLs in this chunk not offered before (and now remembered). */
  fresh(chunk: string): string[] {
    const urls = detectDevServerUrls(chunk).filter((u) => !this.seen.has(u))
    for (const u of urls) this.seen.add(u)
    return urls
  }
}
