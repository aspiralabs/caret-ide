// Minimal POSIX-ish path helpers for the renderer (no Node 'path' in the sandbox).

export function basename(p: string): string {
  if (!p) return ''
  const trimmed = p.replace(/\/+$/, '')
  const i = trimmed.lastIndexOf('/')
  return i === -1 ? trimmed : trimmed.slice(i + 1)
}

export function dirname(p: string): string {
  const trimmed = p.replace(/\/+$/, '')
  const i = trimmed.lastIndexOf('/')
  return i <= 0 ? '/' : trimmed.slice(0, i)
}

export function extname(p: string): string {
  const base = basename(p)
  const i = base.lastIndexOf('.')
  return i <= 0 ? '' : base.slice(i)
}

export function join(...parts: string[]): string {
  return parts
    .filter(Boolean)
    .join('/')
    .replace(/\/{2,}/g, '/')
}
