import { describe, expect, it } from 'vitest'
import { parseStartupMode, resolveBootTarget } from './bootMode'

describe('resolveBootTarget (spec §3.1 precedence)', () => {
  it('opens the env folder before anything else', () => {
    expect(resolveBootTarget({ envDir: '/dev/a', cliDir: '/dev/b', startupMode: 'terminal' })).toEqual({ kind: 'project', root: '/dev/a' })
  })
  it('opens the CLI folder when no env folder is set', () => {
    expect(resolveBootTarget({ cliDir: '/dev/b', startupMode: 'terminal' })).toEqual({ kind: 'project', root: '/dev/b' })
    expect(resolveBootTarget({ envDir: null, cliDir: '/dev/b', startupMode: 'welcome' })).toEqual({ kind: 'project', root: '/dev/b' })
  })
  it('falls back to the startup mode with no folder given', () => {
    expect(resolveBootTarget({ startupMode: 'terminal' })).toEqual({ kind: 'terminal' })
    expect(resolveBootTarget({ startupMode: 'welcome' })).toEqual({ kind: 'welcome' })
    expect(resolveBootTarget({ envDir: '', cliDir: null, startupMode: 'welcome' })).toEqual({ kind: 'welcome' })
  })
})

describe('parseStartupMode', () => {
  it('is always welcome while the terminalMode flag is off (the default)', () => {
    expect(parseStartupMode(null, '')).toBe('welcome')
    expect(parseStartupMode('{}', '')).toBe('welcome')
    expect(parseStartupMode('{"startupMode":"terminal"}', '')).toBe('welcome')
    expect(parseStartupMode('{ nope', '')).toBe('welcome')
  })
  it('with the flag in the file: defaults to terminal for a missing key or an unknown value', () => {
    expect(parseStartupMode('{"features":{"terminalMode":true}}', '')).toBe('terminal')
    expect(parseStartupMode('{"features":{"terminalMode":true},"startupMode":"ide"}', '')).toBe('terminal')
    expect(parseStartupMode('{"features":{"terminalMode":true},"startupMode":"welcome"}', '')).toBe('welcome')
  })
  it('with the flag in the env: a missing file or invalid JSON still boots to the terminal', () => {
    expect(parseStartupMode(null, 'terminalMode')).toBe('terminal')
    expect(parseStartupMode('{ nope', 'terminalMode')).toBe('terminal')
    expect(parseStartupMode('{"features":{"terminalMode":true}}', '!terminalMode')).toBe('welcome')
  })
})
