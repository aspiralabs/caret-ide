// Pure classification of a Claude Code session's live state from the tail of
// its .jsonl transcript (no fs / electron imports).

import type { ClaudeStatus } from '../../shared/types'

/** Parse the JSON records in a chunk of .jsonl text, skipping a torn first line. */
export function parseJsonlRecords(text: string): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = []
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t) continue
    try {
      const o = JSON.parse(t)
      if (o && typeof o === 'object') out.push(o as Record<string, unknown>)
    } catch {
      /* partial line at a chunk boundary or mid-write */
    }
  }
  return out
}

function contentTypes(rec: Record<string, unknown>): string[] {
  const msg = rec.message as { content?: unknown } | undefined
  const c = msg?.content
  if (typeof c === 'string') return ['text']
  if (!Array.isArray(c)) return []
  return c.map((b) => (b && typeof b === 'object' ? String((b as { type?: unknown }).type) : ''))
}

/**
 * What Claude is doing right now, judged from the LAST conversational record:
 *  - assistant turn that called a tool (or is still streaming thinking) → working
 *  - assistant turn that ended (`end_turn`, plain text)                   → waiting for input
 *  - user record carrying a tool result                                    → working (the loop continues)
 *  - user record with a prompt                                             → thinking
 * Metadata records (titles, attachments, snapshots) are ignored; null when
 * there is no conversational record yet.
 */
export function classifyStatus(records: ReadonlyArray<Record<string, unknown>>): ClaudeStatus | null {
  for (let i = records.length - 1; i >= 0; i--) {
    const rec = records[i]
    const type = rec.type
    if (type !== 'assistant' && type !== 'user') continue
    const types = contentTypes(rec)
    if (type === 'user') {
      return types.includes('tool_result') ? 'working' : 'thinking'
    }
    const msg = rec.message as { stop_reason?: unknown } | undefined
    if (types.includes('tool_use') || msg?.stop_reason === 'tool_use') {
      // A record holding only the thinking block is the model still reasoning
      // before its tool call lands.
      return types.every((t) => t === 'thinking') ? 'thinking' : 'working'
    }
    return 'waiting'
  }
  return null
}

/**
 * The session's own title from its transcript: the LATEST `custom-title`
 * (set by /rename), else the latest `ai-title`, else null. These beat the
 * sessions-index summary because they are written by the session itself.
 */
export function titleFromRecords(records: ReadonlyArray<Record<string, unknown>>): string | null {
  let ai: string | null = null
  for (let i = records.length - 1; i >= 0; i--) {
    const rec = records[i]
    if (rec.type === 'custom-title' && typeof rec.customTitle === 'string' && rec.customTitle) {
      return rec.customTitle
    }
    if (ai === null && rec.type === 'ai-title' && typeof rec.aiTitle === 'string' && rec.aiTitle) {
      ai = rec.aiTitle
    }
  }
  return ai
}
