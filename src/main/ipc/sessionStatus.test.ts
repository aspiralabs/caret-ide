import { describe, expect, it } from 'vitest'
import { classifyStatus, parseJsonlRecords, titleFromRecords } from './sessionStatus'

const assistant = (content: unknown[], stop: string): Record<string, unknown> => ({
  type: 'assistant',
  message: { role: 'assistant', content, stop_reason: stop }
})
const user = (content: unknown): Record<string, unknown> => ({
  type: 'user',
  message: { role: 'user', content }
})

describe('parseJsonlRecords', () => {
  it('skips torn and blank lines', () => {
    const recs = parseJsonlRecords('{"a":1}\n\n{"b":\n{"c":3}\n')
    expect(recs).toEqual([{ a: 1 }, { c: 3 }])
  })
})

describe('classifyStatus (integration #11)', () => {
  it('reads the last conversational record', () => {
    expect(classifyStatus([user('hi')])).toBe('thinking')
    expect(classifyStatus([user('hi'), assistant([{ type: 'text', text: 'ok' }], 'end_turn')])).toBe(
      'waiting'
    )
    expect(classifyStatus([assistant([{ type: 'tool_use' }], 'tool_use')])).toBe('working')
    expect(classifyStatus([assistant([{ type: 'thinking' }], 'tool_use')])).toBe('thinking')
    expect(classifyStatus([assistant([{ type: 'tool_use' }], 'tool_use'), user([{ type: 'tool_result' }])])).toBe(
      'working'
    )
  })

  it('ignores metadata records and returns null with none', () => {
    expect(
      classifyStatus([
        assistant([{ type: 'text' }], 'end_turn'),
        { type: 'ai-title', aiTitle: 'x' },
        { type: 'file-history-snapshot' }
      ])
    ).toBe('waiting')
    expect(classifyStatus([{ type: 'summary' }])).toBeNull()
    expect(classifyStatus([])).toBeNull()
  })
})

describe('titleFromRecords', () => {
  it('prefers the latest custom-title, then the latest ai-title', () => {
    const recs = [
      { type: 'ai-title', aiTitle: 'First guess' },
      { type: 'custom-title', customTitle: 'old name' },
      { type: 'ai-title', aiTitle: 'Better guess' },
      { type: 'custom-title', customTitle: 'caret-audit' }
    ]
    expect(titleFromRecords(recs)).toBe('caret-audit')
    expect(titleFromRecords(recs.slice(0, 1))).toBe('First guess')
    expect(titleFromRecords(recs.filter((r) => r.type === 'ai-title'))).toBe('Better guess')
    expect(titleFromRecords([{ type: 'user' }])).toBeNull()
  })
})
