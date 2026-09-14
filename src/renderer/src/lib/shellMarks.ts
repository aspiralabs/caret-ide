// Per-terminal command boundaries parsed from OSC 133 / 633 (see
// main/ipc/shellIntegration.ts). Keyed by terminal tab id; the xterm marker
// objects track scroll so navigation stays correct as output grows.

export interface ShellState {
  /** Prompt-start markers (xterm IMarker-like: `line`, disposed when scrolled out). */
  marks: Array<{ line: number; isDisposed: boolean }>
  /** Commands run in this terminal, oldest first (deduped consecutive repeats). */
  commands: string[]
  lastExitCode: number | null
}

const states = new Map<string, ShellState>()

export function shellState(id: string): ShellState {
  let s = states.get(id)
  if (!s) {
    s = { marks: [], commands: [], lastExitCode: null }
    states.set(id, s)
  }
  return s
}

export function forgetShellState(id: string): void {
  states.delete(id)
}

/** Parsed OSC payloads: `133;A` → prompt, `133;C` → executing, `133;D;n` → done, `633;E;<b64>` → command line. */
export type OscEvent =
  | { kind: 'prompt' }
  | { kind: 'executing' }
  | { kind: 'done'; exitCode: number | null }
  | { kind: 'command'; command: string }
  | null

export function parseOsc(identifier: 133 | 633, data: string): OscEvent {
  const [tag, ...rest] = data.split(';')
  if (identifier === 133) {
    if (tag === 'A') return { kind: 'prompt' }
    if (tag === 'C') return { kind: 'executing' }
    if (tag === 'D') {
      const n = rest.length ? Number(rest[0]) : NaN
      return { kind: 'done', exitCode: Number.isFinite(n) ? n : null }
    }
    return null
  }
  if (tag === 'E') {
    try {
      const command = decodeBase64(rest.join(';'))
      return { kind: 'command', command }
    } catch {
      return null
    }
  }
  return null
}

function decodeBase64(b64: string): string {
  const bin = atob(b64.trim())
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/** Record a command line (skipping blanks and immediate repeats). */
export function recordCommand(s: ShellState, command: string): void {
  const c = command.trim()
  if (!c) return
  if (s.commands[s.commands.length - 1] === c) return
  s.commands.push(c)
  if (s.commands.length > 500) s.commands.shift()
}

/**
 * The marker line to scroll to when stepping `dir` from the current viewport
 * top: the nearest prompt strictly above (−1) or below (+1). Null when none.
 */
export function adjacentMark(marks: ReadonlyArray<{ line: number; isDisposed: boolean }>, viewportTop: number, dir: 1 | -1): number | null {
  const lines = marks.filter((m) => !m.isDisposed).map((m) => m.line).sort((a, b) => a - b)
  if (dir === -1) {
    const above = lines.filter((l) => l < viewportTop)
    return above.length ? above[above.length - 1] : null
  }
  const below = lines.filter((l) => l > viewportTop)
  return below.length ? below[0] : null
}
