import { describe, expect, it } from 'vitest'
import { foregroundName, foregroundPidsFor, parseLsofCwd, parsePsPairs } from './foreground'

describe('parsePsPairs', () => {
  it('parses pid/value lines, keeping spaces inside the value', () => {
    const m = parsePsPairs('  101 101\n  202   303\n 404 /usr/local/bin/my app\n\n')
    expect(m.get(101)).toBe('101')
    expect(m.get(202)).toBe('303')
    expect(m.get(404)).toBe('/usr/local/bin/my app')
    expect(m.size).toBe(3)
  })
  it('ignores garbage', () => {
    expect(parsePsPairs('abc\n')).toEqual(new Map())
  })
})

describe('foregroundPidsFor (bug #24)', () => {
  it('collects only distinct foreground groups, skipping shells that are in front', () => {
    const tpgid = new Map([
      [10, '10'], // shell in front → nothing running
      [20, '77'],
      [30, '77'], // two shells whose fg group is the same process
      [40, '']
    ])
    expect(foregroundPidsFor([10, 20, 30, 40, 50], tpgid)).toEqual([77])
  })
})

describe('parseLsofCwd (#42)', () => {
  it('reads the n-line', () => {
    expect(parseLsofCwd('p123\nfcwd\nn/Users/me/proj\n')).toBe('/Users/me/proj')
    expect(parseLsofCwd('')).toBeNull()
  })
})

describe('foregroundName', () => {
  const tpgid = new Map([
    [10, '10'],
    [20, '77'],
    [30, '88']
  ])
  const comm = new Map([
    [77, '/opt/homebrew/bin/claude'],
    [88, '-zsh']
  ])
  it('returns the command basename for a real foreground process', () => {
    expect(foregroundName(20, tpgid, comm)).toBe('claude')
  })
  it('returns null for shells, the shell itself, and unknown pids', () => {
    expect(foregroundName(10, tpgid, comm)).toBeNull()
    expect(foregroundName(30, tpgid, comm)).toBeNull()
    expect(foregroundName(99, tpgid, comm)).toBeNull()
  })
})
