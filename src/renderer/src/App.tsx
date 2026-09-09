import { useEffect, useRef, useState } from 'react'
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  type ImperativePanelGroupHandle
} from 'react-resizable-panels'
import TitleBar from './components/TitleBar'
import CenterPanel from './components/CenterPanel'
import FileBrowser from './components/files/FileBrowser'
import TerminalPanel from './components/terminal/TerminalPanel'
import BrowserManager from './components/browser/BrowserManager'
import StatusBar from './components/StatusBar'
import CommandPalette from './components/CommandPalette'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useProjectStore } from './stores/project'
import { useLayoutStore, layoutMatchesPreset, computeLayout, fillerIndex } from './stores/layout'
import { useTerminalsStore } from './stores/terminals'
import { useFilesStore } from './stores/files'
import { useCommandPaletteStore } from './stores/commandPalette'
import { useSettingsStore } from './stores/settings'
import { useGitStore } from './stores/git'
import { hydrateFromDisk, initPersistence } from './stores/persistence'
import { useEffectiveTheme, applyThemeClass } from './lib/theme'

export default function App(): JSX.Element {
  const [ready, setReady] = useState(false)
  const { leftVisible, centerVisible, rightVisible, panelSizes, setPanelSizes } = useLayoutStore()
  const statusBarVisible = useSettingsStore((s) => s.settings.statusBarVisible)
  const effectiveTheme = useEffectiveTheme()

  const groupRef = useRef<ImperativePanelGroupHandle>(null)

  useKeyboardShortcuts()

  // Drive the whole UI's `ink-*` colors: toggle `.theme-light` on <html> whenever
  // the resolved theme (setting + OS preference) changes.
  useEffect(() => {
    applyThemeClass(effectiveTheme)
  }, [effectiveTheme])

  // Boot: load project, restore workspace, start watchers + persistence.
  useEffect(() => {
    let stop: (() => void) | undefined
    let stopSettings: (() => void) | undefined
    void (async () => {
      const info = await window.ide.project.getInfo()
      useProjectStore.getState().setInfo(info)
      document.title = info.name

      // Kick the first git status now (fire-and-forget) so its cold start — the
      // macOS CLT `git` shim can take a couple seconds on the very first spawn —
      // overlaps the rest of boot instead of stalling the status bar on mount.
      void useGitStore.getState().refresh()

      // Load app settings before hydrating so markdown tabs open in the right mode.
      stopSettings = await useSettingsStore.getState().init()

      await hydrateFromDisk()
      if (useTerminalsStore.getState().terminals.length === 0) {
        useTerminalsStore.getState().addTerminal()
      }

      // Ensure a layout preset is always selected on launch: if the restored
      // layout doesn't correspond to any preset, snap to the first one.
      const { layoutPresets } = useSettingsStore.getState().settings
      const layout = useLayoutStore.getState()
      if (layoutPresets.length > 0 && !layoutPresets.some((p) => layoutMatchesPreset(layout, p))) {
        layout.applyPreset(layoutPresets[0])
      }

      await window.ide.fs.watch()
      await window.ide.session.watch()
      stop = initPersistence()
      setReady(true)
      console.log('[ide] renderer ready:', info.name)
    })()
    return () => {
      stop?.()
      stopSettings?.()
    }
  }, [])

  // Route filesystem events to the tree (editors handle their own file individually).
  useEffect(() => {
    return window.ide.fs.onChanged((e) => {
      void useFilesStore.getState().handleFsChange(e)
      // Drop the quick-open cache when files appear/disappear (not on edits).
      if (e.kind !== 'change') useCommandPaletteStore.getState().invalidate()
    })
  }, [])

  // Apply visibility as ONE atomic layout (spec §7). Doing this per-panel (three
  // expand/collapse calls) let the library re-layout between calls and produced
  // half-applied states when a preset flipped several at once. Instead compute the
  // full [left, center, right] layout in one pass: each visible non-filler panel
  // keeps its sticky width, and the filler (editor, else terminal) absorbs the
  // rest — so toggling panels never resizes the sidebar.
  useEffect(() => {
    if (!ready) return
    const { panelSizes } = useLayoutStore.getState()
    const vis: [boolean, boolean, boolean] = [leftVisible, centerVisible, rightVisible]
    groupRef.current?.setLayout(computeLayout(vis, panelSizes))
  }, [leftVisible, centerVisible, rightVisible, ready])

  const handleLayout = (sizes: number[]): void => {
    if (sizes.length !== 3) return
    // Persist a panel's width only while it's a visible, non-filler panel. The
    // filler's size is derived (100 − others), so recording it would let a
    // stretched terminal overwrite the sidebar's remembered width, etc.
    const { leftVisible: l, centerVisible: c, rightVisible: r, panelSizes } = useLayoutStore.getState()
    const vis: [boolean, boolean, boolean] = [l, c, r]
    const filler = fillerIndex(vis)
    const next: [number, number, number] = [...panelSizes]
    let changed = false
    for (let i = 0; i < 3; i++) {
      if (vis[i] && i !== filler && Math.abs(next[i] - sizes[i]) > 0.01) {
        next[i] = sizes[i]
        changed = true
      }
    }
    if (changed) setPanelSizes(next)
  }

  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      {/* Headless: owns all WebContentsView lifecycle/bounds (spec §5.3). */}
      <BrowserManager />
      {ready && (
        <PanelGroup
          ref={groupRef}
          direction="horizontal"
          className="min-h-0 flex-1"
          onLayout={handleLayout}
        >
          <Panel order={1} collapsible collapsedSize={0} minSize={12} defaultSize={panelSizes[0]}>
            <FileBrowser />
          </Panel>
          <PanelResizeHandle className="resize-handle" />
          <Panel order={2} collapsible collapsedSize={0} minSize={20} defaultSize={panelSizes[1]}>
            <CenterPanel />
          </Panel>
          <PanelResizeHandle className="resize-handle" />
          <Panel order={3} collapsible collapsedSize={0} minSize={15} defaultSize={panelSizes[2]}>
            <TerminalPanel />
          </Panel>
        </PanelGroup>
      )}
      {ready && statusBarVisible && <StatusBar />}
      <CommandPalette />
    </div>
  )
}
