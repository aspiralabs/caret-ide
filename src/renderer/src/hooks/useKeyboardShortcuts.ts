import { useEffect } from 'react'
import { useTabsStore } from '../stores/tabs'
import { useCommandPaletteStore } from '../stores/commandPalette'
import { useSettingsStore } from '../stores/settings'
import { useBrowserFindStore } from '../stores/browserFind'
import { getEditor } from '../lib/editorBridge'
import { COMMANDS_BY_ID, chordLookup } from '../lib/commands'
import { eventToChord } from '../lib/keybindings'

/** Attempt to close a center tab, prompting if an editor buffer is dirty. */
export async function requestCloseTab(id: string): Promise<void> {
  const tabs = useTabsStore.getState()
  const tab = tabs.getById(id)
  if (!tab) return
  if ((tab.kind === 'editor' || tab.kind === 'settingsJson') && tab.dirty) {
    const choice = await window.ide.dialog.confirmClose(tab.title)
    if (choice === 'cancel') return
    if (choice === 'save') {
      // Save through the editor bridge before closing; abort the close if the
      // editor is somehow gone (can't safely discard) or the write fails.
      const editor = getEditor(id)
      if (!editor) return
      try {
        await editor.save()
      } catch {
        return
      }
    }
    // 'dontSave' falls through and closes, discarding the buffer.
  }
  tabs.closeTab(id)
}

/**
 * Global keyboard shortcuts (spec §8). Registered once at the app root.
 *
 * A few navigation chords are fixed and handled inline below (command palette,
 * ⌘1..9 tab jumps, ⌃Tab cycling). Everything else is data-driven: the active
 * bindings are resolved from the command registry overlaid with the user's
 * Settings overrides, so rebinds take effect live without a reload.
 */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const meta = e.metaKey
      const ctrl = e.ctrlKey
      const shift = e.shiftKey
      const key = e.key

      // ⌘P / ⌘⇧P — open the command palette (⇧ jumps straight to commands).
      if (meta && key.toLowerCase() === 'p') {
        e.preventDefault()
        useCommandPaletteStore.getState().openPalette(shift ? '>' : '')
        return
      }

      // While the palette is open it owns all keys (it handles its own nav/close).
      if (useCommandPaletteStore.getState().open) return

      // ⌃Tab / ⌃⇧Tab — cycle center tabs
      if (ctrl && key === 'Tab') {
        e.preventDefault()
        useTabsStore.getState().cycle(shift ? -1 : 1)
        return
      }

      // ⌘1..9 — jump to center tab N
      if (meta && !shift && key >= '1' && key <= '9') {
        e.preventDefault()
        useTabsStore.getState().activateIndex(Number(key) - 1)
        return
      }

      // ⌘F — find in the active browser page. Handled inline (not via the command
      // registry) so it ONLY fires for a browser tab; on any other tab we fall
      // through and let the editor's own find widget claim the key. When the
      // native page itself has focus, main intercepts ⌘F instead (before-input-
      // event) — this branch covers focus being in the app chrome / URL bar.
      if (meta && !ctrl && !shift && key.toLowerCase() === 'f') {
        const active = useTabsStore.getState().getActive()
        if (active?.kind === 'browser') {
          e.preventDefault()
          useBrowserFindStore.getState().open(active.id)
          return
        }
      }

      // Data-driven command bindings.
      const chord = eventToChord(e)
      if (!chord) return
      const commandId = chordLookup(useSettingsStore.getState().settings.keybindings).get(chord)
      if (!commandId) return
      const command = COMMANDS_BY_ID[commandId]
      if (!command) return
      e.preventDefault()
      command.run()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
