import { beforeEach, describe, expect, it } from 'vitest'
import {
  _resetEditorModels,
  clearEditorDoc,
  getEditorBaseline,
  getEditorModel,
  hasEditorBaseline,
  retargetEditorDoc,
  setEditorBaseline,
  setEditorModel,
  takePendingContent,
  setViewPosition,
  takeViewPosition,
  type CachedModel
} from './editorModels'

function fakeModel(text: string): CachedModel & { disposed: boolean } {
  const m = {
    disposed: false,
    getValue: () => text,
    isDisposed: () => m.disposed,
    dispose: () => {
      m.disposed = true
    }
  }
  return m
}

beforeEach(() => _resetEditorModels())

describe('clearEditorDoc (bugs #2, #23)', () => {
  it('disposes the model and forgets the baseline so a reopen re-reads disk', () => {
    const m = fakeModel('edited')
    setEditorModel('/p/a.ts', m)
    setEditorBaseline('/p/a.ts', 'orig')
    clearEditorDoc('/p/a.ts')
    expect(m.disposed).toBe(true)
    expect(getEditorModel('/p/a.ts')).toBeUndefined()
    expect(hasEditorBaseline('/p/a.ts')).toBe(false)
    expect(getEditorBaseline('/p/a.ts')).toBeUndefined()
  })

  it('is a no-op for unknown paths and already-disposed models', () => {
    expect(() => clearEditorDoc('/nope')).not.toThrow()
    const m = fakeModel('x')
    m.dispose()
    setEditorModel('/p/b.ts', m)
    expect(() => clearEditorDoc('/p/b.ts')).not.toThrow()
  })
})

describe('getEditorModel', () => {
  it('drops a model that was disposed elsewhere', () => {
    const m = fakeModel('x')
    setEditorModel('/p/a.ts', m)
    m.dispose()
    expect(getEditorModel('/p/a.ts')).toBeUndefined()
  })
})

describe('retargetEditorDoc (bug #8)', () => {
  it('carries unsaved text and the baseline to the new path', () => {
    const m = fakeModel('unsaved edits')
    setEditorModel('/p/old.ts', m)
    setEditorBaseline('/p/old.ts', 'on disk')
    retargetEditorDoc('/p/old.ts', '/p/new.ts')
    expect(m.disposed).toBe(true)
    expect(getEditorModel('/p/old.ts')).toBeUndefined()
    expect(hasEditorBaseline('/p/old.ts')).toBe(false)
    expect(getEditorBaseline('/p/new.ts')).toBe('on disk')
    // The next mount at the new path seeds with the unsaved buffer, once.
    expect(takePendingContent('/p/new.ts')).toBe('unsaved edits')
    expect(takePendingContent('/p/new.ts')).toBeUndefined()
  })

  it('handles a baseline-only entry and identical paths', () => {
    setEditorBaseline('/p/a.ts', 'b')
    retargetEditorDoc('/p/a.ts', '/p/a.ts')
    expect(getEditorBaseline('/p/a.ts')).toBe('b')
    retargetEditorDoc('/p/a.ts', '/p/c.ts')
    expect(getEditorBaseline('/p/c.ts')).toBe('b')
    expect(takePendingContent('/p/c.ts')).toBeUndefined()
  })

  it('chains a pending buffer across two renames', () => {
    setEditorModel('/p/a.ts', fakeModel('v1'))
    retargetEditorDoc('/p/a.ts', '/p/b.ts')
    retargetEditorDoc('/p/b.ts', '/p/c.ts')
    expect(takePendingContent('/p/c.ts')).toBe('v1')
  })
})

describe('view position hand-off (IDEAS bug 2)', () => {
  it('is one-shot, follows renames and clears with the doc', () => {
    setViewPosition('/p/a.md', { line: 40, column: 3, topLine: 30 })
    retargetEditorDoc('/p/a.md', '/p/b.md')
    expect(takeViewPosition('/p/a.md')).toBeUndefined()
    expect(takeViewPosition('/p/b.md')).toEqual({ line: 40, column: 3, topLine: 30 })
    expect(takeViewPosition('/p/b.md')).toBeUndefined()
    setViewPosition('/p/c.md', { line: 1, column: 1, topLine: 1 })
    clearEditorDoc('/p/c.md')
    expect(takeViewPosition('/p/c.md')).toBeUndefined()
  })
})
