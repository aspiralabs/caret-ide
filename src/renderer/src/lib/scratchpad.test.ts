// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isScratchpad, openScratchpad, scratchpadPath, sendScratchpad } from './scratchpad'
import { useProjectStore } from '../stores/project'
import { useTabsStore } from '../stores/tabs'
import { useTerminalsStore } from '../stores/terminals'
import { registerEditor } from './editorBridge'
import { mdSetContent } from './markdownDoc'

describe('scratchpad paths (integration #17)', () => {
  it('lives in .caret/prompts.md', () => {
    expect(scratchpadPath('/p')).toBe('/p/.caret/prompts.md')
    expect(isScratchpad('/p/.caret/prompts.md', '/p')).toBe(true)
    expect(isScratchpad('/p/prompts.md', '/p')).toBe(false)
    expect(isScratchpad('/p/.caret/prompts.md', '')).toBe(false)
  })
})

describe('openScratchpad', () => {
  const fs = {
    createDir: vi.fn(async () => {}),
    createFile: vi.fn(async () => {}),
    writeFile: vi.fn(async () => {})
  }
  beforeEach(() => {
    ;(window as unknown as { ide: unknown }).ide = { fs }
    Object.values(fs).forEach((f) => f.mockClear())
    useProjectStore.setState({ info: { root: '/p', name: 'p' } })
    useTabsStore.setState({ tabs: [], activeId: null })
  })

  it('creates the dir, a self-contained .gitignore and the seeded file, then opens it', async () => {
    await openScratchpad()
    expect(fs.createDir).toHaveBeenCalledWith('/p/.caret')
    expect(fs.writeFile).toHaveBeenCalledWith('/p/.caret/.gitignore', '*\n')
    expect(fs.writeFile).toHaveBeenCalledWith('/p/.caret/prompts.md', expect.stringContaining('# Prompt scratchpad'))
    expect(useTabsStore.getState().getActive()).toMatchObject({ kind: 'editor', filePath: '/p/.caret/prompts.md' })
  })

  it('does not overwrite existing files', async () => {
    fs.createFile.mockRejectedValue(new Error('EEXIST'))
    await openScratchpad()
    expect(fs.writeFile).not.toHaveBeenCalled()
    expect(useTabsStore.getState().tabs).toHaveLength(1)
  })
})

describe('sendScratchpad', () => {
  const write = vi.fn()
  beforeEach(() => {
    ;(window as unknown as { ide: unknown }).ide = { pty: { write } }
    write.mockClear()
    useTerminalsStore.setState({ terminals: [], activeId: null })
    const c = useTerminalsStore.getState().addTerminal()
    useTerminalsStore.getState().setPty(c, 'pty_c')
    useTerminalsStore.getState().setForeground(c, 'claude')
  })

  it('sends the selection when there is one, else the whole document', () => {
    mdSetContent('/p/.caret/prompts.md', 'whole doc\nline 2\n')
    registerEditor('t1', { save: async () => {}, isDirty: () => false, getSelection: () => null })
    expect(sendScratchpad('t1', '/p/.caret/prompts.md')).toBe(true)
    expect(write).toHaveBeenLastCalledWith('pty_c', '\x1b[200~whole doc\nline 2\x1b[201~')
    registerEditor('t1', {
      save: async () => {},
      isDirty: () => false,
      getSelection: () => ({ text: 'just this', startLine: 1, endLine: 1 })
    })
    expect(sendScratchpad('t1', '/p/.caret/prompts.md')).toBe(true)
    expect(write).toHaveBeenLastCalledWith('pty_c', '\x1b[200~just this\x1b[201~')
  })

  it('sends nothing for an empty document', () => {
    mdSetContent('/p/.caret/empty.md', '   \n')
    expect(sendScratchpad('none', '/p/.caret/empty.md')).toBe(false)
    expect(write).not.toHaveBeenCalled()
  })
})
