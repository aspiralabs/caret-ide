// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { adjacentMark, parseOsc, recordCommand, shellState } from './shellMarks'

describe('parseOsc (#44)', () => {
  it('parses the 133 / 633 payloads', () => {
    expect(parseOsc(133, 'A')).toEqual({ kind: 'prompt' })
    expect(parseOsc(133, 'C')).toEqual({ kind: 'executing' })
    expect(parseOsc(133, 'D;0')).toEqual({ kind: 'done', exitCode: 0 })
    expect(parseOsc(133, 'D;127')).toEqual({ kind: 'done', exitCode: 127 })
    expect(parseOsc(133, 'D')).toEqual({ kind: 'done', exitCode: null })
    expect(parseOsc(133, 'Z')).toBeNull()
    expect(parseOsc(633, 'E;' + btoa('git log; ls'))).toEqual({ kind: 'command', command: 'git log; ls' })
    expect(parseOsc(633, 'E;***')).toBeNull()
  })
})

describe('command history + navigation', () => {
  it('dedupes consecutive commands and skips blanks', () => {
    const s = shellState('t1')
    recordCommand(s, 'ls')
    recordCommand(s, 'ls')
    recordCommand(s, '   ')
    recordCommand(s, 'npm test')
    expect(s.commands).toEqual(['ls', 'npm test'])
  })
  it('finds the prompt above / below the viewport', () => {
    const marks = [
      { line: 10, isDisposed: false },
      { line: 40, isDisposed: false },
      { line: 70, isDisposed: true },
      { line: 90, isDisposed: false }
    ]
    expect(adjacentMark(marks, 50, -1)).toBe(40)
    expect(adjacentMark(marks, 50, 1)).toBe(90)
    expect(adjacentMark(marks, 5, -1)).toBeNull()
    expect(adjacentMark(marks, 95, 1)).toBeNull()
  })
})
