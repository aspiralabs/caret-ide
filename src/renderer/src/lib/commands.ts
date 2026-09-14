// Registry of palette commands (⌘P → "Toggle Right Sidebar", etc.). Each command
// acts on the Zustand stores imperatively via getState(), so the list is a plain
// module-level array with no React dependency.

import { useLayoutStore } from '../stores/layout'
import { useTabsStore } from '../stores/tabs'
import { useTerminalsStore } from '../stores/terminals'
import { useSettingsStore } from '../stores/settings'
import { getEditor, saveAll } from './editorBridge'
import { zoom } from './zoom'
import { selectionPrompt, sendToClaude } from './sendToClaude'
import { useProjectStore } from '../stores/project'
import { languageForPath } from '../components/editor/language'
import { requestCloseTab } from '../hooks/useKeyboardShortcuts'
import {
  closeTerminal,
  cycleTerminal,
  focusActiveTerminal,
  focusedTerminalId
} from './terminalActions'

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
  | 'terminal-close'
  | 'terminal-next'
  | 'terminal-prev'
  | 'focus-terminal'
  | 'focus-editor'
  | 'save-all'
  | 'revert'
  | 'find'
  | 'goto-line'
  | 'zoom-in'
  | 'zoom-out'
  | 'zoom-reset'
  | 'claude'
  | 'diff'

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
    id: 'close-terminal',
    title: 'Close Terminal',
    icon: 'terminal-close',
    keywords: 'kill shell pty',
    defaultKeybindings: ['mod+shift+w'],
    run: () => {
      const id = focusedTerminalId() ?? useTerminalsStore.getState().activeId
      if (id) closeTerminal(id)
    }
  },
  {
    id: 'next-terminal',
    title: 'Next Terminal',
    icon: 'terminal-next',
    keywords: 'cycle shell tab',
    defaultKeybindings: ['mod+shift+]'],
    run: () => cycleTerminal(1)
  },
  {
    id: 'prev-terminal',
    title: 'Previous Terminal',
    icon: 'terminal-prev',
    keywords: 'cycle shell tab',
    defaultKeybindings: ['mod+shift+['],
    run: () => cycleTerminal(-1)
  },
  {
    id: 'focus-terminal',
    title: 'Focus Terminal',
    icon: 'focus-terminal',
    keywords: 'shell jump cursor',
    defaultKeybindings: ['ctrl+`'],
    run: () => focusActiveTerminal()
  },
  {
    id: 'focus-editor',
    title: 'Focus Editor',
    icon: 'focus-editor',
    keywords: 'jump cursor file',
    defaultKeybindings: ['mod+shift+e'],
    run: () => {
      const layout = useLayoutStore.getState()
      if (!layout.centerVisible) layout.togglePanel('center')
      const active = useTabsStore.getState().getActive()
      if (active) getEditor(active.id)?.focus?.()
    }
  },
  {
    id: 'toggle-word-wrap',
    title: 'Toggle Word Wrap',
    icon: 'wrap',
    keywords: 'editor wrap lines',
    run: () => {
      const s = useSettingsStore.getState()
      void s.update({ wordWrap: !s.settings.wordWrap })
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
    id: 'save-all',
    title: 'Save All',
    icon: 'save-all',
    keywords: 'write every dirty editors',
    defaultKeybindings: ['mod+alt+s'],
    run: () => {
      const dirty = useTabsStore
        .getState()
        .tabs.filter((t) => t.dirty)
        .map((t) => t.id)
      void saveAll(dirty)
    }
  },
  {
    id: 'revert-file',
    title: 'Revert File',
    icon: 'revert',
    keywords: 'discard reload disk undo changes',
    run: () => {
      const active = useTabsStore.getState().getActive()
      if (active?.kind === 'editor' && active.dirty) void getEditor(active.id)?.revert?.()
    }
  },
  {
    id: 'find-in-file',
    title: 'Find in File',
    icon: 'find',
    keywords: 'search editor',
    // ⌘F is claimed inline for browser tabs (find in page); for an editor tab
    // it falls through to this command. When the editor itself has focus its
    // own ⌘F binding handles it first.
    defaultKeybindings: ['mod+f'],
    run: () => {
      const active = useTabsStore.getState().getActive()
      if (active?.kind === 'editor' || active?.kind === 'settingsJson') {
        getEditor(active.id)?.find?.()
      }
    }
  },
  {
    id: 'go-to-line',
    title: 'Go to Line…',
    icon: 'goto-line',
    keywords: 'jump number editor',
    defaultKeybindings: ['mod+g'],
    run: () => {
      const active = useTabsStore.getState().getActive()
      if (active?.kind === 'editor' || active?.kind === 'settingsJson') {
        getEditor(active.id)?.goToLine?.()
      }
    }
  },
  {
    id: 'zoom-in',
    title: 'Zoom In',
    icon: 'zoom-in',
    keywords: 'bigger scale ui preview',
    defaultKeybindings: ['mod+=', 'mod+shift+='],
    run: () => zoom(1)
  },
  {
    id: 'zoom-out',
    title: 'Zoom Out',
    icon: 'zoom-out',
    keywords: 'smaller scale ui preview',
    defaultKeybindings: ['mod+-'],
    run: () => zoom(-1)
  },
  {
    id: 'zoom-reset',
    title: 'Reset Zoom',
    icon: 'zoom-reset',
    keywords: 'actual size 100% scale',
    defaultKeybindings: ['mod+0'],
    run: () => zoom(0)
  },
  {
    id: 'quick-diff',
    title: 'Diff Against HEAD',
    icon: 'diff',
    keywords: 'git compare review changes',
    defaultKeybindings: ['mod+shift+d'],
    run: () => {
      const active = useTabsStore.getState().getActive()
      if ((active?.kind === 'editor' || active?.kind === 'diff') && active.filePath) {
        useTabsStore.getState().openDiff(active.filePath)
      }
    }
  },
  {
    id: 'send-to-claude',
    title: 'Send Selection to Claude Code',
    icon: 'claude',
    keywords: 'prompt reference snippet file mention',
    defaultKeybindings: ['mod+shift+c'],
    run: () => {
      const active = useTabsStore.getState().getActive()
      if (active?.kind !== 'editor' || !active.filePath) return
      const root = useProjectStore.getState().info?.root ?? ''
      const selection = getEditor(active.id)?.getSelection?.() ?? null
      const { marker, body } = selectionPrompt(active.filePath, root, selection, languageForPath(active.filePath))
      sendToClaude(marker, body)
    }
  },
  {
    id: 'close-tab',
    title: 'Close Tab',
    icon: 'close',
    keywords: 'editor browser terminal',
    defaultKeybindings: ['mod+w'],
    run: () => {
      // Context-aware: with a terminal focused, ⌘W closes THAT terminal rather
      // than surprising the user by closing the editor tab behind it.
      const term = focusedTerminalId()
      if (term) {
        closeTerminal(term)
        return
      }
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
