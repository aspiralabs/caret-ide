/** A runnable entry from package.json `scripts`. */
export interface PackageScript {
  name: string
  command: string
}

/** Parse package.json text into its scripts (empty on any problem). */
export function parseScripts(json: string): PackageScript[] {
  try {
    const pkg = JSON.parse(json) as { scripts?: unknown }
    const scripts = pkg?.scripts
    if (!scripts || typeof scripts !== 'object') return []
    return Object.entries(scripts as Record<string, unknown>)
      .filter((e): e is [string, string] => typeof e[1] === 'string')
      .map(([name, command]) => ({ name, command }))
  } catch {
    return []
  }
}

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun'

/** Pick the package manager from the lockfiles present at the project root. */
export function detectPackageManager(rootEntries: ReadonlyArray<string>): PackageManager {
  const has = (n: string): boolean => rootEntries.includes(n)
  if (has('bun.lockb') || has('bun.lock')) return 'bun'
  if (has('pnpm-lock.yaml')) return 'pnpm'
  if (has('yarn.lock')) return 'yarn'
  return 'npm'
}

/** The shell command that runs a script with the given package manager. */
export function runScriptCommand(pm: PackageManager, name: string): string {
  const safe = /^[A-Za-z0-9_:.-]+$/.test(name) ? name : `'${name.replace(/'/g, "'\\''")}'`
  switch (pm) {
    case 'yarn':
      return `yarn ${safe}`
    case 'pnpm':
      return `pnpm ${safe}`
    case 'bun':
      return `bun run ${safe}`
    default:
      return `npm run ${safe}`
  }
}
