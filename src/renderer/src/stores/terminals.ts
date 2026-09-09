import { create } from 'zustand'
import { uid } from '../lib/id'
import type { WorkspaceState } from '@shared/types'

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
}

interface TerminalsStore {
  terminals: TerminalTab[]
  activeId: string | null

  addTerminal: (label?: string) => string
  removeTerminal: (id: string) => void
  /** Reorder a terminal tab to a new index (drag-to-rearrange). */
  moveTerminal: (id: string, toIndex: number) => void
  setActive: (id: string) => void
  setPty: (id: string, ptyId: string) => void
  markExited: (ptyId: string, exitCode: number) => void
  /** Auto title (OSC / process). Ignored if the tab has a manual custom name. */
  setAutoLabel: (id: string, label: string) => void
  setCustomName: (id: string, name: string) => void
  /** Right-click → "Follow automatic title" (spec §6). */
  clearCustomName: (id: string) => void
  setForeground: (id: string, name: string | null) => void
  displayLabel: (t: TerminalTab) => string
  hydrate: (ws: WorkspaceState) => void
}

export const useTerminalsStore = create<TerminalsStore>((set) => ({
  terminals: [],
  activeId: null,

  addTerminal: (label = 'zsh') => {
    const tab: TerminalTab = { id: uid('term'), ptyId: null, label, exited: false, foreground: null }
    set((s) => ({ terminals: [...s.terminals, tab], activeId: tab.id }))
    return tab.id
  },

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

  setAutoLabel: (id, label) =>
    set((s) => ({
      terminals: s.terminals.map((t) =>
        t.id === id && !t.customName && label.trim() ? { ...t, label: label.trim() } : t
      )
    })),

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
      terminals: s.terminals.map((t) => (t.id === id ? { ...t, foreground: name } : t))
    })),

  displayLabel: (t) => t.customName ?? t.label,

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
    set({ terminals, activeId: terminals[0]?.id ?? null })
  }
}))
