// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { afterSaveReload, dataUrlBase64, screenshotName, screenshotToClaude } from './preview'
import { useLayoutStore } from '../stores/layout'
import { useTabsStore } from '../stores/tabs'
import { useTerminalsStore } from '../stores/terminals'
import { useProjectStore } from '../stores/project'

describe('preview helpers (#36, #37)', () => {
  const reload = vi.fn(async () => {})
  const capture = vi.fn(async () => 'data:image/png;base64,QUJD')
  const writeBinary = vi.fn(async () => {})
  const write = vi.fn()
  beforeEach(() => {
    ;(window as unknown as { ide: unknown }).ide = { browser: { reload, capture }, fs: { writeBinary }, pty: { write } }
    reload.mockClear()
    writeBinary.mockClear()
    write.mockClear()
    useTabsStore.setState({ tabs: [], activeId: null })
    useLayoutStore.setState({ reloadPreviewOnSave: false })
    useProjectStore.setState({ info: { root: '/p', name: 'p' } })
    useTerminalsStore.setState({ terminals: [], activeId: null })
  })

  it('reloads every browser tab after a save only when the toggle is on', () => {
    const b = useTabsStore.getState().newBrowserTab('http://localhost:3000')
    useTabsStore.getState().openFile('/p/a.ts')
    afterSaveReload()
    expect(reload).not.toHaveBeenCalled()
    useLayoutStore.setState({ reloadPreviewOnSave: true })
    afterSaveReload()
    expect(reload).toHaveBeenCalledTimes(1)
    expect(reload).toHaveBeenCalledWith(b)
  })

  it('names screenshots and strips data URL prefixes', () => {
    expect(screenshotName(new Date(2026, 8, 14, 4, 15, 30))).toBe('shot-2026-09-14-041530.png')
    expect(dataUrlBase64('data:image/png;base64,QUJD')).toBe('QUJD')
    expect(dataUrlBase64('nope')).toBe('')
  })

  it('saves a screenshot under .caret/screenshots and mentions it to Claude', async () => {
    const c = useTerminalsStore.getState().addTerminal()
    useTerminalsStore.getState().setPty(c, 'pty_c')
    useTerminalsStore.getState().setForeground(c, 'claude')
    expect(await screenshotToClaude('tab_1')).toBe(true)
    expect(writeBinary).toHaveBeenCalledWith(expect.stringMatching(/^\/p\/\.caret\/screenshots\/shot-.*\.png$/), 'QUJD')
    expect(write.mock.calls[0][1]).toMatch(/^@\.caret\/screenshots\/shot-.*\.png $/)
  })
})
