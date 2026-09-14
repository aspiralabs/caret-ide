import { describe, expect, it } from 'vitest'
import { decodeText, detectEol, encodeText, looksBinary } from './textDecode'

describe('looksBinary', () => {
  it('flags a NUL byte in the first 8KB only', () => {
    expect(looksBinary(Buffer.from('hello\0world'))).toBe(true)
    expect(looksBinary(Buffer.from('hello world'))).toBe(false)
    const late = Buffer.concat([Buffer.alloc(9000, 0x61), Buffer.from([0])])
    expect(looksBinary(late)).toBe(false)
  })
})

describe('detectEol', () => {
  it('picks the dominant ending', () => {
    expect(detectEol('a\nb\n')).toBe('lf')
    expect(detectEol('a\r\nb\r\n')).toBe('crlf')
    expect(detectEol('a\r\nb\nc\n')).toBe('lf')
    expect(detectEol('no newline')).toBe('lf')
  })
})

describe('decodeText (#27)', () => {
  it('decodes UTF-8 and reports no BOM / LF', () => {
    expect(decodeText(Buffer.from('héllo ✓\n'))).toEqual({
      binary: false,
      content: 'héllo ✓\n',
      encoding: 'utf8',
      bom: false,
      eol: 'lf'
    })
  })

  it('strips and reports a BOM, normalises CRLF to LF', () => {
    const buf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('a\r\nb\r\n')])
    expect(decodeText(buf)).toMatchObject({ content: 'a\nb\n', bom: true, eol: 'crlf', encoding: 'utf8' })
  })

  it('opens a Latin-1 file as text (not binary, not lossy) — bug #22 done properly', () => {
    const latin1 = Buffer.from('na\xefve caf\xe9', 'latin1')
    const res = decodeText(latin1)
    expect(res).toMatchObject({ binary: false, encoding: 'latin1', content: 'naïve café' })
  })

  it('treats NUL bytes as binary', () => {
    expect(decodeText(Buffer.from([0x89, 0x50, 0, 1])).binary).toBe(true)
  })

  it('handles the empty file', () => {
    expect(decodeText(Buffer.alloc(0))).toMatchObject({ binary: false, content: '' })
  })
})

describe('encodeText round-trips', () => {
  it('restores CRLF, BOM and Latin-1 exactly', () => {
    const cases = [
      Buffer.from('plain\n'),
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('bom\r\nline\r\n')]),
      Buffer.from('na\xefve\r\n', 'latin1'),
      Buffer.from('mixed\nendings\nmore\r\n')
    ]
    for (const original of cases) {
      const d = decodeText(original)
      expect(d.binary).toBe(false)
      const back = encodeText(d.content, d)
      // Mixed endings normalise to the dominant one; everything else is byte-exact.
      if (original.toString('latin1').includes('mixed')) {
        expect(back.toString()).toBe('mixed\nendings\nmore\n')
      } else {
        expect(back.equals(original)).toBe(true)
      }
    }
  })

  it('defaults to UTF-8 / LF with no meta', () => {
    expect(encodeText('x\n').toString()).toBe('x\n')
    expect(encodeText('x\n', { eol: 'crlf' }).toString()).toBe('x\r\n')
  })
})
