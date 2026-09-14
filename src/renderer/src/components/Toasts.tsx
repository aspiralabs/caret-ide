import { X } from 'lucide-react'
import { useToastStore } from '../stores/toast'

/** Bottom-right stack of transient notices (see stores/toast). */
export default function Toasts(): JSX.Element | null {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)
  if (toasts.length === 0) return null
  return (
    <div className="pointer-events-none fixed bottom-12 right-4 z-[70] flex flex-col items-end gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className="pointer-events-auto flex max-w-md items-center gap-3 rounded-lg border border-ink-border bg-ink-elevated/95 px-3 py-2 text-xs text-ink-text shadow-lg backdrop-blur"
        >
          <span className="min-w-0 truncate">{t.message}</span>
          {t.action && (
            <button
              onClick={() => {
                t.action?.run()
                dismiss(t.id)
              }}
              className="shrink-0 rounded bg-ink-accent px-2 py-0.5 font-medium text-white hover:brightness-110"
            >
              {t.action.label}
            </button>
          )}
          <button
            aria-label="Dismiss"
            onClick={() => dismiss(t.id)}
            className="shrink-0 rounded p-0.5 text-ink-muted hover:text-ink-text"
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}
