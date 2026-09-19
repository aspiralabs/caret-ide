import type { MenuItemSpec, MenuSpec } from '@shared/menu'
import { COMMANDS_BY_ID, commandAvailable, resolveKeybindings } from './commands'

/**
 * The application menu, expressed with Caret command ids. Chords come from
 * the live keybindings, so the menu doubles as discoverable shortcut docs and
 * follows the user's rebinds. Fixed navigation chords (palette, tab jumps)
 * are listed with their fixed chords.
 */
/**
 * Chords the editors handle themselves first (CodeMirror ⌘B/⌘I bold/italic,
 * Monaco ⌘D add-cursor). A native accelerator would beat the page, so these
 * menu items carry no accelerator and the window keydown path keeps routing
 * them contextually.
 */
export const EDITOR_FIRST_CHORDS = new Set(['mod+b', 'mod+i', 'mod+d'])

/**
 * Drop items whose command is gated off by a feature flag, then tidy the
 * separators that leaves behind (none leading, trailing or doubled).
 */
export function tidyItems(items: Array<MenuItemSpec | null>): MenuItemSpec[] {
  const out: MenuItemSpec[] = []
  for (const item of items) {
    if (!item) continue
    if (item.type === 'separator' && (out.length === 0 || out[out.length - 1].type === 'separator')) continue
    out.push(item)
  }
  while (out.length && out[out.length - 1].type === 'separator') out.pop()
  return out
}

export function buildMenuSpec(overrides: Record<string, string[]>): MenuSpec[] {
  const bindings = resolveKeybindings(overrides)
  const cmd = (id: string, label?: string, chord?: string): MenuItemSpec | null => {
    const command = COMMANDS_BY_ID[id]
    if (command && !commandAvailable(command)) return null
    const c = chord ?? bindings.get(id)?.[0]
    return {
      type: 'command',
      id,
      label: label ?? command?.title ?? id,
      chord: c && !EDITOR_FIRST_CHORDS.has(c) ? c : undefined
    }
  }
  const sep: MenuItemSpec = { type: 'separator' }
  const menus: Array<{ label: string; role?: MenuSpec['role']; items: Array<MenuItemSpec | null> }> = [
    { label: 'Caret', role: 'appMenu', items: [] },
    {
      label: 'File',
      items: [
        cmd('new-file', 'New File…'),
        cmd('new-folder', 'New Folder…'),
        cmd('new-terminal-window'),
        cmd('open-project', 'Open Project…'),
        sep,
        cmd('save-file', 'Save'),
        cmd('save-all'),
        cmd('revert-file'),
        cmd('format-document'),
        sep,
        cmd('close-tab'),
        { type: 'role', role: 'close', label: 'Close Window', accelerator: 'CmdOrCtrl+Shift+W' }
      ]
    },
    { label: 'Edit', role: 'editMenu', items: [] },
    {
      label: 'View',
      items: [
        cmd('toggle-left', 'Toggle File Explorer'),
        cmd('toggle-center', 'Toggle Editor Area'),
        cmd('toggle-right', 'Toggle Terminal Panel'),
        cmd('switch-to-ide'),
        cmd('apply-terminal-layout', 'Terminal Only'),
        sep,
        cmd('zoom-in'),
        cmd('zoom-out'),
        cmd('zoom-reset', 'Actual Size'),
        sep,
        cmd('toggle-word-wrap'),
        cmd('open-settings', 'Settings…'),
        cmd('check-for-updates'),
        sep,
        { type: 'role', role: 'forceReload', label: 'Force Reload App', accelerator: 'Alt+CmdOrCtrl+R' },
        { type: 'role', role: 'toggleDevTools', label: 'App Developer Tools' },
        sep,
        { type: 'role', role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Go',
      items: [
        cmd('command-palette', 'Command Palette…', 'mod+shift+p'),
        cmd('quick-open', 'Go to File…', 'mod+p'),
        cmd('go-to-symbol'),
        cmd('go-to-line'),
        cmd('find-in-file'),
        cmd('find-in-project'),
        sep,
        cmd('next-tab', 'Next Tab', 'ctrl+tab'),
        cmd('prev-tab', 'Previous Tab', 'ctrl+shift+tab'),
        cmd('focus-editor'),
        cmd('focus-terminal')
      ]
    },
    {
      label: 'Terminal',
      items: [
        cmd('new-terminal-tab', 'New Terminal'),
        cmd('close-terminal'),
        cmd('next-terminal'),
        cmd('prev-terminal'),
        sep,
        cmd('terminal-prev-command'),
        cmd('terminal-next-command'),
        cmd('terminal-rerun-last')
      ]
    },
    {
      label: 'Claude',
      items: [
        cmd('send-to-claude'),
        cmd('open-scratchpad'),
        cmd('quick-diff'),
        sep,
        cmd('new-browser-tab'),
        cmd('reload-preview')
      ]
    },
    { label: 'Window', role: 'windowMenu', items: [] }
  ]
  return menus.map((m) => ({ ...m, items: tidyItems(m.items) }))
}
