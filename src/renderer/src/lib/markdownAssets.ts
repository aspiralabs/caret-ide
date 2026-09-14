import { dirname, join } from './path'

/**
 * Candidate absolute paths for an image `src` in a markdown file, in the order
 * to try them. Remote/data URLs return an empty list (use `src` verbatim).
 *
 * A root-relative `src` (`/images/x.png`) is what web-oriented docs use, meaning
 * "relative to the site root" — so try the project root, then `public/` (the
 * usual static dir), rather than the filesystem root (which the fs IPC would
 * reject as escaping the project).
 */
export function assetCandidates(src: string, filePath: string, projectRoot: string): string[] {
  if (/^(https?:|data:)/i.test(src)) return []
  if (src.startsWith('/')) {
    const rel = src.replace(/^\/+/, '')
    if (!projectRoot) return []
    return [join(projectRoot, rel), join(projectRoot, 'public', rel)]
  }
  return [join(dirname(filePath), src)]
}

/**
 * Resolve an image `src` to something an <img> can load: remote/data URLs
 * pass through; project paths go through `read` (the data-URL IPC), trying
 * each candidate in turn. Never rejects — a missing or out-of-root image
 * resolves to null instead of surfacing as an unhandled rejection.
 */
export async function resolveMarkdownAsset(
  src: string,
  filePath: string,
  projectRoot: string,
  read: (absPath: string) => Promise<string | null>
): Promise<string | null> {
  if (/^(https?:|data:)/i.test(src)) return src
  for (const candidate of assetCandidates(src, filePath, projectRoot)) {
    try {
      const url = await read(candidate)
      if (url) return url
    } catch {
      // Escapes root / unreadable — try the next candidate.
    }
  }
  return null
}
