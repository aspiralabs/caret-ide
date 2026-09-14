// Pure title-resolution helpers for the Claude Code session watcher (no fs or
// electron imports — see session.ts for the watcher itself).

import { parseJsonlRecords, titleFromRecords } from './sessionStatus'

export interface IndexEntry {
  sessionId: string
  summary: string
  file?: string
  mtimeMs: number
}

/** Parse `sessions-index.json`; tolerant of any malformed shape (→ []). */
export function parseSessionsIndex(raw: string): IndexEntry[] {
  try {
    const parsed = JSON.parse(raw) as {
      entries?: Array<{ sessionId?: unknown; summary?: unknown; fullPath?: unknown; fileMtime?: unknown }>
    }
    if (!parsed || !Array.isArray(parsed.entries)) return []
    const out: IndexEntry[] = []
    for (const e of parsed.entries) {
      if (typeof e?.sessionId !== 'string' || typeof e.summary !== 'string' || !e.summary) continue
      out.push({
        sessionId: e.sessionId,
        summary: e.summary,
        file: typeof e.fullPath === 'string' ? e.fullPath : undefined,
        mtimeMs: typeof e.fileMtime === 'number' ? e.fileMtime : 0
      })
    }
    return out
  } catch {
    return []
  }
}

/** The index's summary for ONE session, or null if it has none yet. */
export function titleForSession(entries: IndexEntry[], sessionId: string): string | null {
  const e = entries.find((x) => x.sessionId === sessionId)
  return e?.summary ?? null
}

/**
 * Title from a session's own .jsonl: an explicit summary/title line, else the
 * first user prompt (clipped), else null.
 */
export function titleFromJsonlText(raw: string): string | null {
  let firstPrompt: string | null = null
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    let obj: Record<string, unknown>
    try {
      obj = JSON.parse(trimmed)
    } catch {
      continue
    }
    const summary =
      (obj.type === 'summary' && typeof obj.summary === 'string' && obj.summary) ||
      (typeof obj.title === 'string' && obj.title) ||
      (typeof obj.name === 'string' && obj.name) ||
      (typeof obj.summary === 'string' && obj.summary)
    if (summary) return summary
    if (firstPrompt === null && obj.type === 'user') {
      const msg = obj.message as { content?: unknown } | undefined
      if (typeof msg?.content === 'string') firstPrompt = msg.content
    }
  }
  if (firstPrompt) {
    const clipped = firstPrompt.replace(/\s+/g, ' ').trim().slice(0, 80)
    if (clipped) return clipped
  }
  return null
}

/**
 * Resolve the title to show for the CURRENT session — the most recently
 * modified .jsonl — using only that session's own data: its index summary,
 * else its own .jsonl. Never falls back to another session's title, so a
 * brand-new session (empty .jsonl, no summary yet) yields null and the tab
 * keeps its default label instead of inheriting the previous session's name.
 */
export function resolveSessionTitle(
  entries: IndexEntry[],
  newest: { sessionId: string; jsonlText: string } | null
): string | null {
  if (!newest) return null
  return (
    titleFromRecords(parseJsonlRecords(newest.jsonlText)) ??
    titleForSession(entries, newest.sessionId) ??
    titleFromJsonlText(newest.jsonlText)
  )
}
