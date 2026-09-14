// Formatting of file references for Claude Code prompts and for "copy path"
// menu items. Claude Code resolves `@path` mentions relative to its cwd (the
// project root), so the relative form pastes straight into a prompt.

/** `path` relative to `root` (no leading slash); the path itself if outside. */
export function relativePath(path: string, root: string): string {
  if (!root) return path
  const prefix = root.endsWith('/') ? root : root + '/'
  if (path === root) return '.'
  return path.startsWith(prefix) ? path.slice(prefix.length) : path
}

/** `@src/App.tsx` — a Claude Code file mention. */
export function fileReference(path: string, root: string): string {
  return '@' + relativePath(path, root)
}

/**
 * `@src/App.tsx#L10-L20` (or `#L10` for a single line) — a file mention with a
 * line range, for "send selection to Claude".
 */
export function lineReference(path: string, root: string, startLine: number, endLine: number): string {
  const lo = Math.min(startLine, endLine)
  const hi = Math.max(startLine, endLine)
  return `${fileReference(path, root)}#L${lo}${hi !== lo ? `-L${hi}` : ''}`
}

/** Fence a snippet for a prompt, picking a fence longer than any inside it. */
export function fencedSnippet(text: string, lang = ''): string {
  const longest = Math.max(2, ...Array.from(text.matchAll(/`{3,}/g), (m) => m[0].length))
  const fence = '`'.repeat(longest + 1)
  return `${fence}${lang}\n${text.replace(/\n$/, '')}\n${fence}`
}
