// Pure helpers for batched foreground-process detection (see pty.ts).

/** Login-shell basenames we do NOT want to report as the "foreground" process. */
export const SHELL_NAMES = new Set(['zsh', '-zsh', 'bash', '-bash', 'sh', '-sh', 'login'])

/**
 * Parse `ps -o pid=,<col>= -p …` output: one `<pid> <value>` per line. The
 * value may contain spaces (a command path), so only the first token splits.
 */
export function parsePsPairs(out: string): Map<number, string> {
  const map = new Map<number, string>()
  for (const line of out.split('\n')) {
    const t = line.trim()
    if (!t) continue
    const sp = t.search(/\s/)
    const pid = parseInt(sp === -1 ? t : t.slice(0, sp), 10)
    if (!Number.isFinite(pid)) continue
    map.set(pid, sp === -1 ? '' : t.slice(sp).trim())
  }
  return map
}

/**
 * Given each shell pid's tty foreground group (`tpgid`), the pids whose
 * command we still need to look up: a foreground group distinct from the
 * shell itself. When the shell is in front, nothing is running.
 */
export function foregroundPidsFor(shellPids: number[], tpgidByPid: Map<number, string>): number[] {
  const out = new Set<number>()
  for (const shellPid of shellPids) {
    const tpgid = parseInt(tpgidByPid.get(shellPid) ?? '', 10)
    if (!Number.isFinite(tpgid) || tpgid <= 0 || tpgid === shellPid) continue
    out.add(tpgid)
  }
  return [...out]
}

/** Parse `lsof -a -p <pid> -d cwd -Fn` output (`p<pid>`, `fcwd`, `n<path>` lines) → cwd. */
export function parseLsofCwd(out: string): string | null {
  for (const line of out.split('\n')) {
    if (line.startsWith('n')) return line.slice(1)
  }
  return null
}

/** Command basename for a foreground pid, or null when it's just a shell / unknown. */
export function foregroundName(
  shellPid: number,
  tpgidByPid: Map<number, string>,
  commByPid: Map<number, string>
): string | null {
  const tpgid = parseInt(tpgidByPid.get(shellPid) ?? '', 10)
  if (!Number.isFinite(tpgid) || tpgid <= 0 || tpgid === shellPid) return null
  const comm = commByPid.get(tpgid)
  if (!comm) return null
  const name = comm.slice(comm.lastIndexOf('/') + 1)
  return name && !SHELL_NAMES.has(name) ? name : null
}
