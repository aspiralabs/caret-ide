// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handleGlobalKeydown, interceptChords, runChord } from './useKeyboardShortcuts'
import { useLayoutStore } from '../stores/layout'
import { useBrowserFindStore } from '../stores/browserFind'
import { useCommandPaletteStore } from '../stores/commandPalette'
import { useTerminalsStore } from '../stores/terminals'
import { useTabsStore } from '../stores/tabs'
import { TERMINAL_ID_ATTR } from '../lib/terminalActions'

const kill = vi.fn(async () => {})
beforeEach(() => {
  ;(window as unknown as { ide: unknown }).ide = { pty: { kill } }
  kill.mockClear()
  useLayoutStore.setState({ leftVisible: true })
  useCommandPaletteStore.setState({ open: false })
  useTerminalsStore.setState({ terminals: [], activeId: null })
  useTabsStore.setState({ tabs: [], activeId: null })
  useBrowserFindStore.setState({ openTabId: null })
  document.body.innerHTML = ''
})

const cmdB = (): KeyboardEvent =>
  new KeyboardEvent('keydown', { key: 'b', metaKey: true, cancelable: true, bubbles: true })

describe('handleGlobalKeydown', () => {
  it('dispatches a bound chord (⌘B → toggle left sidebar)', () => {
    const e = cmdB()
    handleGlobalKeydown(e)
    expect(useLayoutStore.getState().leftVisible).toBe(false)
    expect(e.defaultPrevented).toBe(true)
  })

  it('ignores a keydown an editor already handled (bug #7)', () => {
    const e = cmdB()
    e.preventDefault() // CodeMirror's Mod-b binding ran first
    handleGlobalKeydown(e)
    expect(useLayoutStore.getState().leftVisible).toBe(true)
  })

  it('does nothing while the palette owns the keys', () => {
    useCommandPaletteStore.setState({ open: true })
    handleGlobalKeydown(cmdB())
    expect(useLayoutStore.getState().leftVisible).toBe(true)
  })

  it('opens the palette on ⌘P / ⌘⇧P', () => {
    handleGlobalKeydown(
      new KeyboardEvent('keydown', { key: 'p', metaKey: true, shiftKey: true, cancelable: true })
    )
    expect(useCommandPaletteStore.getState()).toMatchObject({ open: true, initialQuery: '>' })
  })

  it('⌘W closes the focused terminal instead of the active editor tab (bug #25)', () => {
    const termId = useTerminalsStore.getState().addTerminal()
    useTerminalsStore.getState().setPty(termId, 'pty_1')
    const editorId = useTabsStore.getState().openFile('/p/a.ts')

    const host = document.createElement('div')
    host.setAttribute(TERMINAL_ID_ATTR, termId)
    const textarea = document.createElement('textarea')
    host.appendChild(textarea)
    document.body.appendChild(host)
    textarea.focus()

    handleGlobalKeydown(new KeyboardEvent('keydown', { key: 'w', metaKey: true, cancelable: true }))
    expect(useTerminalsStore.getState().terminals).toHaveLength(0)
    expect(kill).toHaveBeenCalledWith('pty_1')
    // The editor tab is untouched.
    expect(useTabsStore.getState().getById(editorId)).toBeDefined()
  })

  it('⌘W with focus outside a terminal closes the active center tab', () => {
    useTerminalsStore.getState().addTerminal()
    const editorId = useTabsStore.getState().openFile('/p/a.ts')
    handleGlobalKeydown(new KeyboardEvent('keydown', { key: 'w', metaKey: true, cancelable: true }))
    expect(useTabsStore.getState().getById(editorId)).toBeUndefined()
    expect(useTerminalsStore.getState().terminals).toHaveLength(1)
  })
})

describe('runChord / interceptChords (bug #9)', () => {
  it('lists the fixed navigation chords plus every bound command chord', () => {
    const chords = interceptChords({})
    for (const c of ['mod+p', 'mod+shift+p', 'mod+f', 'ctrl+tab', 'ctrl+shift+tab', 'mod+1', 'mod+9']) {
      expect(chords).toContain(c)
    }
    // Default command bindings.
    for (const c of ['mod+r', 'mod+w', 'mod+t', 'mod+s', 'mod+b', 'mod+j', 'mod+e', 'mod+d']) {
      expect(chords).toContain(c)
    }
    // But never the page's own editing chords.
    for (const c of ['mod+c', 'mod+v', 'mod+a', 'mod+z']) expect(chords).not.toContain(c)
  })

  it('reflects user overrides (rebinding reload to ⌘⇧R)', () => {
    const chords = interceptChords({ 'reload-preview': ['mod+shift+r'] })
    expect(chords).toContain('mod+shift+r')
    expect(chords).not.toContain('mod+r')
  })

  it('dispatches a forwarded chord like a window keydown', () => {
    expect(runChord('mod+b')).toBe(true)
    expect(useLayoutStore.getState().leftVisible).toBe(false)
    expect(runChord('mod+z')).toBe(false)
  })

  it('opens find on the forwarded browser tab even when another tab is active', () => {
    const browser = useTabsStore.getState().newBrowserTab('http://localhost:3000')
    useTabsStore.getState().openFile('/p/a.ts') // now active
    expect(runChord('mod+f', browser)).toBe(true)
    expect(useBrowserFindStore.getState().openTabId).toBe(browser)
  })

  it('⌘F without a browser tab falls through (editor keeps its own find)', () => {
    useTabsStore.getState().openFile('/p/a.ts')
    expect(runChord('mod+f')).toBe(false)
  })

  it('⌘1…9 jumps to the Nth tab', () => {
    const a = useTabsStore.getState().openFile('/p/a.ts')
    useTabsStore.getState().openFile('/p/b.ts')
    expect(runChord('mod+1')).toBe(true)
    expect(useTabsStore.getState().activeId).toBe(a)
  })
})
