import { useEffect, useMemo, useState } from 'react'
import { Braces, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import type { LayoutPreset, MarkdownOpenAs, ThemeSetting } from '@shared/types'
import { useSettingsStore } from '../../stores/settings'
import { useTabsStore } from '../../stores/tabs'
import { useLayoutStore } from '../../stores/layout'
import { COMMANDS, resolveKeybindings } from '../../lib/commands'
import { eventToChord, formatChord } from '../../lib/keybindings'
import { uid } from '../../lib/id'
import { cn } from '../../lib/cn'

/** A labelled segmented control (two or more mutually-exclusive options). */
function Segmented<T extends string>({
  value,
  options,
  onChange
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}): JSX.Element {
  return (
    <div className="inline-flex rounded-lg border border-ink-border bg-ink-panel p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1 text-xs transition-colors ${
            value === o.value
              ? 'bg-ink-elevated text-ink-text shadow'
              : 'text-ink-muted hover:text-ink-text'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Row({
  title,
  description,
  children
}: {
  title: string
  description: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <div className="flex items-start justify-between gap-6 border-b border-ink-border py-5">
      <div className="min-w-0">
        <div className="text-sm text-ink-text">{title}</div>
        <div className="mt-1 text-xs leading-relaxed text-ink-muted">{description}</div>
      </div>
      <div className="shrink-0 pt-0.5">{children}</div>
    </div>
  )
}

/** The boolean fields a preset toggles, with a short label. */
const PRESET_FIELDS: { key: keyof Omit<LayoutPreset, 'id' | 'name'>; label: string }[] = [
  { key: 'leftVisible', label: 'Left' },
  { key: 'centerVisible', label: 'Center' },
  { key: 'rightVisible', label: 'Right' },
  { key: 'centerSplit', label: 'Split editor' },
  { key: 'terminalSplit', label: 'Split terminal' }
]

/** A small on/off chip used to toggle one preset field. */
function Chip({
  label,
  active,
  onClick
}: {
  label: string
  active: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-md border px-2 py-1 text-xs transition-colors',
        active
          ? 'border-ink-border bg-ink-elevated text-ink-text'
          : 'border-ink-border/60 bg-transparent text-ink-muted hover:text-ink-text'
      )}
    >
      {label}
    </button>
  )
}

/** Editor + manager for the global layout presets shown in the title-bar switcher. */
function LayoutPresetsSection(): JSX.Element {
  const presets = useSettingsStore((s) => s.settings.layoutPresets)
  const update = useSettingsStore((s) => s.update)

  const commit = (next: LayoutPreset[]): void => void update({ layoutPresets: next })

  const patch = (id: string, delta: Partial<LayoutPreset>): void =>
    commit(presets.map((p) => (p.id === id ? { ...p, ...delta } : p)))

  const remove = (id: string): void => commit(presets.filter((p) => p.id !== id))

  const addBlank = (): void =>
    commit([
      ...presets,
      {
        id: uid('preset'),
        name: 'New preset',
        leftVisible: true,
        centerVisible: true,
        rightVisible: true,
        centerSplit: false,
        terminalSplit: false
      }
    ])

  const captureCurrent = (): void => {
    const l = useLayoutStore.getState()
    commit([
      ...presets,
      {
        id: uid('preset'),
        name: `Layout ${presets.length + 1}`,
        leftVisible: l.leftVisible,
        centerVisible: l.centerVisible,
        rightVisible: l.rightVisible,
        centerSplit: l.centerSplit,
        terminalSplit: l.terminalSplit
      }
    ])
  }

  return (
    <section className="mt-10">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Layout Presets
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={captureCurrent}
            className="rounded-md border border-ink-border bg-ink-elevated px-2.5 py-1 text-xs text-ink-text transition-colors hover:bg-ink-hover"
            title="Create a preset from the current layout"
          >
            Capture current
          </button>
          <button
            onClick={addBlank}
            className="rounded-md border border-ink-border bg-ink-elevated px-2.5 py-1 text-xs text-ink-text transition-colors hover:bg-ink-hover"
          >
            Add preset
          </button>
        </div>
      </div>
      <p className="mb-4 text-xs leading-relaxed text-ink-muted">
        Presets appear in the top-left switcher. Each captures which panels are visible and whether
        the editor / terminal are in split view. Applying one never changes panel sizes.
      </p>

      {presets.length === 0 ? (
        <div className="rounded-lg border border-dashed border-ink-border py-8 text-center text-xs text-ink-muted">
          No presets yet. “Capture current” snapshots your current layout.
        </div>
      ) : (
        <div className="space-y-2">
          {presets.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-ink-border bg-ink-panel px-3 py-2.5"
            >
              <input
                value={p.name}
                onChange={(e) => patch(p.id, { name: e.target.value })}
                aria-label="Preset name"
                className="w-36 shrink-0 rounded-md border border-ink-border bg-ink-bg px-2 py-1 text-sm text-ink-text outline-none focus:border-ink-muted"
              />
              <div className="flex flex-wrap items-center gap-1.5">
                {PRESET_FIELDS.map((f) => (
                  <Chip
                    key={f.key}
                    label={f.label}
                    active={p[f.key]}
                    onClick={() => patch(p.id, { [f.key]: !p[f.key] })}
                  />
                ))}
              </div>
              <button
                onClick={() => remove(p.id)}
                aria-label={`Delete ${p.name}`}
                title="Delete preset"
                className="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-ink-hover hover:text-red-400"
              >
                <Trash2 size={14} strokeWidth={1.5} aria-hidden />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

/** A single keychord shown as a removable badge. */
function ChordBadge({
  chord,
  conflict,
  onRemove
}: {
  chord: string
  conflict: boolean
  onRemove: () => void
}): JSX.Element {
  return (
    <span
      title={conflict ? 'This shortcut is bound to more than one command' : undefined}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs',
        conflict
          ? 'border-amber-500/50 bg-amber-500/10 text-amber-300'
          : 'border-ink-border bg-ink-elevated text-ink-text'
      )}
    >
      <span className="font-medium">{formatChord(chord)}</span>
      <button
        onClick={onRemove}
        aria-label={`Remove ${formatChord(chord)}`}
        className="flex h-4 w-4 items-center justify-center rounded text-ink-muted transition-colors hover:text-red-400"
      >
        <X size={12} strokeWidth={2} aria-hidden />
      </button>
    </span>
  )
}

/** Editor for the global command keybindings, backed by settings.keybindings. */
function KeybindingsSection(): JSX.Element {
  const overrides = useSettingsStore((s) => s.settings.keybindings)
  const update = useSettingsStore((s) => s.update)
  const [recordingId, setRecordingId] = useState<string | null>(null)

  const resolved = useMemo(() => resolveKeybindings(overrides), [overrides])

  // Count each chord across all commands so we can flag collisions.
  const chordCount = useMemo(() => {
    const counts = new Map<string, number>()
    resolved.forEach((chords) => chords.forEach((c) => counts.set(c, (counts.get(c) ?? 0) + 1)))
    return counts
  }, [resolved])

  const commit = (id: string, chords: string[]): void => {
    const cur = useSettingsStore.getState().settings.keybindings
    void update({ keybindings: { ...cur, [id]: chords } })
  }

  const addChord = (id: string, chord: string): void => {
    const cur = resolveKeybindings(useSettingsStore.getState().settings.keybindings).get(id) ?? []
    if (cur.includes(chord)) return
    commit(id, [...cur, chord])
  }

  const removeChord = (id: string, chord: string): void => {
    const cur = resolveKeybindings(useSettingsStore.getState().settings.keybindings).get(id) ?? []
    commit(
      id,
      cur.filter((c) => c !== chord)
    )
  }

  const resetBinding = (id: string): void => {
    const cur = { ...useSettingsStore.getState().settings.keybindings }
    delete cur[id]
    void update({ keybindings: cur })
  }

  // While recording, capture the next chord globally (capture-phase +
  // stopPropagation keeps the app's own shortcut handler from firing on it).
  useEffect(() => {
    if (!recordingId) return
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setRecordingId(null)
        return
      }
      const chord = eventToChord(e)
      if (!chord) return // modifier-only press — keep listening
      addChord(recordingId, chord)
      setRecordingId(null)
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [recordingId])

  return (
    <section className="mt-10">
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
        Keyboard Shortcuts
      </h2>
      <p className="mb-4 text-xs leading-relaxed text-ink-muted">
        Rebind commands to your own keychords. A command can have more than one shortcut. The
        command palette (⌘P), tab jumps (⌘1–9) and tab cycling (⌃Tab) are fixed.
      </p>

      <div className="space-y-1">
        {COMMANDS.map((cmd) => {
          const chords = resolved.get(cmd.id) ?? []
          const overridden = cmd.id in overrides
          const recording = recordingId === cmd.id
          return (
            <div
              key={cmd.id}
              className="flex items-center gap-3 rounded-lg border border-transparent px-3 py-2 hover:border-ink-border hover:bg-ink-panel"
            >
              <span className="min-w-0 flex-1 truncate text-sm text-ink-text">{cmd.title}</span>
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                {chords.map((chord) => (
                  <ChordBadge
                    key={chord}
                    chord={chord}
                    conflict={(chordCount.get(chord) ?? 0) > 1}
                    onRemove={() => removeChord(cmd.id, chord)}
                  />
                ))}
                {recording ? (
                  <button
                    onClick={() => setRecordingId(null)}
                    className="rounded-md border border-ink-accent bg-ink-accent/10 px-2 py-1 text-xs text-ink-accent"
                  >
                    Press keys… (Esc)
                  </button>
                ) : (
                  <button
                    onClick={() => setRecordingId(cmd.id)}
                    aria-label={`Add shortcut for ${cmd.title}`}
                    title="Add shortcut"
                    className="flex h-7 w-7 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-ink-hover hover:text-ink-text"
                  >
                    <Plus size={14} strokeWidth={1.5} aria-hidden />
                  </button>
                )}
                {overridden && (
                  <button
                    onClick={() => resetBinding(cmd.id)}
                    aria-label={`Reset ${cmd.title} to default`}
                    title="Reset to default"
                    className="flex h-7 w-7 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-ink-hover hover:text-ink-text"
                  >
                    <RotateCcw size={13} strokeWidth={1.5} aria-hidden />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/** The graphical Settings page (Command: "Preferences: Open Settings"). */
export default function SettingsView(): JSX.Element {
  const settings = useSettingsStore((s) => s.settings)
  const update = useSettingsStore((s) => s.update)
  const wordWrap = useLayoutStore((s) => s.wordWrap)
  const openJson = (): void => void useTabsStore.getState().openSingleton('settingsJson')

  return (
    <div className="h-full w-full overflow-auto bg-ink-bg">
      <div className="mx-auto max-w-3xl px-10 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-ink-text">Settings</h1>
          <button
            onClick={openJson}
            className="flex items-center gap-1.5 rounded-md border border-ink-border bg-ink-elevated px-2.5 py-1 text-xs text-ink-text transition-colors hover:bg-ink-hover"
            title="Open settings.json in the editor"
          >
            <Braces size={14} strokeWidth={1.5} />
            Edit in settings.json
          </button>
        </div>

        <section>
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Appearance
          </h2>
          <Row
            title="Theme"
            description="Color theme for the whole app — editor, terminal, and UI. “System” follows your macOS light/dark setting automatically."
          >
            <Segmented<ThemeSetting>
              value={settings.theme}
              options={[
                { value: 'system', label: 'System' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' }
              ]}
              onChange={(theme) => void update({ theme })}
            />
          </Row>
          <Row
            title="Status bar"
            description="Show the bottom status bar with the branch, git status, and diagnostics count."
          >
            <Segmented<'show' | 'hide'>
              value={settings.statusBarVisible ? 'show' : 'hide'}
              options={[
                { value: 'show', label: 'Show' },
                { value: 'hide', label: 'Hide' }
              ]}
              onChange={(v) => void update({ statusBarVisible: v === 'show' })}
            />
          </Row>
        </section>

        <section className="mt-10">
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Markdown
          </h2>
          <Row
            title="Default open mode"
            description="How markdown files first open. Applies to newly-opened files — a file already in the tab bar keeps whatever raw/preview mode you last toggled it to until you close it."
          >
            <Segmented<MarkdownOpenAs>
              value={settings.markdownDefaultOpenAs}
              options={[
                { value: 'preview', label: 'Preview' },
                { value: 'raw', label: 'Raw' }
              ]}
              onChange={(markdownDefaultOpenAs) => void update({ markdownDefaultOpenAs })}
            />
          </Row>
        </section>

        <section className="mt-10">
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Editor
          </h2>
          <Row
            title="Word wrap"
            description="Wrap long lines to the editor width instead of scrolling horizontally. Applies to the code editor (including the raw markdown view)."
          >
            <Segmented<'on' | 'off'>
              value={wordWrap ? 'on' : 'off'}
              options={[
                { value: 'on', label: 'On' },
                { value: 'off', label: 'Off' }
              ]}
              onChange={(v) => useLayoutStore.getState().setWordWrap(v === 'on')}
            />
          </Row>
        </section>

        <KeybindingsSection />

        <LayoutPresetsSection />
      </div>
    </div>
  )
}
