import { describe, expect, it } from 'vitest'
import { dataUrlBytes, formatBytes, mediaKindForPath } from './mediaKind'

describe('mediaKindForPath (#25)', () => {
  it('classifies images and PDFs, nothing else', () => {
    expect(mediaKindForPath('/p/logo.PNG')).toBe('image')
    expect(mediaKindForPath('/p/icon.svg')).toBe('image')
    expect(mediaKindForPath('/p/doc.pdf')).toBe('pdf')
    expect(mediaKindForPath('/p/a.ts')).toBeNull()
    expect(mediaKindForPath('/p/README')).toBeNull()
  })
})

describe('size helpers', () => {
  it('formats bytes and measures data URLs', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB')
    expect(dataUrlBytes('data:image/png;base64,' + Buffer.from('hello').toString('base64'))).toBe(5)
    expect(dataUrlBytes('nope')).toBe(0)
  })
})
