import { useLayoutStore, layoutMatchesPreset } from '../stores/layout'
import { useSettingsStore } from '../stores/settings'
import { cn } from '../lib/cn'

/**
 * Title-bar layout switcher (top-left). A segmented control with one segment per
 * saved layout preset; clicking one applies its panel visibility + split flags.
 * The active segment is the preset whose captured fields match the live layout
 * (so manual panel toggles are reflected too). Presets are managed on the
 * Settings page. Renders nothing when there are no presets.
 */
export default function LayoutPresetSwitcher(): JSX.Element | null {
  const presets = useSettingsStore((s) => s.settings.layoutPresets)
  const applyPreset = useLayoutStore((s) => s.applyPreset)
  // Select primitives individually — returning a fresh object from the selector
  // would change identity every render and spin an infinite update loop.
  const leftVisible = useLayoutStore((s) => s.leftVisible)
  const centerVisible = useLayoutStore((s) => s.centerVisible)
  const rightVisible = useLayoutStore((s) => s.rightVisible)
  const centerSplit = useLayoutStore((s) => s.centerSplit)
  const terminalSplit = useLayoutStore((s) => s.terminalSplit)

  if (presets.length === 0) return null

  const current = { leftVisible, centerVisible, rightVisible, centerSplit, terminalSplit }
  const activeId = presets.find((p) => layoutMatchesPreset(current, p))?.id ?? null

  return (
    <div className="app-no-drag flex items-center rounded-lg border border-ink-border bg-ink-panel p-0.5">
      {presets.map((p) => (
        <button
          key={p.id}
          onClick={() => applyPreset(p)}
          aria-pressed={activeId === p.id}
          title={`Apply "${p.name}" layout`}
          className={cn(
            'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
            activeId === p.id
              ? 'bg-ink-elevated text-ink-text shadow'
              : 'text-ink-muted hover:text-ink-text'
          )}
        >
          {p.name}
        </button>
      ))}
    </div>
  )
}
