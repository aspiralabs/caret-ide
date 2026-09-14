import { realpathSync } from 'fs'
import { dirname, resolve, sep } from 'path'

/**
 * Resolve symlinks in `p`. When the path (or part of it) doesn't exist yet —
 * e.g. a file about to be created — resolve the deepest existing ancestor and
 * re-append the missing tail, so `root/link-to-outside/new.txt` still maps to
 * its real location.
 */
export function realPathLenient(p: string): string {
  const abs = resolve(p)
  let missing: string[] = []
  let cur = abs
  for (;;) {
    try {
      const real = realpathSync.native(cur)
      return missing.length ? resolve(real, ...missing) : real
    } catch {
      const parent = dirname(cur)
      if (parent === cur) return abs // hit the fs root without finding anything real
      missing = [cur.slice(parent.length + 1), ...missing]
      cur = parent
    }
  }
}

/**
 * Path-traversal guard (spec §3): every fs path from the renderer must resolve
 * to a location inside the project root. Returns the resolved absolute path or
 * throws. The root itself is allowed.
 *
 * Both sides are symlink-resolved, so a link inside the project that points
 * outside it (`ln -s ~/.ssh secrets`) is rejected rather than read/written
 * through — a purely lexical `path.resolve` comparison would let it through.
 */
export function assertInsideRoot(root: string, target: string): string {
  const normRoot = realPathLenient(root)
  const resolved = realPathLenient(target)
  if (resolved !== normRoot && !resolved.startsWith(normRoot + sep)) {
    throw new Error(`Path escapes project root: ${target}`)
  }
  return resolved
}
