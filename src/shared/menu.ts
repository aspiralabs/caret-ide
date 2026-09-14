// Application-menu spec shared between renderer (which knows the command
// registry + the user's keybindings) and main (which builds the native menu).

export interface MenuCommandItem {
  type: 'command'
  /** Caret command id, or a fixed chord's id (e.g. 'command-palette'). */
  id: string
  label: string
  /** Canonical chord ("mod+shift+p"); becomes the accelerator. */
  chord?: string
}
export interface MenuRoleItem {
  type: 'role'
  role: string
  label?: string
  accelerator?: string
}
export type MenuItemSpec = MenuCommandItem | MenuRoleItem | { type: 'separator' }
export interface MenuSpec {
  label: string
  role?: 'appMenu' | 'editMenu' | 'windowMenu'
  items: MenuItemSpec[]
}

/** What main sends back when a menu item is clicked. */
export interface MenuCommandEvent {
  id: string
  chord?: string
}

const KEY_NAMES: Record<string, string> = {
  arrowup: 'Up',
  arrowdown: 'Down',
  arrowleft: 'Left',
  arrowright: 'Right',
  escape: 'Esc',
  enter: 'Return',
  space: 'Space',
  tab: 'Tab',
  backspace: 'Backspace',
  delete: 'Delete',
  '`': '`',
  '=': '=',
  '-': '-',
  '[': '[',
  ']': ']'
}

/** Canonical chord → Electron accelerator ("mod+shift+p" → "CmdOrCtrl+Shift+P"). */
export function chordToAccelerator(chord: string): string | null {
  const parts = chord.split('+')
  const key = parts[parts.length - 1]
  const mods = parts.slice(0, -1)
  const out: string[] = []
  for (const m of mods) {
    if (m === 'mod') out.push('CmdOrCtrl')
    else if (m === 'ctrl') out.push('Control')
    else if (m === 'alt') out.push('Alt')
    else if (m === 'shift') out.push('Shift')
    else return null
  }
  const k = KEY_NAMES[key] ?? (key.length === 1 ? key.toUpperCase() : null)
  if (!k) return null
  return [...out, k].join('+')
}
