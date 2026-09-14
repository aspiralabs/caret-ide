import { describe, expect, it, vi } from 'vitest'
import { assetCandidates, resolveMarkdownAsset } from './markdownAssets'

const root = '/proj'
const md = '/proj/docs/guide.md'

describe('assetCandidates', () => {
  it('resolves relative paths against the markdown file', () => {
    expect(assetCandidates('img/a.png', md, root)).toEqual(['/proj/docs/img/a.png'])
    expect(assetCandidates('../a.png', md, root)).toEqual(['/proj/docs/../a.png'])
  })

  it('resolves root-relative paths against the project root, then public/ (bug #11)', () => {
    expect(assetCandidates('/images/x.png', md, root)).toEqual([
      '/proj/images/x.png',
      '/proj/public/images/x.png'
    ])
  })

  it('passes remote and data URLs through', () => {
    expect(assetCandidates('https://x/y.png', md, root)).toEqual([])
    expect(assetCandidates('data:image/png;base64,AA', md, root)).toEqual([])
  })
})

describe('resolveMarkdownAsset', () => {
  it('returns remote URLs untouched without calling read', async () => {
    const read = vi.fn()
    expect(await resolveMarkdownAsset('https://x/y.png', md, root, read)).toBe('https://x/y.png')
    expect(read).not.toHaveBeenCalled()
  })

  it('falls through to public/ when the root candidate is missing', async () => {
    const read = vi.fn(async (p: string) => (p.includes('/public/') ? 'data:ok' : null))
    expect(await resolveMarkdownAsset('/images/x.png', md, root, read)).toBe('data:ok')
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('never rejects: a throwing read (path escapes root) resolves to null', async () => {
    const read = vi.fn(async () => {
      throw new Error('Path escapes project root')
    })
    await expect(resolveMarkdownAsset('/etc/x.png', md, root, read)).resolves.toBeNull()
    await expect(resolveMarkdownAsset('../../x.png', md, root, read)).resolves.toBeNull()
  })
})
