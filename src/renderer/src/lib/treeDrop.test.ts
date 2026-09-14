// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dropLabel, executeDrop, INTERNAL_DRAG_TYPE, planDrop } from './treeDrop'
import { useTabsStore } from '../stores/tabs'
import { useFilesStore } from '../stores/files'
import { useToastStore } from '../stores/toast'

const dt = (types: string[], data: Record<string, string> = {}, files: File[] = []) => ({
  types,
  getData: (t: string) => data[t] ?? '',
  files
})

describe('planDrop (#29 + Finder drops)', () => {
  it('recognises internal drags, external files (move / ⌥ copy) and nothing', () => {
    expect(planDrop(dt([INTERNAL_DRAG_TYPE], { [INTERNAL_DRAG_TYPE]: '["/p/a.ts"]' }), false)).toEqual({
      kind: 'internal',
      paths: ['/p/a.ts']
    })
    const f = new File(['x'], 'x.txt')
    expect(planDrop(dt(['Files'], {}, [f]), false)).toEqual({ kind: 'external', files: [f], mode: 'move' })
    expect(planDrop(dt(['Files'], {}, [f]), true)).toMatchObject({ mode: 'copy' })
    expect(planDrop(dt(['text/plain'], { 'text/plain': 'hi' }), false)).toEqual({ kind: 'none' })
    expect(planDrop(dt([INTERNAL_DRAG_TYPE], { [INTERNAL_DRAG_TYPE]: 'nope' }), false)).toEqual({ kind: 'none' })
  })
  it('labels the overlay', () => {
    expect(dropLabel('external-move', '/p/src', '/p')).toBe('Move into src  (hold ⌥ to copy)')
    expect(dropLabel('external-copy', '/p', '/p')).toBe('Copy into project root')
    expect(dropLabel('internal', '/p/lib', '/p')).toBe('Move into lib')
  })
})

describe('executeDrop', () => {
  const rename = vi.fn(async () => {})
  const importPaths = vi.fn(async () => ({ imported: ['/p/src/x.txt'], failed: [{ source: '/tmp/bad', error: 'nope' }] }))
  const readDir = vi.fn(async () => [])
  beforeEach(() => {
    ;(window as unknown as { ide: unknown }).ide = {
      fs: { rename, importPaths, readDir },
      files: { pathForFile: (f: File) => '/tmp/' + f.name }
    }
    rename.mockClear()
    importPaths.mockClear()
    useTabsStore.setState({ tabs: [], activeId: null })
    useFilesStore.setState({ selectedPath: null, selectedPaths: new Set(), expanded: new Set(), children: {} })
    useToastStore.setState({ toasts: [] })
  })

  it('moves internal paths (skipping no-ops) and retargets open tabs', async () => {
    const id = useTabsStore.getState().openFile('/p/a.ts')
    await executeDrop({ kind: 'internal', paths: ['/p/a.ts', '/p/lib/already.ts', '/p/lib'] }, '/p/lib')
    expect(rename).toHaveBeenCalledTimes(1)
    expect(rename).toHaveBeenCalledWith('/p/a.ts', '/p/lib/a.ts')
    expect(useTabsStore.getState().getById(id)?.filePath).toBe('/p/lib/a.ts')
    expect(useFilesStore.getState().selectedPath).toBe('/p/lib/a.ts')
  })

  it('imports external files via IPC and toasts failures', async () => {
    await executeDrop({ kind: 'external', files: [new File(['x'], 'x.txt'), new File(['y'], 'bad')], mode: 'copy' }, '/p/src')
    expect(importPaths).toHaveBeenCalledWith(['/tmp/x.txt', '/tmp/bad'], '/p/src', 'copy')
    expect(useFilesStore.getState().selectedPath).toBe('/p/src/x.txt')
    expect(useToastStore.getState().toasts.map((t) => t.message)).toEqual(["Couldn't copy bad: nope"])
  })
})
