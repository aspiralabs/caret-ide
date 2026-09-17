// Terminal mode (spec: docs/specs/terminal-mode.md). A terminal-mode window
// is a project window rooted at `~` that boots into the terminal-only layout;
// "Switch to IDE" adopts the shell's cwd as a workspace root and reveals the
// panels. Everything here acts on the stores imperatively so both the
// command registry and React components can call it.

import { terminalPreset, TERMINAL_PRESET_ID } from '@shared/types'
import { useLayoutStore } from '../stores/layout'
import { useProjectStore } from '../stores/project'
import { useSettingsStore } from '../stores/settings'
import { useTerminalsStore } from '../stores/terminals'
import { basename } from './path'

export function isTerminalMode(): boolean {
  return useProjectStore.getState().mode === 'terminal'
}

/**
 * Collapse to the terminal-only layout. Uses the user's Terminal preset when
 * it still exists (they may have tweaked it), else the built-in shape — so
 * ⌘⇧T and boot keep working after the preset is deleted (AC21).
 */
export function applyTerminalLayout(): void {
  const preset =
    useSettingsStore.getState().settings.layoutPresets.find((p) => p.id === TERMINAL_PRESET_ID) ?? terminalPreset()
  useLayoutStore.getState().applyPreset(preset)
}

/**
 * Window title for a terminal-mode window (spec §3.5 / AC8): the active
 * shell's cwd basename, `~` at home, "Terminal" before the first prompt.
 * Claude's own OSC titles go to the tab label, never here.
 */
export function terminalWindowTitle(cwd: string | undefined, home: string): string {
  if (!cwd) return 'Terminal'
  if (cwd === home) return '~'
  return basename(cwd) || cwd
}

/** Keep document.title in step with the active terminal's cwd. Returns an unsubscribe fn. */
export function trackTerminalWindowTitle(home: string): () => void {
  const apply = (): void => {
    const s = useTerminalsStore.getState()
    const active = s.terminals.find((t) => t.id === s.activeId)
    document.title = terminalWindowTitle(active?.cwd, home)
  }
  apply()
  return useTerminalsStore.subscribe(apply)
}
