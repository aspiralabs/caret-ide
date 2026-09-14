// Physical-key normalisation shared by the renderer chord model
// (lib/keybindings.ts) and main's before-input-event forwarding
// (ipc/inputChord.ts), so both sides spell a shifted chord identically.

/**
 * With Shift held, `key` is the shifted glyph (`}` for ⇧], `!` for ⇧1), which
 * would make "mod+shift+]" unmatchable; the key `code` names the key itself.
 */
const CODE_KEY: Record<string, string> = {
  BracketLeft: '[',
  BracketRight: ']',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backslash: '\\'
}

/** Canonical key for a physical key code, or null when we don't map it. */
export function keyFromCode(code: string | undefined): string | null {
  if (!code) return null
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase()
  if (/^Digit[0-9]$/.test(code)) return code.slice(5)
  return CODE_KEY[code] ?? null
}

/**
 * The canonical key token for a keydown: modifier-only presses → null, space →
 * "space", shifted single characters → the physical key, else lowercase `key`.
 */
export function canonicalKey(key: string, code: string | undefined, shift: boolean): string | null {
  if (key === 'Control' || key === 'Shift' || key === 'Alt' || key === 'Meta') return null
  if (key === ' ') return 'space'
  if (shift && key.length === 1) {
    const fromCode = keyFromCode(code)
    if (fromCode) return fromCode
  }
  return key.toLowerCase()
}
