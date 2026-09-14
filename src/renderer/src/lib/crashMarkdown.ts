import type { CrashReport } from '@shared/types'

export const ISSUES_URL = 'https://github.com/aspiralabs/caret-ide/issues/new'

/** A crash report as GitHub-flavoured Markdown, ready to paste into an issue. */
export function crashReportMarkdown(r: CrashReport): string {
  const lines = [
    `## ${r.message.split('\n')[0]}`,
    '',
    `- **Type:** ${r.type} (${r.source})`,
    `- **When:** ${r.timestamp}`,
    `- **App:** Caret ${r.app.version} · Electron ${r.app.electron} · Chrome ${r.app.chrome} · Node ${r.app.node} · ${r.app.platform}/${r.app.arch}`
  ]
  if (r.project) lines.push(`- **Project:** \`${r.project.split('/').pop()}\``)
  if (r.stack) lines.push('', '### Stack trace', '', '```', r.stack.trim(), '```')
  if (r.details && Object.keys(r.details).length) {
    lines.push('', '### Details', '', '```json', JSON.stringify(r.details, null, 2), '```')
  }
  return lines.join('\n') + '\n'
}

/**
 * A "new issue" URL pre-filled with the report. Browsers cap URLs around
 * 8 KB, so the body is truncated with a note when the stack is long.
 */
export function crashIssueUrl(r: CrashReport, maxBody = 6000): string {
  const title = `[crash] ${r.message.split('\n')[0].slice(0, 120)}`
  let body = crashReportMarkdown(r)
  if (body.length > maxBody) body = body.slice(0, maxBody) + '\n…(truncated — full report pasted below)\n'
  return `${ISSUES_URL}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`
}
