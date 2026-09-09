// Registry of palette commands (⌘P → "Toggle Right Sidebar", etc.). Each command
// acts on the Zustand stores imperatively via getState(), so the list is a plain
// module-level array with no React dependency.

import { useLayoutStore } from '../stores/layout'
import { useTabsStore } from '../stores/tabs'
import { useTerminalsStore } from '../stores/terminals'
import { getEditor } from './editorBridge'
import { requestCloseTab } from '../hooks/useKeyboardShortcuts'

/** Outline icon name (rendered by CommandIcon in the palette). */
export type CommandIconName =
  | 'panel-left'
  | 'panel-right'
  | 'panel-center'
  | 'globe'
  | 'terminal'
  | 'wrap'
  | 'save'
  | 'close'
  | 'folder'
  | 'refresh'
  | 'folder-open'
  | 'settings'
  | 'code'

export interface Command {
  id: string
  title: string
  icon: CommandIconName
  /** Extra words fuzzy-matched but not shown (synonyms/aliases). */
  keywords?: string
  /**
   * Default keychords bound to this command (canonical form, e.g. "mod+d").
   * A command may have several; users override the set in Settings. Omitted
   * when the command is only reachable from the palette.
   */
  defaultKeybindings?: string[]
  run: () => void
}

export const COMMANDS: Command[] = [
  {
    id: 'toggle-left',
    title: 'Toggle Left Sidebar',
    icon: 'panel-left',
    keywords: 'file browser tree explorer panel',
    defaultKeybindings: ['mod+b'],
    run: () => useLayoutStore.getState().togglePanel('left')
  },
  {
    id: 'toggle-right',
    title: 'Toggle Right Sidebar',
    icon: 'panel-right',
    keywords: 'terminal panel',
    defaultKeybindings: ['mod+j'],
    run: () => useLayoutStore.getState().togglePanel('right')
  },
  {
    id: 'toggle-center',
    title: 'Toggle Center Panel',
    icon: 'panel-center',
    keywords: 'editor browser panel',
    defaultKeybindings: ['mod+e'],
    run: () => useLayoutStore.getState().togglePanel('center')
  },
  {
    id: 'new-browser-tab',
    title: 'New Browser Tab',
    icon: 'globe',
    keywords: 'preview web open',
    defaultKeybindings: ['mod+t'],
    run: () => {
      useTabsStore.getState().newBrowserTab()
      if (!useLayoutStore.getState().centerVisible) useLayoutStore.getState().togglePanel('center')
    }
  },
  {
    id: 'new-terminal-tab',
    title: 'New Terminal Tab',
    icon: 'terminal',
    keywords: 'shell console pty',
    defaultKeybindings: ['mod+d'],
    run: () => {
      useTerminalsStore.getState().addTerminal()
      if (!useLayoutStore.getState().rightVisible) useLayoutStore.getState().togglePanel('right')
    }
  },
  {
    id: 'toggle-word-wrap',
    title: 'Toggle Word Wrap',
    icon: 'wrap',
    keywords: 'editor wrap lines',
    run: () => {
      const s = useLayoutStore.getState()
      s.setWordWrap(!s.wordWrap)
    }
  },
  {
    id: 'save-file',
    title: 'Save File',
    icon: 'save',
    keywords: 'write editor',
    defaultKeybindings: ['mod+s'],
    run: () => {
      const active = useTabsStore.getState().getActive()
      if (active?.kind === 'editor') void getEditor(active.id)?.save()
    }
  },
  {
    id: 'close-tab',
    title: 'Close Tab',
    icon: 'close',
    keywords: 'editor browser',
    defaultKeybindings: ['mod+w'],
    run: () => {
      const id = useTabsStore.getState().activeId
      if (id) void requestCloseTab(id)
    }
  },
  {
    id: 'reveal-in-finder',
    title: 'Reveal Active File in Finder',
    icon: 'folder',
    keywords: 'show explorer open folder',
    run: () => {
      const active = useTabsStore.getState().getActive()
      if (active?.kind === 'editor' && active.filePath) void window.ide.fs.reveal(active.filePath)
    }
  },
  {
    id: 'reload-preview',
    title: 'Reload Browser Preview',
    icon: 'refresh',
    keywords: 'refresh web',
    defaultKeybindings: ['mod+r'],
    run: () => {
      const active = useTabsStore.getState().getActive()
      if (active?.kind === 'browser') void window.ide.browser.reload(active.id)
    }
  },
  {
    id: 'open-project',
    title: 'Open Project…',
    icon: 'folder-open',
    keywords: 'folder window switch',
    defaultKeybindings: ['mod+o'],
    run: () => void window.ide.project.open()
  },
  {
    id: 'open-settings',
    title: 'Edit Settings',
    icon: 'settings',
    keywords: 'preferences options config markdown',
    run: () => {
      useTabsStore.getState().openSingleton('settings')
      if (!useLayoutStore.getState().centerVisible) useLayoutStore.getState().togglePanel('center')
    }
  },
  {
    id: 'open-settings-json',
    title: 'Edit Settings JSON',
    icon: 'code',
    keywords: 'preferences options config raw json',
    run: () => {
      useTabsStore.getState().openSingleton('settingsJson')
      if (!useLayoutStore.getState().centerVisible) useLayoutStore.getState().togglePanel('center')
    }
  }
]

export const COMMANDS_BY_ID: Record<string, Command> = Object.fromEntries(
  COMMANDS.map((c) => [c.id, c])
)

/**
 * Resolve the effective chords for every command: the user's override for a
 * command replaces its defaults entirely (an override of `[]` unbinds it), and
 * a command absent from the override map keeps its defaults.
 */
export function resolveKeybindings(
  overrides: Record<string, string[]>
): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const cmd of COMMANDS) {
    out.set(cmd.id, overrides[cmd.id] ?? cmd.defaultKeybindings ?? [])
  }
  return out
}

/**
 * Invert the resolved bindings into a chord → commandId lookup for dispatch.
 * When two commands claim the same chord the earlier command in COMMANDS wins.
 */
export function chordLookup(overrides: Record<string, string[]>): Map<string, string> {
  const lookup = new Map<string, string>()
  for (const cmd of COMMANDS) {
    const chords = overrides[cmd.id] ?? cmd.defaultKeybindings ?? []
    for (const chord of chords) {
      if (!lookup.has(chord)) lookup.set(chord, cmd.id)
    }
  }
  return lookup
}
