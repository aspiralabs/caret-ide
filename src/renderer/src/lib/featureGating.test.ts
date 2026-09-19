// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { defaultSettings, normalizeSettings } from '@shared/types'
import { useSettingsStore } from '../stores/settings'
import { activeCommands, chordLookup, COMMANDS_BY_ID, resolveKeybindings } from './commands'
import { buildMenuSpec, tidyItems } from './menuSpec'

function setFlags(features: Record<string, boolean>): void {
  const settings = normalizeSettings({ features })
  useSettingsStore.setState({ settings, global: settings })
}

afterEach(() => {
  const settings = defaultSettings()
  useSettingsStore.setState({ settings, global: settings })
})

describe('feature-flagged commands', () => {
  it('are absent from the palette list, keybindings and chord dispatch while off', () => {
    const ids = activeCommands().map((c) => c.id)
    expect(ids).not.toContain('switch-to-ide')
    expect(ids).not.toContain('apply-terminal-layout')
    expect(ids).not.toContain('new-terminal-window')
    expect(ids).not.toContain('check-for-updates')
    expect(resolveKeybindings({}).has('switch-to-ide')).toBe(false)
    // ⌘⇧I / ⌘⇧T are free for the user while terminal mode is hidden.
    expect(chordLookup({}).get('mod+shift+i')).toBeUndefined()
    expect(chordLookup({}).get('mod+shift+t')).toBeUndefined()
    // The registry itself still knows the command (menu clicks resolve by id).
    expect(COMMANDS_BY_ID['switch-to-ide']).toBeDefined()
  })

  it('come back when the flag is on', () => {
    setFlags({ terminalMode: true, checkForUpdates: true })
    const ids = activeCommands().map((c) => c.id)
    expect(ids).toContain('switch-to-ide')
    expect(ids).toContain('check-for-updates')
    expect(chordLookup({}).get('mod+shift+i')).toBe('switch-to-ide')
    expect(chordLookup({}).get('mod+shift+t')).toBe('apply-terminal-layout')
  })
})

describe('feature-flagged menu items', () => {
  const itemIds = (label: string): string[] =>
    buildMenuSpec({})
      .find((m) => m.label === label)!
      .items.map((i) => (i.type === 'command' ? i.id : i.type === 'separator' ? '---' : `role:${i.role}`))

  it('drop the gated items and never leave doubled separators', () => {
    expect(itemIds('File')).not.toContain('new-terminal-window')
    expect(itemIds('View')).not.toContain('switch-to-ide')
    expect(itemIds('View')).not.toContain('apply-terminal-layout')
    expect(itemIds('View')).not.toContain('check-for-updates')
    for (const label of ['File', 'View', 'Go', 'Terminal', 'Claude']) {
      const ids = itemIds(label)
      expect(ids[0]).not.toBe('---')
      expect(ids[ids.length - 1]).not.toBe('---')
      for (let i = 1; i < ids.length; i++) expect(ids[i] === '---' && ids[i - 1] === '---').toBe(false)
    }
  })

  it('show them again with the flags on', () => {
    setFlags({ terminalMode: true, checkForUpdates: true })
    expect(itemIds('File')).toContain('new-terminal-window')
    expect(itemIds('View')).toContain('switch-to-ide')
    expect(itemIds('View')).toContain('check-for-updates')
  })

  it('tidyItems collapses separators around removed items', () => {
    const sep = { type: 'separator' as const }
    const a = { type: 'command' as const, id: 'a', label: 'A' }
    const b = { type: 'command' as const, id: 'b', label: 'B' }
    expect(tidyItems([sep, a, null, sep, sep, null, b, sep, null])).toEqual([a, sep, b])
    expect(tidyItems([null, sep])).toEqual([])
  })
})
