// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { checkForUpdates, updateCheckDue } from './updates'
import { useToastStore } from '../stores/toast'

describe('update check (#48)', () => {
  it('is due once a day when enabled', () => {
    const now = 10 * 24 * 3600 * 1000
    expect(updateCheckDue(null, now, true)).toBe(true)
    expect(updateCheckDue(now - 3600 * 1000, now, true)).toBe(false)
    expect(updateCheckDue(now - 2 * 24 * 3600 * 1000, now, true)).toBe(true)
    expect(updateCheckDue(null, now, false)).toBe(false)
  })

  it('toasts a download link for a newer release, and stays quiet otherwise unless explicit', async () => {
    const check = vi.fn(async () => ({ current: '0.6.0', latest: '0.7.0', url: 'https://x', isNewer: true }))
    ;(window as unknown as { ide: unknown }).ide = { updates: { check } }
    useToastStore.setState({ toasts: [] })
    await checkForUpdates(false)
    expect(useToastStore.getState().toasts[0]).toMatchObject({ message: 'Caret 0.7.0 is available (you have 0.6.0)' })
    expect(useToastStore.getState().toasts[0].action?.label).toBe('Download')

    check.mockResolvedValue({ current: '0.6.0', latest: '0.6.0', url: 'https://x', isNewer: false })
    useToastStore.setState({ toasts: [] })
    await checkForUpdates(false)
    expect(useToastStore.getState().toasts).toHaveLength(0)
    await checkForUpdates(true)
    expect(useToastStore.getState().toasts[0].message).toMatch(/up to date/)
  })
})
