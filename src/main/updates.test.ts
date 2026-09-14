import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getVersion: () => '0.6.0' }, ipcMain: { handle: () => {} }, net: { fetch: vi.fn() } }))

import { checkForUpdate } from './updates'

const respond = (body: unknown, ok = true, status = 200): (() => Promise<Response>) => async () =>
  ({ ok, status, json: async () => body }) as Response

describe('checkForUpdate (#48)', () => {
  it('reports a newer release with its page', async () => {
    const info = await checkForUpdate(respond({ tag_name: 'v0.7.0', html_url: 'https://gh/r/v0.7.0' }))
    expect(info).toEqual({ current: '0.6.0', latest: '0.7.0', url: 'https://gh/r/v0.7.0', isNewer: true })
  })
  it('reports up to date, and fails loudly on API errors', async () => {
    expect((await checkForUpdate(respond({ tag_name: 'v0.6.0' }))).isNewer).toBe(false)
    await expect(checkForUpdate(respond({}, false, 403))).rejects.toThrow(/403/)
    await expect(checkForUpdate(respond({}))).rejects.toThrow(/tag/)
  })
})
