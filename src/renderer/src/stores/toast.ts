import { create } from 'zustand'

export interface Toast {
  id: number
  message: string
  /** Optional call-to-action button. */
  action?: { label: string; run: () => void }
}

interface ToastStore {
  toasts: Toast[]
  /** Show a transient message (default 5 s; 0 = until dismissed). Returns its id. */
  show: (message: string, opts?: { action?: Toast['action']; ttlMs?: number }) => number
  dismiss: (id: number) => void
}

let nextId = 1
const timers = new Map<number, ReturnType<typeof setTimeout>>()

/** Small bottom-right notices (send-to-Claude feedback, "open dev server" offers). */
export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  show: (message, opts = {}) => {
    const id = nextId++
    const toast: Toast = { id, message, action: opts.action }
    set((s) => ({ toasts: [...s.toasts, toast] }))
    const ttl = opts.ttlMs ?? 5000
    if (ttl > 0) timers.set(id, setTimeout(() => get().dismiss(id), ttl))
    return id
  },
  dismiss: (id) => {
    const t = timers.get(id)
    if (t) clearTimeout(t)
    timers.delete(id)
    set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }))
  }
}))
