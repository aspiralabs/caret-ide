// ---------------------------------------------------------------------------
// URL normalization for the browser URL bar.
// Given raw user input, return a URL the WebContentsView can actually load.
// Rules (spec §5.3):
//   - Already has a scheme (http://, https://, file://, about:, etc.) → keep it.
//   - Bare host / localhost:port / IP:port / domain.tld → prepend http://
//   - Anything else that isn't obviously a host → treat as an http:// URL too,
//     so the view at least attempts a load rather than silently doing nothing.
// ---------------------------------------------------------------------------

/** Matches a leading URI scheme like `http:`, `https:`, `file:`, `about:`, `chrome:`. */
const SCHEME_RE = /^([a-z][a-z0-9+.-]*):/i

/**
 * Schemes that are loadable without a `//` authority. Anything else that looks
 * like `word:` (e.g. `localhost:3000`) is a host:port, not a scheme — without
 * this allowlist Chromium would get `localhost:3000` verbatim and fail with
 * ERR_UNKNOWN_URL_SCHEME.
 */
const KNOWN_SCHEMES = new Set([
  'http',
  'https',
  'file',
  'about',
  'chrome',
  'devtools',
  'data',
  'blob',
  'javascript',
  'mailto',
  'view-source'
])

/** True when the input starts with something we should treat as a real URI scheme. */
export function hasScheme(raw: string): boolean {
  const m = SCHEME_RE.exec(raw)
  if (!m) return false
  const scheme = m[1].toLowerCase()
  if (KNOWN_SCHEMES.has(scheme)) return true
  // Unknown scheme: only honour it when it carries an authority (`foo://bar`),
  // which a bare host:port never does.
  return raw.slice(m[0].length).startsWith('//')
}

/** Derive a `hostname:port` label from a URL, used as the tab-title fallback. */
export function hostLabel(url: string | undefined): string {
  if (!url) return 'New Tab'
  try {
    const u = new URL(url)
    // Include the port only when one is explicitly present.
    return u.port ? `${u.hostname}:${u.port}` : u.hostname || url
  } catch {
    return url
  }
}

/** Normalize raw URL-bar input into a loadable absolute URL. */
export function normalizeUrl(input: string): string {
  const raw = input.trim()
  if (!raw) return raw

  // Keep any input that already carries a scheme (http/https/file/about/…).
  if (hasScheme(raw)) return raw

  // Protocol-relative URLs → assume http.
  if (raw.startsWith('//')) return `http:${raw}`

  // Everything else (bare host, localhost:3000, 127.0.0.1:8080, example.com/path)
  // gets an http:// prefix. We deliberately default to http (not https) because
  // the primary use case is local dev servers.
  return `http://${raw}`
}
