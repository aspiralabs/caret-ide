import { dirname, join } from './path'

export type LinkTarget = { kind: 'external'; url: string } | { kind: 'file'; path: string; anchor?: string } | { kind: 'none' }

/** Collapse `a/./b/../c` segments in an absolute path. */
function normalize(p: string): string {
  const out: string[] = []
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') out.pop()
    else out.push(seg)
  }
  return '/' + out.join('/')
}

/**
 * Where a markdown link goes: http(s)/mailto → external; `#anchor` alone →
 * nothing; otherwise a file path resolved against the markdown file's
 * directory (root-relative `/docs/x.md` against the project root).
 */
export function resolveMarkdownLink(href: string, filePath: string, projectRoot: string): LinkTarget {
  const h = href.trim()
  if (!h) return { kind: 'none' }
  if (/^(https?:|mailto:)/i.test(h)) return { kind: 'external', url: h }
  if (h.startsWith('#')) return { kind: 'none' }
  const [rawPath, anchor] = h.split('#')
  const decoded = decodeURIComponent(rawPath)
  const base = decoded.startsWith('/') ? join(projectRoot, decoded) : join(dirname(filePath), decoded)
  return { kind: 'file', path: normalize(base), anchor: anchor || undefined }
}
