import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isUserInput, useAwaitingStore } from './awaiting'

const clear = vi.fn()

beforeEach(() => {
  clear.mockReset()
  ;(globalThis as { window?: unknown }).window = { ide: { awaiting: { clear } } }
  useAwaitingStore.setState({ ptyIds: ['a', 'b'] })
})

describe('useAwaitingStore.clear', () => {
  it('drops the pty and tells main once per wait', () => {
    useAwaitingStore.getState().clear('a')
    useAwaitingStore.getState().clear('a')
    expect(useAwaitingStore.getState().ptyIds).toEqual(['b'])
    expect(clear).toHaveBeenCalledTimes(1)
    expect(clear).toHaveBeenCalledWith('a')
  })

  it('ignores a pty that is not waiting', () => {
    useAwaitingStore.getState().clear('z')
    expect(clear).not.toHaveBeenCalled()
  })
})

describe('isUserInput', () => {
  it('counts keystrokes, pastes and arrow keys', () => {
    expect(isUserInput('y')).toBe(true)
    expect(isUserInput('\r')).toBe(true)
    expect(isUserInput('\x1b[A')).toBe(true)
    expect(isUserInput('pasted text')).toBe(true)
  })

  it('ignores focus, device and cursor reports', () => {
    expect(isUserInput('\x1b[I')).toBe(false)
    expect(isUserInput('\x1b[O')).toBe(false)
    expect(isUserInput('\x1b[?62;22c')).toBe(false)
    expect(isUserInput('\x1b[12;40R')).toBe(false)
    expect(isUserInput('\x1b[0n')).toBe(false)
    expect(isUserInput('\x1b]11;rgb:ffff/ffff/ffff\x07')).toBe(false)
  })
})
