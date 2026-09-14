import { describe, expect, it } from 'vitest'
import {
  parseSessionsIndex,
  resolveSessionTitle,
  titleForSession,
  titleFromJsonlText
} from './sessionTitle'

const index = parseSessionsIndex(
  JSON.stringify({
    version: 1,
    entries: [
      { sessionId: 'old', summary: 'Fix the login bug', fileMtime: 100 },
      { sessionId: 'mid', summary: 'Refactor tabs', fileMtime: 200 },
      { sessionId: 'noSummary', fileMtime: 300 }
    ]
  })
)

describe('parseSessionsIndex', () => {
  it('keeps only entries with a sessionId and summary', () => {
    expect(index.map((e) => e.sessionId)).toEqual(['old', 'mid'])
  })
  it('tolerates garbage', () => {
    expect(parseSessionsIndex('nope')).toEqual([])
    expect(parseSessionsIndex('{"entries": 5}')).toEqual([])
    expect(parseSessionsIndex('[]')).toEqual([])
  })
})

describe('titleFromJsonlText', () => {
  it('prefers a summary line, else the first user prompt, clipped', () => {
    expect(titleFromJsonlText('{"type":"summary","summary":"Hello"}\n')).toBe('Hello')
    const long = 'x'.repeat(200)
    expect(titleFromJsonlText(`{"type":"user","message":{"content":"  ${long}  "}}`)).toBe(
      'x'.repeat(80)
    )
    expect(titleFromJsonlText('')).toBeNull()
    expect(titleFromJsonlText('not json\n{"type":"assistant"}')).toBeNull()
  })
})

describe('resolveSessionTitle (bug #16)', () => {
  it('uses the newest session’s own index summary', () => {
    expect(resolveSessionTitle(index, { sessionId: 'mid', jsonlText: '' })).toBe('Refactor tabs')
  })

  it('falls back to the newest session’s own jsonl, never another session’s summary', () => {
    // A brand-new session: its jsonl exists but is empty and it's not in the index.
    expect(resolveSessionTitle(index, { sessionId: 'new', jsonlText: '' })).toBeNull()
    // Once it has a first prompt, that is its label.
    expect(
      resolveSessionTitle(index, {
        sessionId: 'new',
        jsonlText: '{"type":"user","message":{"content":"Add dark mode"}}'
      })
    ).toBe('Add dark mode')
  })

  it('prefers the transcript’s own custom-title / ai-title over the index', () => {
    const jsonl = '{"type":"ai-title","aiTitle":"AI name"}\n{"type":"custom-title","customTitle":"my name"}\n'
    expect(resolveSessionTitle(index, { sessionId: 'mid', jsonlText: jsonl })).toBe('my name')
  })

  it('returns null with no session files', () => {
    expect(resolveSessionTitle(index, null)).toBeNull()
    expect(titleForSession(index, 'zzz')).toBeNull()
  })
})
