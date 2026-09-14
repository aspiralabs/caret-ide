import { describe, expect, it } from 'vitest'
import { compareVersions, parseSemver } from './version'

describe('version compare (#48)', () => {
  it('parses tags with or without v and ignores prerelease suffixes', () => {
    expect(parseSemver('v0.6.0')).toEqual([0, 6, 0])
    expect(parseSemver('1.2.3-beta.1')).toEqual([1, 2, 3])
    expect(parseSemver('latest')).toBeNull()
  })
  it('orders numerically', () => {
    expect(compareVersions('0.6.0', 'v0.7.0')).toBe(-1)
    expect(compareVersions('0.10.0', '0.9.9')).toBe(1)
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('garbage', '0.0.1')).toBe(-1)
  })
})
