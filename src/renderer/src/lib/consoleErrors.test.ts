import { describe, expect, it } from 'vitest'
import { consoleErrorPayload, formatConsoleError, MAX_CONSOLE_ERRORS, pushConsoleEntry } from './consoleErrors'
import type { ConsoleEntry } from '@shared/types'

const entry = (message: string): ConsoleEntry => ({
  message,
  source: 'http://localhost:5173/src/App.tsx?t=123',
  line: 42,
  url: 'http://localhost:5173/',
  at: 0
})

describe('pushConsoleEntry (integration #13)', () => {
  it('appends, caps the list, and clears on null', () => {
    let list = pushConsoleEntry(undefined, entry('a'))
    expect(list).toHaveLength(1)
    for (let i = 0; i < MAX_CONSOLE_ERRORS + 5; i++) list = pushConsoleEntry(list, entry('x' + i))
    expect(list).toHaveLength(MAX_CONSOLE_ERRORS)
    expect(list[list.length - 1].message).toBe('x' + (MAX_CONSOLE_ERRORS + 4))
    expect(pushConsoleEntry(list, null)).toEqual([])
  })
})

describe('formatConsoleError / consoleErrorPayload', () => {
  it('formats message, short source and page', () => {
    expect(formatConsoleError(entry('TypeError: x is not a function'))).toBe(
      [
        'Browser console error:',
        '- Message: TypeError: x is not a function',
        '- Source: /src/App.tsx?t=123:42',
        '- Page: http://localhost:5173/'
      ].join('\n')
    )
  })
  it('builds a short marker from the first line', () => {
    const p = consoleErrorPayload(entry('Uncaught Error: boom\n    at foo (App.tsx:1)'))
    expect(p.marker).toBe('[console error: Uncaught Error: boom]')
    expect(p.body).toContain('- Message: Uncaught Error: boom')
    const long = consoleErrorPayload(entry('x'.repeat(100)))
    expect(long.marker.length).toBeLessThan(80)
    expect(long.marker.endsWith('…]')).toBe(true)
  })
})
