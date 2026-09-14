import { describe, expect, it } from 'vitest'
import { decodeText, looksBinary } from './textDecode'

describe('looksBinary', () => {
  it('flags a NUL byte in the first 8KB only', () => {
    expect(looksBinary(Buffer.from('hello\0world'))).toBe(true)
    expect(looksBinary(Buffer.from('hello world'))).toBe(false)
    const late = Buffer.concat([Buffer.alloc(9000, 0x61), Buffer.from([0])])
    expect(looksBinary(late)).toBe(false)
  })
})

describe('decodeText', () => {
  it('decodes valid UTF-8, keeping a BOM intact', () => {
    expect(decodeText(Buffer.from('héllo ✓'))).toEqual({ binary: false, content: 'héllo ✓' })
    const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('x')])
    expect(decodeText(bom).content).toBe('﻿x')
  })

  it('treats NUL-containing buffers as binary', () => {
    expect(decodeText(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1]))).toEqual({
      binary: true,
      content: ''
    })
  })

  it('never returns a lossy decode for a Latin-1 file containing 0xEF (bug #22)', () => {
    // "naïve" in Latin-1: ï is a lone 0xEF, invalid as UTF-8.
    const latin1 = Buffer.from('na\xefve caf\xe9', 'latin1')
    const res = decodeText(latin1)
    expect(res.binary).toBe(true)
    expect(res.content).not.toContain('�')
  })

  it('treats any invalid UTF-8 as binary rather than substituting', () => {
    expect(decodeText(Buffer.from([0xc3, 0x28])).binary).toBe(true) // truncated 2-byte seq
    expect(decodeText(Buffer.from([0xff, 0xfe, 0x41])).binary).toBe(true)
  })

  it('handles the empty file', () => {
    expect(decodeText(Buffer.alloc(0))).toEqual({ binary: false, content: '' })
  })
})
