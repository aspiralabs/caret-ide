import { describe, expect, it, vi } from 'vitest'
import { getEditor, registerEditor, saveAll } from './editorBridge'

describe('editorBridge', () => {
  it('registers and unregisters handles without clobbering a newer registration', () => {
    const a = { save: async () => {}, isDirty: () => false }
    const b = { save: async () => {}, isDirty: () => true }
    const offA = registerEditor('t1', a)
    registerEditor('t1', b)
    offA() // stale unregister must not remove b
    expect(getEditor('t1')).toBe(b)
  })

  it('saveAll saves every mounted dirty editor and reports failures (quick win #6)', async () => {
    const ok = vi.fn(async () => {})
    const bad = vi.fn(async () => {
      throw new Error('EACCES')
    })
    registerEditor('ok', { save: ok, isDirty: () => true })
    registerEditor('bad', { save: bad, isDirty: () => true })
    const res = await saveAll(['ok', 'bad', 'unmounted'])
    expect(ok).toHaveBeenCalledTimes(1)
    expect(res.saved).toEqual(['ok'])
    expect(res.failed).toEqual(['bad'])
  })
})
