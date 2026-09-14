import { beforeEach, describe, expect, it } from 'vitest'
import { useTabsStore } from './tabs'
import {
  _resetEditorModels,
  getEditorBaseline,
  getEditorModel,
  setEditorBaseline,
  setEditorModel,
  takePendingContent,
  type CachedModel
} from '../lib/editorModels'
import { mdGetBaseline, mdGetContent, mdSetBaseline, mdSetContent } from '../lib/markdownDoc'
import { getPreviewMode, setPreviewMode } from '../lib/markdownView'

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

beforeEach(() => {
  useTabsStore.setState({ tabs: [], activeId: null })
  _resetEditorModels()
})

describe('closeTab', () => {
  it('disposes the cached Monaco model and baseline for the file (bug #2)', () => {
    const id = useTabsStore.getState().openFile('/p/a.ts')
    const m = fakeModel('discarded edits')
    setEditorModel('/p/a.ts', m)
    setEditorBaseline('/p/a.ts', 'orig')
    useTabsStore.getState().closeTab(id)
    expect(m.disposed).toBe(true)
    expect(getEditorModel('/p/a.ts')).toBeUndefined()
    expect(getEditorBaseline('/p/a.ts')).toBeUndefined()
    expect(useTabsStore.getState().tabs).toHaveLength(0)
  })

  it('clears the shared markdown buffer + remembered mode', () => {
    const id = useTabsStore.getState().openFile('/p/n.md')
    mdSetContent('/p/n.md', 'x')
    mdSetBaseline('/p/n.md', 'x')
    setPreviewMode('/p/n.md', true)
    useTabsStore.getState().closeTab(id)
    expect(mdGetContent('/p/n.md')).toBeUndefined()
    expect(mdGetBaseline('/p/n.md')).toBeUndefined()
    expect(getPreviewMode('/p/n.md')).toBeUndefined()
  })

  it('activates a neighbour', () => {
    const a = useTabsStore.getState().openFile('/p/a.ts')
    const b = useTabsStore.getState().openFile('/p/b.ts')
    useTabsStore.getState().closeTab(b)
    expect(useTabsStore.getState().activeId).toBe(a)
  })
})

describe('retargetFile (bug #8)', () => {
  it('follows a file rename, carrying the buffer, baseline and dirty flag', () => {
    const id = useTabsStore.getState().openFile('/p/old.ts')
    useTabsStore.getState().setDirty(id, true)
    setEditorModel('/p/old.ts', fakeModel('unsaved'))
    setEditorBaseline('/p/old.ts', 'disk')
    useTabsStore.getState().retargetFile('/p/old.ts', '/p/new.ts')
    const tab = useTabsStore.getState().getById(id)!
    expect(tab.filePath).toBe('/p/new.ts')
    expect(tab.title).toBe('new.ts')
    expect(tab.dirty).toBe(true)
    expect(getEditorBaseline('/p/new.ts')).toBe('disk')
    expect(takePendingContent('/p/new.ts')).toBe('unsaved')
    expect(getEditorBaseline('/p/old.ts')).toBeUndefined()
  })

  it('follows a directory rename for every tab beneath it', () => {
    const a = useTabsStore.getState().openFile('/p/src/a.ts')
    const b = useTabsStore.getState().openFile('/p/src/deep/b.md')
    const c = useTabsStore.getState().openFile('/p/src-other/c.ts')
    mdSetContent('/p/src/deep/b.md', 'md')
    setPreviewMode('/p/src/deep/b.md', true)
    useTabsStore.getState().retargetFile('/p/src', '/p/lib')
    const s = useTabsStore.getState()
    expect(s.getById(a)!.filePath).toBe('/p/lib/a.ts')
    expect(s.getById(b)!.filePath).toBe('/p/lib/deep/b.md')
    expect(s.getById(c)!.filePath).toBe('/p/src-other/c.ts')
    expect(mdGetContent('/p/lib/deep/b.md')).toBe('md')
    expect(mdGetContent('/p/src/deep/b.md')).toBeUndefined()
    expect(getPreviewMode('/p/lib/deep/b.md')).toBe(true)
  })

  it('leaves the store untouched when nothing matches', () => {
    useTabsStore.getState().openFile('/p/a.ts')
    const before = useTabsStore.getState().tabs
    useTabsStore.getState().retargetFile('/p/zzz', '/p/yyy')
    expect(useTabsStore.getState().tabs).toBe(before)
  })
})

describe('openDiff (integration #15)', () => {
  it('is a singleton per file and follows renames / trashes', () => {
    const a = useTabsStore.getState().openDiff('/p/a.ts')
    expect(useTabsStore.getState().openDiff('/p/a.ts')).toBe(a)
    expect(useTabsStore.getState().getById(a)).toMatchObject({ kind: 'diff', title: 'a.ts (diff)' })
    useTabsStore.getState().retargetFile('/p/a.ts', '/p/b.ts')
    expect(useTabsStore.getState().getById(a)).toMatchObject({ filePath: '/p/b.ts', title: 'b.ts (diff)' })
    useTabsStore.getState().closeFilesUnder('/p/b.ts')
    expect(useTabsStore.getState().getById(a)).toBeUndefined()
  })
})

describe('closeFilesUnder (bug #8)', () => {
  it('closes clean tabs for a trashed file/dir and keeps dirty ones', () => {
    const clean = useTabsStore.getState().openFile('/p/src/a.ts')
    const dirty = useTabsStore.getState().openFile('/p/src/b.ts')
    const other = useTabsStore.getState().openFile('/p/x.ts')
    useTabsStore.getState().setDirty(dirty, true)
    const closed = useTabsStore.getState().closeFilesUnder('/p/src')
    expect(closed).toEqual([clean])
    const ids = useTabsStore.getState().tabs.map((t) => t.id)
    expect(ids).toEqual([dirty, other])
  })
})
