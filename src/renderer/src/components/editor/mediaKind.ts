import { extname } from '../../lib/path'

export type MediaKind = 'image' | 'pdf'

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.avif', '.ico'])

/** Whether a path opens in a viewer tab instead of a text editor. */
export function mediaKindForPath(path: string): MediaKind | null {
  const ext = extname(path).toLowerCase()
  if (IMAGE_EXT.has(ext)) return 'image'
  if (ext === '.pdf') return 'pdf'
  return null
}

/** Human file size for the viewer's info strip. */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/** Approximate decoded byte length of a base64 data URL's payload. */
export function dataUrlBytes(dataUrl: string): number {
  const i = dataUrl.indexOf(',')
  if (i === -1) return 0
  const b64 = dataUrl.slice(i + 1)
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
  return Math.floor((b64.length * 3) / 4) - padding
}
