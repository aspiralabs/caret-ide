import { resolve, sep } from 'path'

/**
 * Path-traversal guard (spec §3): every fs path from the renderer must resolve
 * to a location inside the project root. Returns the resolved absolute path or
 * throws. The root itself is allowed.
 */
export function assertInsideRoot(root: string, target: string): string {
  const normRoot = resolve(root)
  const resolved = resolve(target)
  if (resolved !== normRoot && !resolved.startsWith(normRoot + sep)) {
    throw new Error(`Path escapes project root: ${target}`)
  }
  return resolved
}
