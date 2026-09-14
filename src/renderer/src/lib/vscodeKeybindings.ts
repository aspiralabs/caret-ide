// Import of VS Code `keybindings.json` into Caret's command keybindings.

/** VS Code command id → Caret command id, for the commands both apps have. */
export const VSCODE_COMMAND_MAP: Record<string, string> = {
  'workbench.action.files.save': 'save-file',
  'workbench.action.files.saveAll': 'save-all',
  'workbench.action.closeActiveEditor': 'close-tab',
  'workbench.action.toggleSidebarVisibility': 'toggle-left',
  'workbench.action.togglePanel': 'toggle-right',
  'workbench.action.terminal.new': 'new-terminal-tab',
  'workbench.action.terminal.kill': 'close-terminal',
  'workbench.action.terminal.focusNext': 'next-terminal',
  'workbench.action.terminal.focusPrevious': 'prev-terminal',
  'workbench.action.terminal.focus': 'focus-terminal',
  'workbench.action.terminal.toggleTerminal': 'focus-terminal',
  'workbench.action.focusActiveEditorGroup': 'focus-editor',
  'workbench.action.findInFiles': 'find-in-project',
  'workbench.action.gotoSymbol': 'go-to-symbol',
  'workbench.action.gotoLine': 'go-to-line',
  'actions.find': 'find-in-file',
  'editor.action.formatDocument': 'format-document',
  'workbench.action.zoomIn': 'zoom-in',
  'workbench.action.zoomOut': 'zoom-out',
  'workbench.action.zoomReset': 'zoom-reset',
  'workbench.action.files.openFolder': 'open-project',
  'workbench.action.openSettings': 'open-settings',
  'workbench.action.openSettingsJson': 'open-settings-json',
  'editor.action.toggleWordWrap': 'toggle-word-wrap'
}

const KEY_ALIASES: Record<string, string> = {
  cmd: 'mod',
  meta: 'mod',
  ctrl: 'ctrl',
  control: 'ctrl',
  alt: 'alt',
  option: 'alt',
  shift: 'shift',
  escape: 'escape',
  esc: 'escape',
  enter: 'enter',
  return: 'enter',
  space: 'space',
  tab: 'tab',
  up: 'arrowup',
  down: 'arrowdown',
  left: 'arrowleft',
  right: 'arrowright',
  backspace: 'backspace',
  delete: 'delete',
  oem_1: ';',
  oem_plus: '=',
  oem_minus: '-',
  oem_4: '[',
  oem_6: ']',
  oem_3: '`'
}

/**
 * Convert one VS Code key string (`cmd+shift+p`, `ctrl+k ctrl+s`) into a
 * Caret chord, or null when it can't be represented (chord sequences with a
 * space, unknown tokens).
 */
export function vscodeKeyToChord(key: string): string | null {
  const k = key.trim().toLowerCase()
  if (!k || k.includes(' ')) return null
  const tokens = k.split('+').map((t) => KEY_ALIASES[t] ?? t)
  const mods = tokens.slice(0, -1)
  const last = tokens[tokens.length - 1]
  if (!last || last.length === 0) return null
  const order = ['mod', 'ctrl', 'alt', 'shift']
  if (!mods.every((m) => order.includes(m))) return null
  const sorted = order.filter((m) => mods.includes(m))
  return [...sorted, last].join('+')
}

export interface ImportResult {
  /** commandId → chords to set. */
  bindings: Record<string, string[]>
  /** Entries that were skipped and why. */
  skipped: Array<{ key: string; command: string; reason: string }>
}

/**
 * Parse a VS Code keybindings.json (JSON with comments/trailing commas
 * tolerated) into Caret overrides. `-command` entries (removals) unbind.
 */
export function importVscodeKeybindings(json: string): ImportResult {
  const cleaned = json.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/,\s*([\]}])/g, '$1')
  let entries: unknown
  try {
    entries = JSON.parse(cleaned)
  } catch {
    throw new Error('Not valid keybindings.json')
  }
  if (!Array.isArray(entries)) throw new Error('keybindings.json must be an array')
  const result: ImportResult = { bindings: {}, skipped: [] }
  for (const raw of entries) {
    const e = raw as { key?: unknown; command?: unknown }
    if (typeof e.key !== 'string' || typeof e.command !== 'string') continue
    const remove = e.command.startsWith('-')
    const vsc = remove ? e.command.slice(1) : e.command
    const id = VSCODE_COMMAND_MAP[vsc]
    if (!id) {
      result.skipped.push({ key: e.key, command: e.command, reason: 'no matching Caret command' })
      continue
    }
    const chord = vscodeKeyToChord(e.key)
    if (!chord) {
      result.skipped.push({ key: e.key, command: e.command, reason: 'unsupported key' })
      continue
    }
    const cur = result.bindings[id] ?? []
    result.bindings[id] = remove ? cur.filter((c) => c !== chord) : [...cur.filter((c) => c !== chord), chord]
  }
  return result
}
