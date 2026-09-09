import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useCommandPaletteStore, fileItemFor, type FileItem } from '../stores/commandPalette'
import { useTabsStore } from '../stores/tabs'
import { useLayoutStore } from '../stores/layout'
import { COMMANDS, resolveKeybindings, type Command } from '../lib/commands'
import { formatChord } from '../lib/keybindings'
import { useSettingsStore } from '../stores/settings'
import { fuzzyMatch } from '../lib/fuzzy'
import { fileIcon } from './files/icons'
import { CommandIcon } from './commandIcons'

const MAX_FILE_RESULTS = 40

type Entry =
  | { type: 'command'; command: Command; matches: number[] }
  | { type: 'file'; file: FileItem; matches: number[] }

interface Section {
  title: string
  entries: Entry[]
}

function scoreCommand(term: string, cmd: Command): { score: number; matches: number[] } | null {
  if (!term) return { score: 0, matches: [] }
  const title = fuzzyMatch(term, cmd.title)
  if (title) return title
  if (cmd.keywords) {
    const kw = fuzzyMatch(term, cmd.keywords)
    if (kw) return { score: kw.score - 6, matches: [] }
  }
  return null
}

/** Score a file against the basename (priority) and the full relative path. */
function scoreFile(term: string, file: FileItem): { score: number; matches: number[] } | null {
  const rel = fuzzyMatch(term, file.rel)
  const name = fuzzyMatch(term, file.name)
  const offset = file.rel.length - file.name.length
  const nameAsRel = name
    ? { score: name.score + 15, matches: name.matches.map((i) => i + offset) }
    : null
  if (rel && nameAsRel) return rel.score >= nameAsRel.score ? rel : nameAsRel
  return rel ?? nameAsRel
}

function Highlight({ text, matches }: { text: string; matches: number[] }): JSX.Element {
  if (matches.length === 0) return <>{text}</>
  const set = new Set(matches)
  return (
    <>
      {Array.from(text, (ch, i) =>
        set.has(i) ? (
          <span key={i} className="font-semibold text-ink-accent">
            {ch}
          </span>
        ) : (
          <span key={i}>{ch}</span>
        )
      )}
    </>
  )
}

/** Small keycap, used for shortcut badges and the footer hints. */
function Key({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <kbd className="inline-flex h-6 min-w-[24px] items-center justify-center rounded-md border border-ink-border bg-ink-hover px-1.5 font-sans text-[11px] font-medium text-ink-text">
      {children}
    </kbd>
  )
}

function Shortcut({ value }: { value: string }): JSX.Element {
  return (
    <span className="flex items-center gap-1">
      {Array.from(value, (c, i) => (
        <Key key={i}>{c}</Key>
      ))}
    </span>
  )
}

function FileRow({ file, matches, selected }: { file: FileItem; matches: number[]; selected: boolean }): JSX.Element {
  const offset = file.rel.length - file.name.length
  const nameMatches = matches.filter((i) => i >= offset).map((i) => i - offset)
  const dir = file.rel.slice(0, offset).replace(/\/$/, '')
  const dirMatches = matches.filter((i) => i < offset)
  return (
    <>
      <span className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center">
        {fileIcon(file.name)}
      </span>
      <span className="truncate text-[13px]">
        <Highlight text={file.name} matches={nameMatches} />
      </span>
      {dir && (
        <span className="min-w-0 flex-1 truncate text-xs text-ink-muted">
          <Highlight text={dir} matches={dirMatches} />
        </span>
      )}
      {selected && <span className="ml-auto shrink-0 text-xs text-ink-muted">Open</span>}
    </>
  )
}

function CommandRow({ command, matches }: { command: Command; matches: number[] }): JSX.Element {
  const overrides = useSettingsStore((s) => s.settings.keybindings)
  const chord = resolveKeybindings(overrides).get(command.id)?.[0]
  return (
    <>
      <span className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center text-ink-muted">
        <CommandIcon name={command.icon} />
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px]">
        <Highlight text={command.title} matches={matches} />
      </span>
      {chord && <Shortcut value={formatChord(chord)} />}
    </>
  )
}

function EntryRow({
  entry,
  selected,
  onHover,
  onRun
}: {
  entry: Entry
  selected: boolean
  onHover: () => void
  onRun: () => void
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  return (
    <div
      ref={ref}
      onMouseMove={onHover}
      onMouseDown={(e) => {
        e.preventDefault() // keep focus in the input
        onRun()
      }}
      className={`mx-2 flex h-11 cursor-pointer items-center gap-3 rounded-lg px-3 ${
        selected ? 'bg-ink-hover ring-1 ring-white/10' : 'hover:bg-ink-hover/50'
      }`}
    >
      {entry.type === 'file' ? (
        <FileRow file={entry.file} matches={entry.matches} selected={selected} />
      ) : (
        <CommandRow command={entry.command} matches={entry.matches} />
      )}
    </div>
  )
}

function GradientDivider(): JSX.Element {
  return (
    <div className="my-2 h-px bg-gradient-to-r from-transparent via-ink-accent/50 to-transparent" />
  )
}

export default function CommandPalette(): JSX.Element | null {
  const { open, initialQuery, files, recent, close, ensureFiles, pushRecent } =
    useCommandPaletteStore()
  const tabs = useTabsStore((s) => s.tabs)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setQuery(initialQuery)
    setSelected(0)
    void ensureFiles()
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [open, initialQuery, ensureFiles])

  // "Recent" list: tracked opens, falling back to currently-open editor tabs.
  const recentItems = useMemo<FileItem[]>(() => {
    if (!open) return []
    const paths = recent.length
      ? recent
      : tabs.filter((t) => t.kind === 'editor' && t.filePath).map((t) => t.filePath as string)
    return paths.map(fileItemFor)
  }, [open, recent, tabs])

  const sections = useMemo<Section[]>(() => {
    if (!open) return []
    const commandMode = query.startsWith('>')
    const term = (commandMode ? query.slice(1) : query).trim()

    // Empty query: show Recent + all commands, like the reference menu.
    if (!term) {
      const out: Section[] = []
      if (!commandMode && recentItems.length) {
        out.push({
          title: 'Recent',
          entries: recentItems.map((file) => ({ type: 'file' as const, file, matches: [] }))
        })
      }
      out.push({
        title: 'Commands',
        entries: COMMANDS.map((command) => ({ type: 'command' as const, command, matches: [] }))
      })
      return out
    }

    // Active query: rank files + commands within their own sections.
    const scoredCommands: Array<{ entry: Entry; score: number }> = []
    for (const command of COMMANDS) {
      const r = scoreCommand(term, command)
      if (r) scoredCommands.push({ entry: { type: 'command', command, matches: r.matches }, score: r.score })
    }
    const commandEntries = scoredCommands.sort((a, b) => b.score - a.score).map((x) => x.entry)

    const scoredFiles: Array<{ entry: Entry; score: number }> = []
    if (!commandMode && files) {
      for (const file of files) {
        const r = scoreFile(term, file)
        if (r) scoredFiles.push({ entry: { type: 'file', file, matches: r.matches }, score: r.score })
      }
    }
    const fileEntries = scoredFiles
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_FILE_RESULTS)
      .map((x) => x.entry)

    const out: Section[] = []
    if (fileEntries.length) out.push({ title: 'Files', entries: fileEntries })
    if (commandEntries.length) out.push({ title: 'Commands', entries: commandEntries })
    return out
  }, [open, query, files, recentItems])

  // Flatten for keyboard navigation; keep section boundaries for rendering.
  const flat = useMemo(() => sections.flatMap((s) => s.entries), [sections])

  useEffect(() => {
    setSelected((s) => Math.min(s, Math.max(0, flat.length - 1)))
  }, [flat.length])

  if (!open) return null

  const run = (entry: Entry): void => {
    close()
    if (entry.type === 'command') {
      entry.command.run()
      return
    }
    pushRecent(entry.file.path)
    useTabsStore.getState().openFile(entry.file.path)
    if (!useLayoutStore.getState().centerVisible) useLayoutStore.getState().togglePanel('center')
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected((s) => (flat.length ? (s + 1) % flat.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected((s) => (flat.length ? (s - 1 + flat.length) % flat.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const entry = flat[selected]
      if (entry) run(entry)
    } else if (e.key === 'p' && e.metaKey) {
      e.preventDefault()
      close()
    }
  }

  // Running index so section rendering can map to the flat selection index.
  let flatIndex = -1

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center bg-black/50 pt-[12vh] backdrop-blur-sm"
      onMouseDown={close}
    >
      <div
        className="flex max-h-[72vh] w-[720px] max-w-[92vw] flex-col overflow-hidden rounded-2xl border border-white/10 bg-ink-elevated/95 shadow-2xl backdrop-blur-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Search row */}
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-ink-border px-6">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Type a command or search…"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-lg text-ink-text placeholder:text-ink-muted focus:outline-none"
          />
          <button
            aria-label="Close"
            onClick={close}
            className="shrink-0 rounded-md p-1 text-ink-muted hover:bg-ink-hover hover:text-ink-text"
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        {/* Results */}
        <div className="min-h-0 flex-1 overflow-y-auto py-2">
          {flat.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-ink-muted">No matches</div>
          ) : (
            sections.map((section, si) => (
              <div key={section.title}>
                {si > 0 && <GradientDivider />}
                <div className="px-5 pb-1 pt-2 text-xs text-ink-muted">{section.title}</div>
                {section.entries.map((entry) => {
                  flatIndex += 1
                  const idx = flatIndex
                  return (
                    <EntryRow
                      key={entry.type === 'file' ? `f:${entry.file.path}` : `c:${entry.command.id}`}
                      entry={entry}
                      selected={idx === selected}
                      onHover={() => setSelected(idx)}
                      onRun={() => run(entry)}
                    />
                  )
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hints */}
        <div className="flex h-11 shrink-0 items-center gap-5 border-t border-ink-border px-5 text-xs text-ink-muted">
          <span className="flex items-center gap-1.5">
            <Key>esc</Key> to close
          </span>
          <span className="flex items-center gap-1.5">
            <Key>↵</Key> to select
          </span>
          <span className="flex items-center gap-1.5">
            <Key>↑</Key>
            <Key>↓</Key> to navigate
          </span>
          <span className="ml-auto">{flat.length} results</span>
        </div>
      </div>
    </div>
  )
}
