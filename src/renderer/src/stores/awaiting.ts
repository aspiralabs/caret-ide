import { create } from 'zustand'

/**
 * The ptys in this project whose Claude session is waiting on the user
 * (notify-ide → main). Main owns the set and pushes the whole of it on every
 * change; the session tab dot reads it, and typing into a waiting terminal
 * clears it. The project tab dot comes from ProjectTab.awaiting instead.
 */
interface AwaitingStore {
  ptyIds: string[]
  /** Fetch the current set and follow main's updates. Returns the unsubscribe fn. */
  init: () => () => void
  /** The user typed into this pty: drop it locally, then tell main (once per wait). */
  clear: (ptyId: string) => void
}

export const useAwaitingStore = create<AwaitingStore>((set, get) => ({
  ptyIds: [],

  init: () => {
    const off = window.ide.awaiting.onChanged((s) => set({ ptyIds: s.ptyIds }))
    void window.ide.awaiting.get().then((s) => set({ ptyIds: s.ptyIds }))
    return off
  },

  clear: (ptyId) => {
    if (!get().ptyIds.includes(ptyId)) return
    set({ ptyIds: get().ptyIds.filter((id) => id !== ptyId) })
    window.ide.awaiting.clear(ptyId)
  }
}))

/**
 * Whether terminal input came from the user rather than xterm answering the
 * program: focus in/out reports (DECSET 1004, which Claude Code turns on) and
 * device/cursor reports arrive through onData too, and must not clear the dot.
 */
export function isUserInput(data: string): boolean {
  return !/^(\x1b\[[IO]|\x1b\[[?>]?[\d;]*[cRn]|\x1b\][^\x07\x1b]*(\x07|\x1b\\))+$/.test(data)
}
