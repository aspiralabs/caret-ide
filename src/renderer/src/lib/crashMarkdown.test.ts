import { describe, expect, it } from 'vitest'
import type { CrashReport } from '@shared/types'
import { crashIssueUrl, crashReportMarkdown, ISSUES_URL } from './crashMarkdown'

const report: CrashReport = {
  id: 'x',
  timestamp: '2026-09-14T04:00:00.000Z',
  type: 'renderer-error',
  source: 'renderer',
  message: 'TypeError: boom\nsecond line',
  stack: 'TypeError: boom\n    at f (a.ts:1)\n',
  details: { line: 1 },
  app: { version: '0.6.0', electron: '44', chrome: '134', node: '22', platform: 'darwin', arch: 'arm64' },
  project: '/Users/me/proj'
}

describe('crashReportMarkdown (#55)', () => {
  it('renders the report as an issue body', () => {
    const md = crashReportMarkdown(report)
    expect(md).toContain('## TypeError: boom')
    expect(md).toContain('- **Type:** renderer-error (renderer)')
    expect(md).toContain('- **Project:** `proj`')
    expect(md).toContain('```\nTypeError: boom\n    at f (a.ts:1)\n```')
    expect(md).toContain('```json\n{\n  "line": 1\n}\n```')
  })
  it('builds a pre-filled issue URL and truncates huge bodies', () => {
    const url = crashIssueUrl(report)
    expect(url.startsWith(ISSUES_URL + '?title=')).toBe(true)
    expect(decodeURIComponent(url)).toContain('title=[crash] TypeError: boom')
    const big = crashIssueUrl({ ...report, stack: 'x'.repeat(20000) }, 1000)
    expect(decodeURIComponent(big)).toContain('(truncated')
    expect(big.length).toBeLessThan(5000)
  })
})
