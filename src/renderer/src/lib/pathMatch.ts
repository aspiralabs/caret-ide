/** True when `path` is `dir` itself or lives anywhere beneath it. */
export function isSameOrUnder(path: string, dir: string): boolean {
  if (path === dir) return true
  const prefix = dir.endsWith('/') ? dir : dir + '/'
  return path.startsWith(prefix)
}

/**
 * Re-root `path` from `oldDir` to `newDir` when it is `oldDir` or beneath it;
 * returns the path unchanged otherwise. Used to follow a directory rename.
 */
export function rebasePath(path: string, oldDir: string, newDir: string): string {
  if (path === oldDir) return newDir
  const prefix = oldDir.endsWith('/') ? oldDir : oldDir + '/'
  if (!path.startsWith(prefix)) return path
  return (newDir.endsWith('/') ? newDir : newDir + '/') + path.slice(prefix.length)
}
