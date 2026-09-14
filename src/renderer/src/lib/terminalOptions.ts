import type { AppSettings } from '@shared/types'
import type { TerminalTab } from '../stores/terminals'

/** The bundled monospace stack; a user font family is prepended when set. */
export const DEFAULT_TERMINAL_FONT = "'JetBrainsMono Nerd Font', SFMono-Regular, Menlo, Monaco, Consolas, monospace"

/** xterm options derived from settings (applied live via `term.options`). */
export function terminalOptionsFromSettings(
  s: Pick<AppSettings, 'terminalFontSize' | 'terminalFontFamily' | 'terminalCursorStyle' | 'terminalCursorBlink' | 'terminalScrollback'>
): { fontSize: number; fontFamily: string; cursorStyle: 'block' | 'underline' | 'bar'; cursorBlink: boolean; scrollback: number } {
  const family = s.terminalFontFamily.trim()
  return {
    fontSize: s.terminalFontSize,
    fontFamily: family ? `'${family.replace(/'/g, '')}', ${DEFAULT_TERMINAL_FONT}` : DEFAULT_TERMINAL_FONT,
    cursorStyle: s.terminalCursorStyle,
    cursorBlink: s.terminalCursorBlink,
    scrollback: s.terminalScrollback
  }
}

/** With broadcast on, the pty ids input should be written to besides the typing terminal's own. */
export function broadcastTargets(terminals: ReadonlyArray<TerminalTab>, selfPtyId: string | null): string[] {
  return terminals.filter((t) => t.ptyId && !t.exited && t.ptyId !== selfPtyId).map((t) => t.ptyId as string)
}
