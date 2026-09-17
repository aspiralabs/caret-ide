// Terminal mode (spec: docs/specs/terminal-mode.md). A terminal-mode window
// is a project window rooted at `~` that boots into the terminal-only layout;
// "Switch to IDE" adopts the shell's cwd as a workspace root and reveals the
// panels. Everything here acts on the stores imperatively so both the
// command registry and React components can call it.

import { terminalPreset, TERMINAL_PRESET_ID } from '@shared/types'
import { useLayoutStore } from '../stores/layout'
import { useProjectStore } from '../stores/project'
import { useSettingsStore } from '../stores/settings'

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
