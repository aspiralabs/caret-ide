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

export interface ReadFileResult {
  content: string
  encoding: 'utf8'
  /** True if the file looked binary and was not decoded as text. */
  binary: boolean
}

export type FsChangeKind = 'add' | 'addDir' | 'change' | 'unlink' | 'unlinkDir'

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

/** Emitted when the user presses the find chord (⌘F) while the native page has focus. */
export interface BrowserOpenFindEvent {
  tabId: string
}

/**
 * Emitted when the command-palette chord (⌘P / ⌘⇧P) is pressed while the native
 * browser page holds focus. Native views don't route keys to our DOM, so main
 * intercepts the chord and asks the renderer to open the palette.
 */
export interface BrowserOpenPaletteEvent {
  /** True for ⌘⇧P (jump straight to the Commands section). */
  commandMode: boolean
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
}

// --- Claude Code session (/rename fallback watcher, spec §6) ----------------

export interface SessionUpdateEvent {
  /** Session display name / title read from Claude Code session metadata. */
  title: string
  sessionId: string
  /** Absolute path of the session file that changed. */
  file: string
  mtimeMs: number
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
  /** What view NEW markdown files open as (does not override an open tab's
   *  remembered raw/preview toggle — see EditorView). */
  markdownDefaultOpenAs: MarkdownOpenAs
  /** Show the bottom status bar (branch / git / diagnostics). */
  statusBarVisible: boolean
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
    markdownDefaultOpenAs: 'raw',
    statusBarVisible: true,
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
  if (o.markdownDefaultOpenAs === 'preview' || o.markdownDefaultOpenAs === 'raw') {
    base.markdownDefaultOpenAs = o.markdownDefaultOpenAs
  }
  if (typeof o.statusBarVisible === 'boolean') {
    base.statusBarVisible = o.statusBarVisible
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

export type CenterTabKind = 'editor' | 'browser' | 'settings' | 'settingsJson'

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
}

export interface WorkspaceState {
  version: number
  layout: LayoutState
  centerTabs: PersistedCenterTab[]
  activeCenterTabId: string | null
  terminalTabs: PersistedTerminalTab[]
  /** Absolute paths of expanded file-tree directories. */
  expandedDirs: string[]
  wordWrap: boolean
  /** Default URL for new browser tabs (spec §5.3 — configurable per project). */
  defaultBrowserUrl: string
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
