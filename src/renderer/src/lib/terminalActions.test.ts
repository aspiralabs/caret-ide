// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { focusedTerminalId, TERMINAL_ID_ATTR } from './terminalActions'

describe('focusedTerminalId', () => {
  it('finds the terminal id from a nested focused element', () => {
    const host = document.createElement('div')
    host.setAttribute(TERMINAL_ID_ATTR, 'term_1')
    const inner = document.createElement('div')
    const ta = document.createElement('textarea')
    inner.appendChild(ta)
    host.appendChild(inner)
    expect(focusedTerminalId(ta)).toBe('term_1')
    expect(focusedTerminalId(host)).toBe('term_1')
  })

  it('returns null for elements outside a terminal, and for no focus', () => {
    expect(focusedTerminalId(document.createElement('input'))).toBeNull()
    expect(focusedTerminalId(null)).toBeNull()
    expect(focusedTerminalId(document.body)).toBeNull()
  })
})
