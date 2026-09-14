import type { ConsoleEntry } from '@shared/types'
import { asBracketedPaste } from '../components/browser/formatReference'

/** Keep at most this many recent console messages per browser tab. */
export const MAX_CONSOLE_ERRORS = 200

/** Number of error-level entries (the chrome badge). */
export function errorCount(list: ReadonlyArray<ConsoleEntry> | undefined): number {
  return list ? list.filter((e) => e.level === 'error').length : 0
}

/** The most recent error-level entry, if any. */
export function lastError(list: ReadonlyArray<ConsoleEntry> | undefined): ConsoleEntry | undefined {
  if (!list) return undefined
  for (let i = list.length - 1; i >= 0; i--) if (list[i].level === 'error') return list[i]
  return undefined
}

/** Append an entry (capped) or clear the list when `entry` is null. */
export function pushConsoleEntry(
  list: ReadonlyArray<ConsoleEntry> | undefined,
  entry: ConsoleEntry | null
): ConsoleEntry[] {
  if (!entry) return []
  const next = [...(list ?? []), entry]
  return next.length > MAX_CONSOLE_ERRORS ? next.slice(next.length - MAX_CONSOLE_ERRORS) : next
}

/** Shorten a script URL to something readable (`/src/App.tsx` from a long dev URL). */
function shortSource(src: string): string {
  try {
    const u = new URL(src)
    return u.pathname + (u.search ? u.search : '')
  } catch {
    return src
  }
}

/** The prompt body for one console error (multi-line; sent as a bracketed paste). */
export function formatConsoleError(e: ConsoleEntry): string {
  const lines = ['Browser console error:', `- Message: ${e.message.trim()}`]
  if (e.source) lines.push(`- Source: ${shortSource(e.source)}${e.line ? `:${e.line}` : ''}`)
  lines.push(`- Page: ${e.url}`)
  return lines.join('\n')
}

/** Visible marker + paste payload for "send last error to Claude". */
export function consoleErrorPayload(e: ConsoleEntry): { marker: string; body: string } {
  const first = e.message.trim().split('\n')[0]
  const short = first.length > 60 ? first.slice(0, 57) + '…' : first
  return { marker: `[console error: ${short}]`, body: formatConsoleError(e) }
}

export { asBracketedPaste }
