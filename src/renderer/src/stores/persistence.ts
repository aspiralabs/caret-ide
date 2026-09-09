import {
  WORKSPACE_STATE_VERSION,
  type PersistedCenterTab,
  type WorkspaceState
} from '@shared/types'
import { useLayoutStore } from './layout'
import { useTabsStore } from './tabs'
import { useTerminalsStore } from './terminals'
import { useFilesStore } from './files'

function buildWorkspaceState(): WorkspaceState {
  const layout = useLayoutStore.getState()
  const tabs = useTabsStore.getState()
  const terms = useTerminalsStore.getState()
  const files = useFilesStore.getState()

  const centerTabs: PersistedCenterTab[] = tabs.tabs
    // Settings (UI / JSON) tabs are transient — never persisted across restarts.
    .filter((t) => t.kind === 'editor' || t.kind === 'browser')
    .map((t) =>
      t.kind === 'editor'
        ? { id: t.id, kind: 'editor', filePath: t.filePath }
        : { id: t.id, kind: 'browser', url: t.url, title: t.title }
    )

  return {
    version: WORKSPACE_STATE_VERSION,
    layout: {
      leftVisible: layout.leftVisible,
      rightVisible: layout.rightVisible,
      centerVisible: layout.centerVisible,
      panelSizes: layout.panelSizes
    },
    centerTabs,
    activeCenterTabId: tabs.activeId,
    terminalTabs: terms.terminals.map((t) => ({
      id: t.id,
      label: t.label,
      customName: t.customName
    })),
    expandedDirs: files.expandedList(),
    wordWrap: layout.wordWrap,
    defaultBrowserUrl: layout.defaultBrowserUrl
  }
}

let timer: ReturnType<typeof setTimeout> | null = null
function scheduleSave(): void {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    void window.ide.workspace.saveState(buildWorkspaceState())
  }, 400)
}

export async function hydrateFromDisk(): Promise<WorkspaceState> {
  const ws = await window.ide.workspace.getState()
  useLayoutStore.getState().hydrate(ws)
  useTabsStore.getState().hydrate(ws)
  useTerminalsStore.getState().hydrate(ws)
  await useFilesStore.getState().hydrate(ws)
  return ws
}

/** Subscribe to store changes and persist (debounced). Returns an unsubscribe fn. */
export function initPersistence(): () => void {
  const unsubs = [
    useLayoutStore.subscribe(scheduleSave),
    useTabsStore.subscribe(scheduleSave),
    useTerminalsStore.subscribe(scheduleSave),
    useFilesStore.subscribe(scheduleSave)
  ]
  // Flush on window close.
  const onBeforeUnload = (): void => {
    void window.ide.workspace.saveState(buildWorkspaceState())
  }
  window.addEventListener('beforeunload', onBeforeUnload)
  return () => {
    unsubs.forEach((u) => u())
    window.removeEventListener('beforeunload', onBeforeUnload)
  }
}
