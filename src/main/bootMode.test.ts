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
  it('defaults to terminal for a missing file, missing key, invalid JSON, or an unknown value', () => {
    expect(parseStartupMode(null)).toBe('terminal')
    expect(parseStartupMode('{}')).toBe('terminal')
    expect(parseStartupMode('{ nope')).toBe('terminal')
    expect(parseStartupMode('{"startupMode":"ide"}')).toBe('terminal')
  })
  it('reads an explicit welcome', () => {
    expect(parseStartupMode('{"startupMode":"welcome"}')).toBe('welcome')
  })
})
