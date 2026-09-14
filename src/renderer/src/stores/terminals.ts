import { create } from 'zustand'
import { uid } from '../lib/id'
import type { ClaudeStatus, WorkspaceState } from '@shared/types'

export interface TerminalTab {
  id: string
  /** null until the renderer spawns a pty for it (also null for restored tabs). */
  ptyId: string | null
  /** Auto-derived label from OSC title / foreground process. */
  label: string
  /** Manual override; when set, auto-title updates are ignored (spec §6). */
  customName?: string
  exited: boolean
  exitCode?: number
  /** Foreground process command (e.g. 'claude') for the tab badge. */
  foreground?: string | null
  /** Live Claude Code state while `foreground === 'claude'` (spec §6 status pulse). */
  claudeStatus?: ClaudeStatus | null
  /** A command to run as soon as the shell spawns (e.g. `claude --resume …`). */
  pendingCommand?: string
  /** Where the terminal is shown: the right panel (default) or a center tab. */
  location?: 'panel' | 'center'
}

// A program can momentarily emit internal markup as its OSC title — e.g. Claude
// Code surfaces `<local-command-caveat>` (and similar `<…>` markers) while running
// a local slash command. These angle-bracket tags are never meaningful tab labels,
// so we ignore them and keep the previous auto label instead of showing raw markup.
const INTERNAL_TAG_TITLE = /^<[/a-z]/i

interface TerminalsStore {
  terminals: TerminalTab[]
  activeId: string | null
  /** Keystrokes typed in any terminal go to every terminal (monorepo fan-out). */
  broadcast: boolean
  /** Terminal whose find bar is open (⌘F with a terminal focused). */
  searchOpenId: string | null
  /** Terminal whose ⓘ info popover is open. */
  infoOpenId: string | null

  addTerminal: (label?: string, opts?: { command?: string }) => string
  /** The view ran the pending command; forget it (so a restart doesn't re-run it). */
  clearPendingCommand: (id: string) => void
  removeTerminal: (id: string) => void
  /** Reorder a terminal tab to a new index (drag-to-rearrange). */
  moveTerminal: (id: string, toIndex: number) => void
  setActive: (id: string) => void
  setPty: (id: string, ptyId: string) => void
  markExited: (ptyId: string, exitCode: number) => void
  /**
   * Respawn an exited terminal in place: clears the pty binding so the view's
   * spawn effect creates a fresh shell in the same tab (scrollback kept).
   * No-op unless the tab has actually exited.
   */
  restart: (id: string) => void
  /** Auto title (OSC / process). Ignored if the tab has a manual custom name. */
  setAutoLabel: (id: string, label: string) => void
  setCustomName: (id: string, name: string) => void
  /** Right-click → "Follow automatic title" (spec §6). */
  clearCustomName: (id: string) => void
  setForeground: (id: string, name: string | null) => void
  setClaudeStatus: (id: string, status: ClaudeStatus | null) => void
  displayLabel: (t: TerminalTab) => string
  setBroadcast: (on: boolean) => void
  setSearchOpen: (id: string | null) => void
  setInfoOpen: (id: string | null) => void
  setLocation: (id: string, location: 'panel' | 'center') => void
  hydrate: (ws: WorkspaceState) => void
}

export const useTerminalsStore = create<TerminalsStore>((set) => ({
  terminals: [],
  activeId: null,
  broadcast: false,
  searchOpenId: null,
  infoOpenId: null,

  addTerminal: (label = 'zsh', opts = {}) => {
    const tab: TerminalTab = {
      id: uid('term'),
      ptyId: null,
      label,
      exited: false,
      foreground: null,
      pendingCommand: opts.command
    }
    set((s) => ({ terminals: [...s.terminals, tab], activeId: tab.id }))
    return tab.id
  },

  clearPendingCommand: (id) =>
    set((s) => ({
      terminals: s.terminals.map((t) => (t.id === id ? { ...t, pendingCommand: undefined } : t))
    })),

  removeTerminal: (id) =>
    set((s) => {
      const idx = s.terminals.findIndex((t) => t.id === id)
      if (idx === -1) return s
      const terminals = s.terminals.filter((t) => t.id !== id)
      const activeId =
        s.activeId === id ? terminals[Math.min(idx, terminals.length - 1)]?.id ?? null : s.activeId
      return { terminals, activeId }
    }),

  moveTerminal: (id, toIndex) =>
    set((s) => {
      const from = s.terminals.findIndex((t) => t.id === id)
      if (from === -1) return s
      const terminals = [...s.terminals]
      const [moved] = terminals.splice(from, 1)
      terminals.splice(Math.max(0, Math.min(toIndex, terminals.length)), 0, moved)
      return { terminals }
    }),

  setActive: (id) => set({ activeId: id }),

  setPty: (id, ptyId) =>
    set((s) => ({ terminals: s.terminals.map((t) => (t.id === id ? { ...t, ptyId } : t)) })),

  markExited: (ptyId, exitCode) =>
    set((s) => ({
      terminals: s.terminals.map((t) =>
        t.ptyId === ptyId ? { ...t, exited: true, exitCode, foreground: null } : t
      )
    })),

  restart: (id) =>
    set((s) => ({
      terminals: s.terminals.map((t) =>
        t.id === id && t.exited
          ? { ...t, ptyId: null, exited: false, exitCode: undefined, foreground: null }
          : t
      )
    })),

  setAutoLabel: (id, label) =>
    set((s) => {
      const clean = label.trim()
      if (!clean || INTERNAL_TAG_TITLE.test(clean)) return s
      return {
        terminals: s.terminals.map((t) =>
          t.id === id && !t.customName ? { ...t, label: clean } : t
        )
      }
    }),

  setCustomName: (id, name) =>
    set((s) => ({
      terminals: s.terminals.map((t) => (t.id === id ? { ...t, customName: name.trim() || undefined } : t))
    })),

  clearCustomName: (id) =>
    set((s) => ({
      terminals: s.terminals.map((t) => (t.id === id ? { ...t, customName: undefined } : t))
    })),

  setForeground: (id, name) =>
    set((s) => ({
      terminals: s.terminals.map((t) =>
        t.id === id
          ? // Status only means something while claude is the foreground process.
            { ...t, foreground: name, claudeStatus: name === 'claude' ? t.claudeStatus : null }
          : t
      )
    })),

  setClaudeStatus: (id, status) =>
    set((s) => ({
      terminals: s.terminals.map((t) => (t.id === id ? { ...t, claudeStatus: status } : t))
    })),

  displayLabel: (t) => t.customName ?? t.label,
  setBroadcast: (broadcast) => set({ broadcast }),
  setSearchOpen: (searchOpenId) => set({ searchOpenId }),
  setInfoOpen: (infoOpenId) => set({ infoOpenId }),
  setLocation: (id, location) =>
    set((s) => ({ terminals: s.terminals.map((t) => (t.id === id ? { ...t, location } : t)) })),

  hydrate: (ws) => {
    // Terminal ptys can't be resurrected (spec §5.4): restore tab labels as fresh sessions.
    const terminals: TerminalTab[] = ws.terminalTabs.map((t) => ({
      id: t.id,
      ptyId: null,
      label: t.label,
      customName: t.customName,
      exited: false,
      foreground: null
    }))
    const restored = ws.activeTerminalId
    const activeId =
      restored && terminals.some((t) => t.id === restored) ? restored : terminals[0]?.id ?? null
    set({ terminals, activeId })
  }
}))
