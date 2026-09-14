import { describe, expect, it } from 'vitest'
import { hasScheme, hostLabel, normalizeUrl } from './normalizeUrl'

describe('normalizeUrl', () => {
  it('prefixes http:// on a bare localhost:port (bug #1)', () => {
    expect(normalizeUrl('localhost:3000')).toBe('http://localhost:3000')
    expect(normalizeUrl('localhost:3000/app?x=1')).toBe('http://localhost:3000/app?x=1')
    expect(normalizeUrl('LOCALHOST:5173')).toBe('http://LOCALHOST:5173')
  })

  it('prefixes http:// on any host:port that is not a known scheme', () => {
    expect(normalizeUrl('myhost:8080')).toBe('http://myhost:8080')
    expect(normalizeUrl('127.0.0.1:8080')).toBe('http://127.0.0.1:8080')
    expect(normalizeUrl('example.com')).toBe('http://example.com')
    expect(normalizeUrl('example.com/path')).toBe('http://example.com/path')
  })

  it('keeps known schemes untouched', () => {
    for (const u of [
      'http://localhost:3000',
      'https://example.com',
      'file:///tmp/x.html',
      'about:blank',
      'chrome://gpu',
      'data:text/html,hi',
      'HTTPS://EXAMPLE.COM'
    ]) {
      expect(normalizeUrl(u)).toBe(u)
    }
  })

  it('keeps unknown schemes that carry an authority', () => {
    expect(normalizeUrl('custom://thing/here')).toBe('custom://thing/here')
  })

  it('handles protocol-relative and whitespace', () => {
    expect(normalizeUrl('//cdn.example.com/x')).toBe('http://cdn.example.com/x')
    expect(normalizeUrl('  localhost:3000  ')).toBe('http://localhost:3000')
    expect(normalizeUrl('')).toBe('')
    expect(normalizeUrl('   ')).toBe('')
  })
})

describe('hasScheme', () => {
  it('rejects host:port and accepts real schemes', () => {
    expect(hasScheme('localhost:3000')).toBe(false)
    expect(hasScheme('http://x')).toBe(true)
    expect(hasScheme('about:blank')).toBe(true)
    expect(hasScheme('foo://x')).toBe(true)
    expect(hasScheme('foo:x')).toBe(false)
  })
})

describe('hostLabel', () => {
  it('derives hostname:port', () => {
    expect(hostLabel(undefined)).toBe('New Tab')
    expect(hostLabel('http://localhost:3000/x')).toBe('localhost:3000')
    expect(hostLabel('https://example.com/')).toBe('example.com')
    expect(hostLabel('not a url')).toBe('not a url')
  })
})
