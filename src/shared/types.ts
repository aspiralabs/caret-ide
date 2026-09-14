// ---------------------------------------------------------------------------
// Shared types — the single source of truth for data crossing the IPC boundary.
// Imported by main, preload, and renderer. Keep this dependency-free.
// ---------------------------------------------------------------------------

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

// --- Project ---------------------------------------------------------------

export interface ProjectInfo {
  /** Absolute path to the project root folder (this window's project). */
  root: string
  /** Basename of the root, used as the window title / fallback tab labels. */
  name: string
}

/** A recently-opened project, shown on the welcome screen (newest first). */
export interface RecentProject {
  /** Absolute path to the project root folder. */
  root: string
  /** Basename of the root (display label). */
  name: string
  /** Epoch ms of the most recent open (for ordering / display). */
  lastOpened: number
  /** Pinned projects sort first and are never evicted from the list. */
  pinned?: boolean
  /** Free-form group label (welcome screen section). */
  group?: string
}

// --- Filesystem ------------------------------------------------------------

export interface DirEntry {
  name: string
  /** Absolute path. */
  path: string
  isDir: boolean
  isSymlink: boolean
  /** Grayed out in the tree: a hardcoded ignore dir (node_modules/.git/.next/dist) or git-ignored. */
  ignored: boolean
}

/** How a text file is stored on disk; sent back with a save so it round-trips. */
export interface FileTextMeta {
  encoding: 'utf8' | 'latin1'
  /** Leading UTF-8 byte-order mark present. */
  bom: boolean
  eol: 'lf' | 'crlf'
}

export interface ReadFileResult extends FileTextMeta {
  /** Text normalised to LF, without BOM. */
  content: string
  /** True if the file looked binary and was not decoded as text. */
  binary: boolean
}

export type FsChangeKind = 'add' | 'addDir' | 'change' | 'unlink' | 'unlinkDir'

/** Result of importing external paths (Finder drop) into a project folder. */
export interface FsImportResult {
  /** Absolute destination paths that were created. */
  imported: string[]
  /** Sources that failed, with the error message. */
  failed: Array<{ source: string; error: string }>
}

export interface FsChangeEvent {
  path: string
  kind: FsChangeKind
}

// --- PTY / terminal --------------------------------------------------------

export interface PtyCreateOptions {
  cwd: string
  cols: number
  rows: number
  /** Defaults to the user's login shell via `/bin/zsh -l`. */
  shell?: string
}

export interface PtyCreateResult {
  ptyId: string
}

export interface PtyDataEvent {
  ptyId: string
  data: string
}

export interface PtyExitEvent {
  ptyId: string
  exitCode: number
  signal?: number
}

export interface PtyInfo {
  pid: number
  shell: string
  /** Shell's current working directory (null when it couldn't be read). */
  cwd: string | null
  foreground: string | null
}

export interface PtyForeground {
  /** Foreground process command name (e.g. "claude", "node", "zsh"), or null. */
  name: string | null
}

// --- Browser preview (WebContentsView, main-owned) -------------------------

export interface BrowserNavEvent {
  tabId: string
  url: string
  canGoBack: boolean
  canGoForward: boolean
  isLoading: boolean
}

export interface BrowserTitleEvent {
  tabId: string
  title: string
}

export interface BrowserFaviconEvent {
  tabId: string
  favicons: string[]
}

/** Emitted when in-page code requests a new window (target=_blank / window.open). */
export interface BrowserNewTabEvent {
  url: string
}

/** Options for an in-page find (mirrors Electron's `webContents.findInPage`). */
export interface BrowserFindOptions {
  /** Search direction; defaults to true (down the page). */
  forward?: boolean
  /** True when advancing an existing search ("find next"); false starts a fresh one. */
  findNext?: boolean
  /** Case-sensitive matching; defaults to false. */
  matchCase?: boolean
}

/** How to tear down an active find (mirrors Electron's `stopFindInPage`). */
export type BrowserStopFindAction = 'clearSelection' | 'keepSelection' | 'activateSelection'

/** Result of an in-page find, forwarded from Electron's `found-in-page` event. */
export interface BrowserFoundEvent {
  tabId: string
  /** 1-based index of the currently-highlighted match. */
  activeMatchOrdinal: number
  /** Total number of matches on the page. */
  matches: number
  /** False for intermediate updates; true once the count has settled. */
  finalUpdate: boolean
}

/**
 * Emitted when an app keychord (⌘F, ⌘P, ⌘W, ⌘R, ⌘1…9, …) is pressed while the
 * native browser page holds focus. Native views don't route keys to our DOM,
 * so main intercepts the chords the renderer asked for (`browser:setChords`)
 * and hands them back as canonical chord strings (see lib/keybindings.ts).
 */
export interface BrowserChordEvent {
  tabId: string
  /** Canonical chord, e.g. "mod+shift+p". */
  chord: string
}

// --- Formatting (Prettier) --------------------------------------------------

export interface FormatRequest {
  /** Absolute path of the buffer's file (parser inference, config lookup). */
  path: string
  text: string
  /** Caret offset to map through the format (formatWithCursor). */
  cursorOffset?: number
  /** Global Prettier config JSON from Settings, used when the project has none. */
  globalConfig?: string
}

export type FormatResult =
  | {
      kind: 'formatted'
      formatted: string
      cursorOffset: number
      /** False when the text was already formatted. */
      changed: boolean
      prettier: 'project' | 'bundled'
      version: string
      config: 'project' | 'global' | 'defaults'
    }
  | { kind: 'skipped'; reason: 'ignored' | 'no-parser' | 'too-large' }
  | { kind: 'error'; message: string }

/** One project-search hit (find in project, ⌘⇧F). */
export interface SearchMatch {
  /** Absolute path. */
  path: string
  /** 1-based. */
  line: number
  /** 1-based. */
  column: number
  /** The matching line (clipped). */
  text: string
}

export type NetworkPreset = 'online' | 'offline' | 'slow-3g' | 'fast-3g'

export type ConsoleLevel = 'log' | 'info' | 'warning' | 'error'

/** One console message captured from a preview page. */
export interface ConsoleEntry {
  level: ConsoleLevel
  message: string
  /** Script URL the message came from, when known. */
  source?: string
  line?: number
  /** Page URL at the time. */
  url: string
  /** Epoch ms. */
  at: number
}

/** A preview console message, or `entry: null` when the page navigated (clear the list). */
export interface BrowserConsoleEvent {
  tabId: string
  entry: ConsoleEntry | null
}

/** React source location (dev builds only, via a fiber's `_debugSource`). */
export interface PickedElementSource {
  /** Absolute source file path React recorded at build time. */
  fileName: string
  lineNumber: number
  columnNumber?: number
}

/**
 * A DOM element the user picked in the browser preview ("select element" →
 * reference it in Claude Code). Built entirely in-page by the injected picker
 * (see main/ipc/elementPicker.ts) and returned across IPC as plain data.
 */
export interface PickedElement {
  /** 'react' when a React fiber was found on the node; else 'dom' (cheap path). */
  framework: 'react' | 'dom'
  tag: string
  id?: string
  classes: string[]
  /** Unique-ish CSS selector path from the document root. */
  selector: string
  /** Collapsed, length-capped textContent. */
  text?: string
  /** A few useful attributes (role, aria-label, name, type, href, data-testid…). */
  attributes: Record<string, string>
  /** The element's opening tag only (no children), length-capped. */
  openingTag: string
  /** Viewport-relative bounding box. */
  rect: Rect
  /** Nearest owning React component's name, when detectable. */
  componentName?: string
  /** React source location (dev builds with `_debugSource`), when available. */
  source?: PickedElementSource
  /** Page URL the element was picked from. */
  url: string
}

// --- Git status (status bar) -----------------------------------------------

export interface GitStatus {
  /** False when the project root is not inside a git work tree. */
  isRepo: boolean
  /** Branch name, or short SHA when in detached-HEAD state. Null if unknown. */
  branch: string | null
  /** True when HEAD is detached (no branch checked out). */
  detached: boolean
  /** Commits ahead of the upstream tracking branch. */
  ahead: number
  /** Commits behind the upstream tracking branch. */
  behind: number
  /** True when a tracking (upstream) branch is configured. */
  hasUpstream: boolean
  /** Files with staged (index) changes. */
  staged: number
  /** Tracked files with unstaged working-tree changes. */
  modified: number
  /** Untracked files. */
  untracked: number
  /** Files with merge conflicts. */
  conflicted: number
  /** Whether a stash exists. */
  stashed: number
  /** Repo display name (from the origin remote, else the root basename). */
  repo: string
  /** Every changed file (tree colouring / Changes section). */
  files: GitFileChange[]
}

export type GitFileState = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'conflicted'

export interface GitFileChange {
  /** Absolute path. */
  path: string
  state: GitFileState
  /** Has index (staged) changes. */
  staged: boolean
  /** Has worktree (unstaged) changes. */
  unstaged: boolean
}

// --- Claude Code session (/rename fallback watcher, spec §6) ----------------

/**
 * What a Claude Code session is doing, inferred from the tail of its
 * transcript: `thinking` (processing a prompt), `working` (running tools),
 * `waiting` (turn ended — needs the user).
 */
export type ClaudeStatus = 'thinking' | 'working' | 'waiting'

/** A past Claude Code session for this project (terminal "+" menu → Resume). */
export interface SessionSummary {
  sessionId: string
  /** Display title (session summary / custom title / first prompt). */
  title: string
  /** Epoch ms of the last transcript write. */
  modifiedMs: number
}

export interface SessionUpdateEvent {
  /** Session display name / title, or null when the session has none of its own yet. */
  title: string | null
  sessionId: string
  /** Absolute path of the session file that changed. */
  file: string
  mtimeMs: number
  /** Live state, when it could be determined. */
  status: ClaudeStatus | null
}

// --- Crash reporting / diagnostics -----------------------------------------

/** Where a report originated. */
export type CrashSource = 'main' | 'renderer' | 'gpu' | 'child'

/**
 * The kind of failure. Main-process and process-gone types are produced by the
 * main handlers; `renderer-error` / `renderer-unhandledrejection` /
 * `renderer-react` are forwarded from the renderer.
 */
export type CrashType =
  | 'uncaughtException'
  | 'unhandledRejection'
  | 'render-process-gone'
  | 'child-process-gone'
  | 'renderer-error'
  | 'renderer-unhandledrejection'
  | 'renderer-react'

/** A persisted crash report (one JSON file on disk per report). */
export interface CrashReport {
  /** Filesystem-safe stem, also the file name without extension. */
  id: string
  /** ISO 8601 capture time. */
  timestamp: string
  type: CrashType
  source: CrashSource
  message: string
  /** Stack trace when available. */
  stack?: string
  /** Extra structured context (process-gone details, error url/line, etc.). */
  details?: Record<string, unknown>
  /** Runtime versions at capture time. */
  app: {
    version: string
    electron: string
    chrome: string
    node: string
    platform: string
    arch: string
  }
  /** Project root of the reporting window, when known. */
  project?: string
}

/** Trimmed report shape for the Diagnostics list (newest first). */
export interface CrashReportMeta {
  id: string
  timestamp: string
  type: CrashType
  source: CrashSource
  message: string
}

/** Payload the renderer sends to the main process to record an error. */
export interface RendererErrorPayload {
  type: 'renderer-error' | 'renderer-unhandledrejection' | 'renderer-react'
  message: string
  stack?: string
  details?: Record<string, unknown>
}

// --- App settings (VSCode-style settings.json, global to the app) -----------

/** How a markdown file first opens when it isn't already tracked in a tab. */
export type MarkdownOpenAs = 'preview' | 'raw'

/**
 * Color theme preference. `system` follows the OS light/dark setting live; the
 * renderer resolves this to an effective light/dark theme (see lib/theme.ts).
 */
export type ThemeSetting = 'light' | 'dark' | 'system'

/**
 * A named layout arrangement the user can switch to from the title-bar switcher.
 * Captures which panels are visible and whether the center/terminal panels are
 * tiled (split view). Panel sizes are intentionally not part of a preset.
 */
export interface LayoutPreset {
  /** Stable id (used as React key and for equality). */
  id: string
  /** Display name shown in the switcher. */
  name: string
  leftVisible: boolean
  centerVisible: boolean
  rightVisible: boolean
  /** Center panel: tile all editor/browser tabs instead of just the active one. */
  centerSplit: boolean
  /** Right panel: tile all terminals instead of just the active one. */
  terminalSplit: boolean
}

/**
 * User-editable application settings, persisted as JSON in userData/settings.json.
 * Keep every field optional-safe via `defaultSettings()` merge so a partial or
 * hand-edited file never leaves a field undefined.
 */
export interface AppSettings {
  /** Color theme: 'light', 'dark', or 'system' (follows the OS preference). */
  theme: ThemeSetting
  /** Palette id used in dark mode (bundled or from `customThemes`). */
  themeDark: string
  /** Palette id used in light mode. */
  themeLight: string
  /** User palettes (same shape as the bundled ones in lib/themes.ts). */
  customThemes: unknown[]
  /** What view NEW markdown files open as (does not override an open tab's
   *  remembered raw/preview toggle — see EditorView). */
  markdownDefaultOpenAs: MarkdownOpenAs
  /** Show the bottom status bar (branch / git / diagnostics). */
  statusBarVisible: boolean
  /** Wrap long lines in the editors (global, like every other editor preference). */
  wordWrap: boolean
  /** UI zoom factor (1 = 100%). Persisted so ⌘+/⌘− survive a restart. */
  uiZoom: number
  /** Editor font size in px. */
  editorFontSize: number
  /** Show Monaco's minimap. */
  editorMinimap: boolean
  /** Colour matching bracket pairs. */
  editorBracketPairs: boolean
  /** Keep the enclosing scope's header pinned while scrolling (Monaco sticky scroll). */
  editorStickyScroll: boolean
  /** Reveal (expand + select) the active editor's file in the tree on tab switch. */
  explorerAutoReveal: boolean
  /** Show git-ignored entries (dimmed) in the tree. */
  explorerShowIgnored: boolean
  /** Show dotfiles (.env, .github, …) in the tree. */
  explorerShowDotfiles: boolean
  /** Terminal font size (px). */
  terminalFontSize: number
  /** Terminal font family; '' = the bundled JetBrains Mono Nerd Font. */
  terminalFontFamily: string
  terminalCursorStyle: 'block' | 'underline' | 'bar'
  terminalCursorBlink: boolean
  /** Scrollback lines kept per terminal. */
  terminalScrollback: number
  /** Run Prettier on ⌘S before writing. */
  formatOnSave: boolean
  /** Global Prettier config (JSON, the contents of a .prettierrc) used when the project has none. */
  prettierConfig: string
  /** Named layout presets, shown left-to-right in the title-bar switcher. */
  layoutPresets: LayoutPreset[]
  /**
   * Keybinding overrides, keyed by command id → canonical chords (e.g.
   * ["mod+d"]). A command present here replaces its built-in defaults entirely
   * (an empty array unbinds it); commands absent here keep their defaults.
   */
  keybindings: Record<string, string[]>
}

export function defaultLayoutPresets(): LayoutPreset[] {
  return [
    {
      id: 'preset-full',
      name: 'Full',
      leftVisible: true,
      centerVisible: true,
      rightVisible: true,
      centerSplit: false,
      terminalSplit: false
    },
    {
      id: 'preset-editor',
      name: 'Editor',
      leftVisible: true,
      centerVisible: true,
      rightVisible: false,
      centerSplit: false,
      terminalSplit: false
    },
    {
      id: 'preset-zen',
      name: 'Zen',
      leftVisible: false,
      centerVisible: true,
      rightVisible: false,
      centerSplit: false,
      terminalSplit: false
    }
  ]
}

export function defaultSettings(): AppSettings {
  return {
    theme: 'system',
    themeDark: 'caret-dark',
    themeLight: 'caret-light',
    customThemes: [],
    markdownDefaultOpenAs: 'raw',
    statusBarVisible: true,
    wordWrap: false,
    uiZoom: 1,
    editorFontSize: 13,
    editorMinimap: false,
    editorBracketPairs: true,
    editorStickyScroll: true,
    explorerAutoReveal: true,
    explorerShowIgnored: true,
    explorerShowDotfiles: true,
    terminalFontSize: 12,
    terminalFontFamily: '',
    terminalCursorStyle: 'block',
    terminalCursorBlink: true,
    terminalScrollback: 10000,
    formatOnSave: false,
    prettierConfig: '',
    layoutPresets: defaultLayoutPresets(),
    keybindings: {}
  }
}

/** Coerce an unknown value into a keybinding override map (commandId → chords). */
function normalizeKeybindings(input: unknown): Record<string, string[]> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string[]> = {}
  for (const [id, value] of Object.entries(input as Record<string, unknown>)) {
    if (!Array.isArray(value)) continue
    out[id] = value.filter((c): c is string => typeof c === 'string' && c.length > 0)
  }
  return out
}

/** Coerce an unknown value into a valid LayoutPreset, or null if unusable. */
function normalizeLayoutPreset(input: unknown): LayoutPreset | null {
  if (!input || typeof input !== 'object') return null
  const o = input as Record<string, unknown>
  if (typeof o.id !== 'string' || typeof o.name !== 'string') return null
  const bool = (v: unknown, fallback: boolean): boolean =>
    typeof v === 'boolean' ? v : fallback
  return {
    id: o.id,
    name: o.name,
    leftVisible: bool(o.leftVisible, true),
    centerVisible: bool(o.centerVisible, true),
    rightVisible: bool(o.rightVisible, true),
    centerSplit: bool(o.centerSplit, false),
    terminalSplit: bool(o.terminalSplit, false)
  }
}

/** Merge a parsed (possibly partial/unknown) object over the defaults. */
export function normalizeSettings(input: unknown): AppSettings {
  const base = defaultSettings()
  if (!input || typeof input !== 'object') return base
  const o = input as Record<string, unknown>
  if (o.theme === 'light' || o.theme === 'dark' || o.theme === 'system') {
    base.theme = o.theme
  }
  if (typeof o.themeDark === 'string' && o.themeDark) base.themeDark = o.themeDark
  if (typeof o.themeLight === 'string' && o.themeLight) base.themeLight = o.themeLight
  if (Array.isArray(o.customThemes)) base.customThemes = o.customThemes
  if (o.markdownDefaultOpenAs === 'preview' || o.markdownDefaultOpenAs === 'raw') {
    base.markdownDefaultOpenAs = o.markdownDefaultOpenAs
  }
  if (typeof o.statusBarVisible === 'boolean') {
    base.statusBarVisible = o.statusBarVisible
  }
  if (typeof o.wordWrap === 'boolean') {
    base.wordWrap = o.wordWrap
  }
  if (typeof o.uiZoom === 'number' && Number.isFinite(o.uiZoom) && o.uiZoom >= 0.5 && o.uiZoom <= 3) {
    base.uiZoom = o.uiZoom
  }
  if (typeof o.editorFontSize === 'number' && Number.isFinite(o.editorFontSize)) {
    base.editorFontSize = Math.min(32, Math.max(8, Math.round(o.editorFontSize)))
  }
  for (const key of [
    'editorMinimap',
    'editorBracketPairs',
    'editorStickyScroll',
    'explorerAutoReveal',
    'explorerShowIgnored',
    'explorerShowDotfiles',
    'formatOnSave'
  ] as const) {
    if (typeof o[key] === 'boolean') base[key] = o[key] as boolean
  }
  if (typeof o.terminalFontSize === 'number' && Number.isFinite(o.terminalFontSize)) {
    base.terminalFontSize = Math.min(32, Math.max(8, Math.round(o.terminalFontSize)))
  }
  if (typeof o.terminalFontFamily === 'string') base.terminalFontFamily = o.terminalFontFamily
  if (o.terminalCursorStyle === 'block' || o.terminalCursorStyle === 'underline' || o.terminalCursorStyle === 'bar') {
    base.terminalCursorStyle = o.terminalCursorStyle
  }
  if (typeof o.terminalCursorBlink === 'boolean') base.terminalCursorBlink = o.terminalCursorBlink
  if (typeof o.terminalScrollback === 'number' && Number.isFinite(o.terminalScrollback)) {
    base.terminalScrollback = Math.min(200000, Math.max(0, Math.round(o.terminalScrollback)))
  }
  if (typeof o.prettierConfig === 'string') base.prettierConfig = o.prettierConfig
  else if (o.prettierConfig && typeof o.prettierConfig === 'object') {
    // Someone pasted the object itself into settings.json — keep it as text.
    base.prettierConfig = JSON.stringify(o.prettierConfig, null, 2)
  }
  // Only replace the seeded defaults when the file explicitly provides an array
  // (an empty array is a valid user choice: "no presets").
  if (Array.isArray(o.layoutPresets)) {
    base.layoutPresets = o.layoutPresets
      .map(normalizeLayoutPreset)
      .filter((p): p is LayoutPreset => p !== null)
  }
  if (o.keybindings && typeof o.keybindings === 'object') {
    base.keybindings = normalizeKeybindings(o.keybindings)
  }
  return base
}

// --- Persisted workspace state (electron-store, keyed by project path) ------

export type CenterTabKind = 'editor' | 'browser' | 'settings' | 'settingsJson' | 'diff' | 'terminal'

export interface PersistedCenterTab {
  id: string
  kind: CenterTabKind
  /** editor tabs: absolute file path. */
  filePath?: string
  /** browser tabs: last URL. */
  url?: string
  /** browser tabs: last known title (for label before the view loads). */
  title?: string
}

export interface PersistedTerminalTab {
  id: string
  /** Auto-derived label (from OSC title / process). */
  label: string
  /** Manual override; when set, auto-title updates are ignored (spec §6). */
  customName?: string
}

export interface LayoutState {
  leftVisible: boolean
  rightVisible: boolean
  centerVisible: boolean
  /** [left, center, right] as percentages summing to 100. */
  panelSizes: [number, number, number]
  // Split-view state. Optional so state persisted before it existed still
  // hydrates (defaults: not split, nothing hidden).
  /** Center panel tiles every editor/browser tab. */
  centerSplit?: boolean
  /** Right panel tiles every terminal. */
  terminalSplit?: boolean
  /** Center tab ids hidden from the split. */
  hiddenCenterPanes?: string[]
  /** Terminal tab ids hidden from the split. */
  hiddenTerminalPanes?: string[]
  /** Terminal split tiles side-by-side (default) or stacked. */
  terminalSplitDirection?: 'horizontal' | 'vertical'
}

export interface WorkspaceState {
  version: number
  layout: LayoutState
  centerTabs: PersistedCenterTab[]
  activeCenterTabId: string | null
  terminalTabs: PersistedTerminalTab[]
  /** Which terminal tab was active (restored so the same one is selected). Optional: older state lacks it. */
  activeTerminalId?: string | null
  /** Absolute paths of expanded file-tree directories. */
  expandedDirs: string[]
  /**
   * @deprecated Word wrap is a global setting (AppSettings.wordWrap) since 0.4.2.
   * Kept so older persisted state still type-checks; ignored on hydrate.
   */
  wordWrap: boolean
  /** Default URL for new browser tabs (spec §5.3 — configurable per project). */
  defaultBrowserUrl: string
  /** Reload browser previews after each save (projects without HMR). Optional: older state lacks it. */
  reloadPreviewOnSave?: boolean
}

export const WORKSPACE_STATE_VERSION = 1

export function defaultWorkspaceState(): WorkspaceState {
  return {
    version: WORKSPACE_STATE_VERSION,
    layout: {
      leftVisible: true,
      rightVisible: true,
      centerVisible: true,
      panelSizes: [20, 52, 28]
    },
    centerTabs: [],
    activeCenterTabId: null,
    terminalTabs: [],
    expandedDirs: [],
    wordWrap: false,
    defaultBrowserUrl: 'http://localhost:3000'
  }
}
