import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// --- electron mock ----------------------------------------------------------
// Capture ipcMain.handle registrations so the test can invoke handlers
// directly, and record broadcasts to a fake window.
const handlers = new Map<string, (...args: unknown[]) => unknown>()
const sent: Array<{ channel: string; payload: unknown }> = []
let userData = ''

vi.mock('electron', () => ({
  app: { getPath: () => userData },
  BrowserWindow: {
    getAllWindows: () => [
      {
        isDestroyed: () => false,
        webContents: { send: (channel: string, payload: unknown) => sent.push({ channel, payload }) }
      }
    ]
  },
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => handlers.set(channel, fn)
  }
}))

import { IPC } from '../../shared/ipc'
import { _resetSettingsCache, mergePatch, parseLenient, parseStrict, registerSettingsIpc } from './settings'

const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> =>
  handlers.get(channel)!({}, ...args) as Promise<T>

const file = (): string => join(userData, 'settings.json')

describe('settings core parsing', () => {
  beforeEach(() => _resetSettingsCache())

  it('parseStrict throws on invalid JSON and non-object roots', () => {
    expect(() => parseStrict('{')).toThrow()
    expect(() => parseStrict('[]')).toThrow()
    expect(() => parseStrict('null')).toThrow()
    expect(() => parseStrict('"x"')).toThrow()
    expect(parseStrict('{"a":1}')).toEqual({ a: 1 })
  })

  it('parseLenient falls back to the last-good object instead of {}', () => {
    expect(parseLenient('{"theme":"dark","keybindings":{"x":["mod+x"]}}')).toEqual({
      theme: 'dark',
      keybindings: { x: ['mod+x'] }
    })
    expect(parseLenient('{ broken')).toEqual({ theme: 'dark', keybindings: { x: ['mod+x'] } })
  })

  it('parseLenient returns {} when nothing ever parsed', () => {
    expect(parseLenient('nope')).toEqual({})
  })

  it('mergePatch merges over last-good when the file is broken (bug #5)', () => {
    parseLenient('{"theme":"dark","layoutPresets":[{"id":"p"}]}')
    expect(mergePatch('{ trailing, }', { theme: 'light' })).toEqual({
      theme: 'light',
      layoutPresets: [{ id: 'p' }]
    })
  })
})

describe('settings IPC handlers', () => {
  beforeEach(() => {
    userData = mkdtempSync(join(tmpdir(), 'caret-settings-'))
    handlers.clear()
    sent.length = 0
    _resetSettingsCache()
    // Pre-create the file so registerSettingsIpc's async ensureFile() never
    // races the per-test writeFileSync below.
    writeFileSync(file(), '{}')
    registerSettingsIpc()
  })
  afterEach(() => rmSync(userData, { recursive: true, force: true }))

  it('setRaw with invalid JSON reports ok:false and does not broadcast', async () => {
    writeFileSync(file(), '{"theme":"dark"}')
    const res = await invoke<{ ok: boolean; error?: string }>(IPC.settingsSetRaw, '{ "theme": ')
    expect(res.ok).toBe(false)
    expect(res.error).toBeTruthy()
    expect(sent).toHaveLength(0)
    // The user's text is still persisted (it's their file).
    expect(readFileSync(file(), 'utf8')).toBe('{ "theme": ')
  })

  it('setRaw with valid JSON broadcasts the parsed object', async () => {
    const res = await invoke<{ ok: boolean }>(IPC.settingsSetRaw, '{"theme":"light"}')
    expect(res.ok).toBe(true)
    expect(sent).toEqual([{ channel: IPC.evtSettingsChanged, payload: { theme: 'light' } }])
  })

  it('update after an invalid save keeps every other key (bug #5)', async () => {
    writeFileSync(
      file(),
      JSON.stringify({ theme: 'dark', keybindings: { 'save-file': ['mod+s'] }, layoutPresets: [] })
    )
    // Seed last-good by reading once (as the app does at boot).
    await invoke(IPC.settingsGet)
    // User saves broken JSON from the JSON tab.
    await invoke(IPC.settingsSetRaw, '{ "theme": "light", ')
    // Then flips a switch in the Settings UI.
    const next = await invoke<Record<string, unknown>>(IPC.settingsUpdate, { statusBarVisible: false })
    expect(next).toEqual({
      theme: 'dark',
      keybindings: { 'save-file': ['mod+s'] },
      layoutPresets: [],
      statusBarVisible: false
    })
    expect(JSON.parse(readFileSync(file(), 'utf8'))).toEqual(next)
  })

  it('get returns last-good when the file on disk is broken', async () => {
    writeFileSync(file(), '{"theme":"dark"}')
    expect(await invoke(IPC.settingsGet)).toEqual({ theme: 'dark' })
    writeFileSync(file(), '{"theme":')
    expect(await invoke(IPC.settingsGet)).toEqual({ theme: 'dark' })
  })

  it('get creates the file with defaults when missing', async () => {
    rmSync(file())
    const s = await invoke<Record<string, unknown>>(IPC.settingsGet)
    expect(s.theme).toBe('system')
    expect(readFileSync(file(), 'utf8')).toContain('"theme"')
  })
})
