/** Shell command that resumes a Claude Code session by id. */
export function resumeCommand(sessionId: string): string {
  // Session ids are UUIDs; quote defensively anyway.
  const safe = /^[A-Za-z0-9_-]+$/.test(sessionId) ? sessionId : `'${sessionId.replace(/'/g, "'\\''")}'`
  return `claude --resume ${safe}`
}

/** Shell command that starts a fresh Claude Code session. */
export const NEW_SESSION_COMMAND = 'claude'

/** Human "3m ago" / "2h ago" / "5d ago" for the Resume menu. */
export function relativeAge(modifiedMs: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - modifiedMs) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}
