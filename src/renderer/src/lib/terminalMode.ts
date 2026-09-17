// Terminal mode (spec: docs/specs/terminal-mode.md). A terminal-mode window
// is a project window rooted at `~` that boots into the terminal-only layout;
// "Switch to IDE" adopts the shell's cwd as a workspace root and reveals the
// panels. Everything here acts on the stores imperatively so both the
// command registry and React components can call it.

import { defaultLayoutPresets, terminalPreset, TERMINAL_PRESET_ID, type LayoutPreset } from '@shared/types'
import { useLayoutStore, type PanelKey } from '../stores/layout'
import { useProjectStore } from '../stores/project'
import { useSettingsStore } from '../stores/settings'
import { useTerminalsStore } from '../stores/terminals'
import { useToastStore } from '../stores/toast'
import { useGitStore } from '../stores/git'
import { basename } from './path'
import { focusedTerminalId } from './terminalActions'

export function isTerminalMode(): boolean {
  return useProjectStore.getState().mode === 'terminal'
}

/**
 * Collapse to the terminal-only layout. Uses the user's Terminal preset when
 * it still exists (they may have tweaked it), else the built-in shape — so
 * ⌘⇧T and boot keep working after the preset is deleted (AC21).
 */
export function applyTerminalLayout(): void {
  const preset =
    useSettingsStore.getState().settings.layoutPresets.find((p) => p.id === TERMINAL_PRESET_ID) ?? terminalPreset()
  useLayoutStore.getState().applyPreset(preset)
}

/**
 * Window title for a terminal-mode window (spec §3.5 / AC8): the active
 * shell's cwd basename, `~` at home, "Terminal" before the first prompt.
 * Claude's own OSC titles go to the tab label, never here.
 */
export function terminalWindowTitle(cwd: string | undefined, home: string): string {
  if (!cwd) return 'Terminal'
  if (cwd === home) return '~'
  return basename(cwd) || cwd
}

/** Keep document.title in step with the active terminal's cwd. Returns an unsubscribe fn. */
export function trackTerminalWindowTitle(home: string): () => void {
  const apply = (): void => {
    const s = useTerminalsStore.getState()
    const active = s.terminals.find((t) => t.id === s.activeId)
    document.title = terminalWindowTitle(active?.cwd, home)
  }
  apply()
  return useTerminalsStore.subscribe(apply)
}

/** Id of the built-in three-panel preset, the default target of Switch to IDE. */
const FULL_PRESET_ID = 'preset-full'

function fullPreset(): LayoutPreset {
  return (
    useSettingsStore.getState().settings.layoutPresets.find((p) => p.id === FULL_PRESET_ID) ??
    defaultLayoutPresets().find((p) => p.id === FULL_PRESET_ID)!
  )
}

/**
 * The cwd of the terminal the user is working in: the focused terminal, else
 * the active tab (AC16). OSC 7 usually already has it; otherwise ask main
 * (lsof). Null when there is no live shell or the lookup fails (AC17).
 */
export async function resolveActiveTerminalCwd(): Promise<string | null> {
  const s = useTerminalsStore.getState()
  const id = focusedTerminalId() ?? s.activeId
  const tab = s.terminals.find((t) => t.id === id)
  if (!tab || tab.exited) return null
  if (tab.cwd) return tab.cwd
  if (!tab.ptyId) return null
  try {
    return await window.ide.pty.cwd(tab.ptyId)
  } catch {
    return null
  }
}

/** What Switch to IDE should show once the folder is adopted. */
export type IdeReveal = { preset: LayoutPreset } | { panel: PanelKey }

function applyReveal(reveal: IdeReveal): void {
  const layout = useLayoutStore.getState()
  if ('preset' in reveal) layout.applyPreset(reveal.preset)
  else if (!layout[`${reveal.panel}Visible`]) layout.togglePanel(reveal.panel)
}

/**
 * Switch to IDE (spec §3.4): adopt the active terminal's cwd as a workspace
 * root — unless it is already inside one — start the session watcher and
 * `.caret` override layer for it, then reveal the panels (Full by default).
 * The shell and whatever runs in it are never touched: this is layout plus
 * roots, nothing more. With `reveal` given (a preset click or ⌘B in a
 * terminal-mode window) the layout is applied even when the cwd can't be
 * read — the user asked for the panel — and a toast explains why it's empty;
 * the bare command does nothing else in that case (AC17).
 *
 * `~` itself is never adopted (watching the whole home folder is exactly
 * what terminal mode avoids); the explorer's empty state says what to do.
 */
export async function switchToIde(reveal?: IdeReveal): Promise<void> {
  const cwd = await resolveActiveTerminalCwd()
  if (!cwd) {
    useToastStore.getState().show("Couldn't read the terminal's folder — nothing to browse yet.")
    if (reveal) applyReveal(reveal)
    return
  }
  const project = useProjectStore.getState()
  const home = project.info?.root
  const before = project.workspaceRoot
  const isHome = project.mode === 'terminal' && cwd === home
  const root = isHome ? null : await project.adoptRoot(cwd)
  const adopted = root !== null && !before
  if (root && adopted) {
    // First adopted folder: it becomes the workspace root for sessions,
    // git status and the project settings layer (AC14, AC20, AC23).
    void window.ide.session.watch()
    void useSettingsStore.getState().loadProjectOverrides(root)
    void useGitStore.getState().refresh()
  }
  applyReveal(reveal ?? { preset: fullPreset() })
  if (root) void offerPromotion(root)
}

/**
 * A layout change that would reveal the explorer or editor in a terminal-mode
 * window goes through Switch to IDE first (spec §3.3); anything else is the
 * plain store call. Used by the preset switcher, the title-bar buttons and
 * the ⌘B / ⌘E commands.
 */
export function applyPresetViaIde(preset: LayoutPreset): void {
  if (isTerminalMode() && (preset.leftVisible || preset.centerVisible)) void switchToIde({ preset })
  else useLayoutStore.getState().applyPreset(preset)
}

export function togglePanelViaIde(key: PanelKey): void {
  const layout = useLayoutStore.getState()
  const revealing = key !== 'right' && !layout[`${key}Visible`]
  if (isTerminalMode() && revealing) void switchToIde({ panel: key })
  else layout.togglePanel(key)
}

/** Reveal a panel if hidden (settings tab, new browser tab, focus editor). */
export function ensurePanelViaIde(key: PanelKey): void {
  if (!useLayoutStore.getState()[`${key}Visible`]) togglePanelViaIde(key)
}

// --- Promotion (spec §3.4, AC19) -------------------------------------------

/** Folders the user already declined to open as a project, for this window. */
const declinedPromotions = new Set<string>()

/**
 * When an adopted folder looks like a project — in recents, or with a .git or
 * package.json — offer to open it as a proper project window (saved
 * workspace, git, scripts, session pickers). Opt-in, once per folder per
 * window; the terminal window stays open either way.
 */
export async function offerPromotion(dir: string): Promise<void> {
  if (!isTerminalMode() || declinedPromotions.has(dir)) return
  let probe: { recent: boolean; hasGit: boolean; hasPackageJson: boolean }
  try {
    probe = await window.ide.project.probe(dir)
  } catch {
    return
  }
  if (!probe.recent && !probe.hasGit && !probe.hasPackageJson) return
  declinedPromotions.add(dir)
  const home = useProjectStore.getState().info?.root
  const label = home && dir.startsWith(home + '/') ? '~' + dir.slice(home.length) : dir
  useToastStore.getState().show(`Open ${label} as a project?`, {
    action: { label: 'Open', run: () => void window.ide.welcome.openPath(dir) },
    ttlMs: 12000
  })
}
