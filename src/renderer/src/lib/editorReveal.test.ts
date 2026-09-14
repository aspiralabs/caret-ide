// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { openFileAt, takePendingReveal } from './editorReveal'
import { registerEditor } from './editorBridge'
import { useTabsStore } from '../stores/tabs'
import { useLayoutStore } from '../stores/layout'

beforeEach(() => {
  useTabsStore.setState({ tabs: [], activeId: null })
  useLayoutStore.setState({ centerVisible: false })
})

describe('openFileAt (#19)', () => {
  it('jumps immediately when the editor is mounted', () => {
    const id = useTabsStore.getState().openFile('/p/a.ts')
    const revealLine = vi.fn()
    const focus = vi.fn()
    registerEditor(id, { save: async () => {}, isDirty: () => false, revealLine, focus })
    openFileAt('/p/a.ts', 12, 3)
    expect(revealLine).toHaveBeenCalledWith(12, 3)
    expect(focus).toHaveBeenCalled()
    expect(takePendingReveal('/p/a.ts')).toBeUndefined()
    expect(useLayoutStore.getState().centerVisible).toBe(true)
  })

  it('queues the jump for an editor that mounts later', () => {
    openFileAt('/p/b.ts', 7)
    expect(useTabsStore.getState().getActive()?.filePath).toBe('/p/b.ts')
    expect(takePendingReveal('/p/b.ts')).toEqual({ line: 7, column: undefined })
    expect(takePendingReveal('/p/b.ts')).toBeUndefined()
  })
})
