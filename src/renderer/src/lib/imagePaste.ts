import { dirname, join } from './path'

/** Deterministic-ish asset name for a pasted image: `pasted-2026-09-14-041530.png`. */
export function pastedImageName(now: Date, ext = 'png'): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`
  return `pasted-${stamp}.${ext}`
}

/** Where a pasted image is written (an `assets/` folder beside the markdown file) and how to reference it. */
export function pastedImageTarget(filePath: string, name: string): { absPath: string; markdown: string } {
  const dir = join(dirname(filePath), 'assets')
  return { absPath: join(dir, name), markdown: `![${name}](assets/${name})` }
}

/** Extension for a clipboard image MIME type. */
export function extForMime(mime: string): string {
  const m = /^image\/(png|jpe?g|gif|webp|svg\+xml|bmp)$/.exec(mime)
  if (!m) return 'png'
  return m[1] === 'jpeg' ? 'jpg' : m[1] === 'svg+xml' ? 'svg' : m[1]
}
