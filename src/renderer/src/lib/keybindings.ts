// Canonical keychord model shared by the global shortcut handler, the command
// palette (shortcut hints) and the Settings keybinding editor.
//
// A "chord" is a lowercase, `+`-joined string of modifier tokens followed by a
// single key, e.g. "mod+d", "mod+shift+t", "mod+r". `mod` is ⌘ on macOS. The
// canonical form is what we persist in settings; `formatChord` renders it for
// display (⌘⇧T).

/** Modifier tokens, in canonical order, that may prefix a chord. */
const MODIFIER_ORDER = ['mod', 'ctrl', 'alt', 'shift'] as const

/** Symbols used to render each modifier token (macOS glyphs). */
const MODIFIER_SYMBOL: Record<string, string> = {
  mod: '⌘',
  ctrl: '⌃',
  alt: '⌥',
  shift: '⇧'
}

/** Pretty labels for non-single-character keys. */
const KEY_LABEL: Record<string, string> = {
  tab: 'Tab',
  enter: '↵',
  escape: 'Esc',
  space: 'Space',
  backspace: '⌫',
  delete: 'Del',
  arrowup: '↑',
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→'
}

/** Normalize the key portion of an event, or null for a modifier-only press. */
function normalizeKey(e: KeyboardEvent): string | null {
  const k = e.key
  if (k === 'Control' || k === 'Shift' || k === 'Alt' || k === 'Meta') return null
  if (k === ' ') return 'space'
  return k.toLowerCase()
}

/**
 * Build the canonical chord for a keydown event, or null if only modifiers are
 * held. `metaKey` maps to `mod` (⌘ on macOS).
 */
export function eventToChord(e: KeyboardEvent): string | null {
  const key = normalizeKey(e)
  if (!key) return null
  const parts: string[] = []
  if (e.metaKey) parts.push('mod')
  if (e.ctrlKey) parts.push('ctrl')
  if (e.altKey) parts.push('alt')
  if (e.shiftKey) parts.push('shift')
  parts.push(key)
  return parts.join('+')
}

/** Render a single key token (already lowercase) for display. */
function labelForKey(key: string): string {
  if (key.length === 1) return key.toUpperCase()
  return KEY_LABEL[key] ?? key.charAt(0).toUpperCase() + key.slice(1)
}

/** Render a canonical chord as display glyphs, e.g. "mod+shift+t" → "⌘⇧T". */
export function formatChord(chord: string): string {
  return chordParts(chord).join('')
}

/**
 * Split a canonical chord into its display tokens, e.g. "mod+shift+t" →
 * ["⌘", "⇧", "T"]. Each token is meant to render as its own keycap.
 */
export function chordParts(chord: string): string[] {
  const tokens = chord.split('+')
  const key = tokens[tokens.length - 1]
  const mods = tokens.slice(0, -1)
  return [...mods.map((m) => MODIFIER_SYMBOL[m] ?? m), labelForKey(key)]
}

/** True when a chord is well-formed: 0+ known modifiers then one key. */
export function isValidChord(chord: string): boolean {
  if (!chord) return false
  const tokens = chord.split('+')
  const key = tokens[tokens.length - 1]
  const mods = tokens.slice(0, -1)
  if (!key) return false
  return mods.every((m) => (MODIFIER_ORDER as readonly string[]).includes(m))
}
