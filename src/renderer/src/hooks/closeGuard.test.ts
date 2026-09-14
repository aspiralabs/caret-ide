// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { confirmCloseAllDirty } from './useKeyboardShortcuts'
import { useTabsStore } from '../stores/tabs'
import { registerEditor } from '../lib/editorBridge'

const confirmClose = vi.fn<(name: string) => Promise<'save' | 'dontSave' | 'cancel'>>()
beforeEach(() => {
  ;(window as unknown as { ide: unknown }).ide = { dialog: { confirmClose } }
  confirmClose.mockReset()
  useTabsStore.setState({ tabs: [], activeId: null })
})

describe('confirmCloseAllDirty (bug #3)', () => {
  it('approves immediately when nothing is dirty', async () => {
    useTabsStore.getState().openFile('/p/a.ts')
    await expect(confirmCloseAllDirty()).resolves.toBe(true)
    expect(confirmClose).not.toHaveBeenCalled()
  })

  it('prompts per dirty tab, saving the ones the user chooses', async () => {
    const a = useTabsStore.getState().openFile('/p/a.ts')
    const b = useTabsStore.getState().openFile('/p/b.ts')
    useTabsStore.getState().setDirty(a, true)
    useTabsStore.getState().setDirty(b, true)
    const saveA = vi.fn(async () => {})
    const saveB = vi.fn(async () => {})
    registerEditor(a, { save: saveA, isDirty: () => true })
    registerEditor(b, { save: saveB, isDirty: () => true })
    confirmClose.mockResolvedValueOnce('save').mockResolvedValueOnce('dontSave')

    await expect(confirmCloseAllDirty()).resolves.toBe(true)
    expect(confirmClose).toHaveBeenCalledTimes(2)
    expect(confirmClose).toHaveBeenNthCalledWith(1, 'a.ts')
    expect(confirmClose).toHaveBeenNthCalledWith(2, 'b.ts')
    expect(saveA).toHaveBeenCalledTimes(1)
    expect(saveB).not.toHaveBeenCalled()
  })

  it('cancels the close when the user cancels any prompt', async () => {
    const a = useTabsStore.getState().openFile('/p/a.ts')
    const b = useTabsStore.getState().openFile('/p/b.ts')
    useTabsStore.getState().setDirty(a, true)
    useTabsStore.getState().setDirty(b, true)
    registerEditor(a, { save: async () => {}, isDirty: () => true })
    confirmClose.mockResolvedValueOnce('cancel')
    await expect(confirmCloseAllDirty()).resolves.toBe(false)
    expect(confirmClose).toHaveBeenCalledTimes(1)
  })

  it('cancels when a save fails or the editor is gone', async () => {
    const a = useTabsStore.getState().openFile('/p/a.ts')
    useTabsStore.getState().setDirty(a, true)
    confirmClose.mockResolvedValue('save')
    // No editor registered for the tab.
    await expect(confirmCloseAllDirty()).resolves.toBe(false)
    registerEditor(a, {
      save: async () => {
        throw new Error('disk full')
      },
      isDirty: () => true
    })
    await expect(confirmCloseAllDirty()).resolves.toBe(false)
  })

  it('brings each dirty tab to the front before asking', async () => {
    const a = useTabsStore.getState().openFile('/p/a.ts')
    useTabsStore.getState().openFile('/p/b.ts')
    useTabsStore.getState().setDirty(a, true)
    confirmClose.mockImplementation(async () => {
      expect(useTabsStore.getState().activeId).toBe(a)
      return 'dontSave'
    })
    await confirmCloseAllDirty()
    expect(confirmClose).toHaveBeenCalled()
  })
})
