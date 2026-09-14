/**
 * Build the canonical app keychord (see renderer lib/keybindings.ts:
 * "mod+shift+p") from an Electron `before-input-event` Input. Returns null for
 * key-up events, modifier-only presses, or chords with no modifier at all —
 * plain typing must reach the page untouched.
 */
export function inputToChord(input: {
  type: string
  key: string
  meta?: boolean
  control?: boolean
  alt?: boolean
  shift?: boolean
}): string | null {
  if (input.type !== 'keyDown') return null
  const k = input.key
  if (k === 'Meta' || k === 'Control' || k === 'Shift' || k === 'Alt') return null
  if (!input.meta && !input.control) return null
  const parts: string[] = []
  if (input.meta) parts.push('mod')
  if (input.control) parts.push('ctrl')
  if (input.alt) parts.push('alt')
  if (input.shift) parts.push('shift')
  parts.push(k === ' ' ? 'space' : k.toLowerCase())
  return parts.join('+')
}
