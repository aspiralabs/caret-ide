import { describe, expect, it } from 'vitest'
import { NEW_SESSION_COMMAND, relativeAge, resumeCommand } from './sessionCommands'

describe('session commands (integration #16)', () => {
  it('builds resume / new commands', () => {
    expect(resumeCommand('5d70e3d7-6101-42e8-a8cf-a9ec9d91f59d')).toBe('claude --resume 5d70e3d7-6101-42e8-a8cf-a9ec9d91f59d')
    expect(resumeCommand("we'ird")).toBe("claude --resume 'we'\\''ird'")
    expect(NEW_SESSION_COMMAND).toBe('claude')
  })
  it('formats ages', () => {
    const now = 1_000_000_000
    expect(relativeAge(now - 10_000, now)).toBe('just now')
    expect(relativeAge(now - 5 * 60_000, now)).toBe('5m ago')
    expect(relativeAge(now - 3 * 3_600_000, now)).toBe('3h ago')
    expect(relativeAge(now - 2 * 86_400_000, now)).toBe('2d ago')
  })
})
