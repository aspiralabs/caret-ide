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
 * Window-close guard: prompt for every dirty editor tab (Save / Don't Save /
 * Cancel, same dialog as ⌘W). Resolves true when the window may close, false
 * when the user cancelled at any point. Saves happen as the user answers, so a
 * cancel midway leaves the earlier files saved and the rest untouched.
 */
export async function confirmCloseAllDirty(): Promise<boolean> {
  const tabs = useTabsStore.getState()
  const dirty = tabs.tabs.filter(
    (t) => (t.kind === 'editor' || t.kind === 'settingsJson') && t.dirty
  )
  for (const tab of dirty) {
    // Make the tab visible so the user can see what they're deciding about.
    tabs.setActive(tab.id)
    const choice = await window.ide.dialog.confirmClose(tab.title)
    if (choice === 'cancel') return false
    if (choice === 'save') {
      const editor = getEditor(tab.id)
      if (!editor) return false
      try {
        await editor.save()
      } catch {
        return false
      }
    }
  }
  return true
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
    window.addEventListener('keydown', handleGlobalKeydown)
    return () => window.removeEventListener('keydown', handleGlobalKeydown)
  }, [])
}

/**
 * The window-level keydown handler. Exported so it can be unit-tested without
 * mounting React.
 */
export function handleGlobalKeydown(e: KeyboardEvent): void {
  // A focused editor (CodeMirror ⌘B/⌘S, Monaco ⌘S) or xterm that already
  // consumed this key has called preventDefault — don't dispatch the same
  // chord a second time (⌘B would bold AND hide the sidebar; ⌘S would save
  // twice).
  if (e.defaultPrevented) return
  const chord = eventToChord(e)
  if (!chord) return
  if (runChord(chord)) e.preventDefault()
}

/** The fixed navigation chords handled inline below (not rebindable). */
const FIXED_CHORDS = [
  'mod+p',
  'mod+shift+p',
  'mod+f',
  'ctrl+tab',
  'ctrl+shift+tab',
  ...Array.from({ length: 9 }, (_, i) => `mod+${i + 1}`)
]

/**
 * Every chord the app reacts to, given the user's keybinding overrides — the
 * fixed navigation chords plus each bound command. Main intercepts exactly
 * these while a browser preview page has focus (see BrowserManager), so the
 * page keeps ⌘C/⌘V/⌘Z and the app keeps ⌘R/⌘W/⌘T/….
 */
export function interceptChords(overrides: Record<string, string[]>): string[] {
  return [...new Set([...FIXED_CHORDS, ...chordLookup(overrides).keys()])]
}

/**
 * Dispatch a canonical chord ("mod+shift+p"). Returns true when something
 * handled it. `browserTabId` is the preview tab a forwarded chord came from,
 * so ⌘F opens find on THAT tab even if the store's active tab differs.
 */
export function runChord(chord: string, browserTabId?: string): boolean {
  // ⌘P / ⌘⇧P — open the command palette (⇧ jumps straight to commands).
  if (chord === 'mod+p' || chord === 'mod+shift+p') {
    useCommandPaletteStore.getState().openPalette(chord === 'mod+shift+p' ? '>' : '')
    return true
  }

  // While the palette is open it owns all keys (it handles its own nav/close).
  if (useCommandPaletteStore.getState().open) return false

  // ⌃Tab / ⌃⇧Tab — cycle center tabs
  if (chord === 'ctrl+tab' || chord === 'ctrl+shift+tab') {
    useTabsStore.getState().cycle(chord === 'ctrl+tab' ? 1 : -1)
    return true
  }

  // ⌘1..9 — jump to center tab N
  const jump = /^mod\+([1-9])$/.exec(chord)
  if (jump) {
    useTabsStore.getState().activateIndex(Number(jump[1]) - 1)
    return true
  }

  // ⌘F — find in the active browser page. Handled inline (not via the command
  // registry) so it ONLY fires for a browser tab; on any other tab we fall
  // through to the bindings (find-in-file for editors). When the native page
  // itself has focus, main forwards ⌘F here with its tab id — otherwise this
  // covers focus being in the app chrome / URL bar.
  if (chord === 'mod+f') {
    const target = browserTabId
      ? useTabsStore.getState().getById(browserTabId)
      : useTabsStore.getState().getActive()
    if (target?.kind === 'browser') {
      useBrowserFindStore.getState().open(target.id)
      return true
    }
  }

  // Data-driven command bindings.
  const commandId = chordLookup(useSettingsStore.getState().settings.keybindings).get(chord)
  if (!commandId) return false
  const command = COMMANDS_BY_ID[commandId]
  if (!command) return false
  command.run()
  return true
}
