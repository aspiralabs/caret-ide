// Pure naming helpers for copy / duplicate / import (no fs imports).

/** Split `report.final.pdf` → { stem: 'report.final', ext: '.pdf' }; dotfiles keep no ext. */
export function splitExt(name: string): { stem: string; ext: string } {
  const i = name.lastIndexOf('.')
  if (i <= 0) return { stem: name, ext: '' }
  return { stem: name.slice(0, i), ext: name.slice(i) }
}

/**
 * First name in `name`, `name 2`, `name 3`, … (before the extension) that
 * isn't taken. `taken` is checked case-insensitively so macOS's
 * case-insensitive default filesystem can't produce a collision.
 */
export function uniqueName(name: string, taken: ReadonlyArray<string>): string {
  const lower = new Set(taken.map((t) => t.toLowerCase()))
  if (!lower.has(name.toLowerCase())) return name
  const { stem, ext } = splitExt(name)
  for (let n = 2; n < 10000; n++) {
    const candidate = `${stem} ${n}${ext}`
    if (!lower.has(candidate.toLowerCase())) return candidate
  }
  return `${stem} ${Date.now()}${ext}`
}

/** `name copy.ext`, then `name copy 2.ext`, … — Finder's duplicate naming. */
export function duplicateName(name: string, taken: ReadonlyArray<string>): string {
  const { stem, ext } = splitExt(name)
  const lower = new Set(taken.map((t) => t.toLowerCase()))
  const first = `${stem} copy${ext}`
  if (!lower.has(first.toLowerCase())) return first
  for (let n = 2; n < 10000; n++) {
    const candidate = `${stem} copy ${n}${ext}`
    if (!lower.has(candidate.toLowerCase())) return candidate
  }
  return `${stem} copy ${Date.now()}${ext}`
}
