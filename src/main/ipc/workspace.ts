// ---------------------------------------------------------------------------
// Persisted workspace state (spec §4) — one electron-store, keyed by project.
//
// electron-store interprets dots in a key as nested-object paths, and our keys
// are absolute filesystem paths (dots + slashes everywhere). To sidestep that,
// all project states live under a single top-level `projects` object whose
// VALUE keys are the raw project roots — set atomically via a get/merge/set of
// the whole record, so the path string is never parsed as a key path.
// ---------------------------------------------------------------------------

import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import Store from 'electron-store'
import { IPC } from '../../shared/ipc'
import {
  defaultWorkspaceState,
  WORKSPACE_STATE_VERSION,
  type WorkspaceState
} from '../../shared/types'
import { projectWindowFor, type ProjectWindow } from '../window'

interface StoreSchema {
  projects: Record<string, WorkspaceState>
}

const store = new Store<StoreSchema>({ name: 'workspaces' })

function requireWindow(event: IpcMainInvokeEvent): ProjectWindow {
  const pw = projectWindowFor(event.sender)
  if (!pw) throw new Error('No project window for sender')
  return pw
}

function getState(root: string): WorkspaceState {
  const projects = store.get('projects', {} as Record<string, WorkspaceState>)
  const state = projects[root]
  // Missing or version-mismatched state → fall back to defaults (spec §4).
  if (!state || state.version !== WORKSPACE_STATE_VERSION) {
    return defaultWorkspaceState()
  }
  return state
}

function saveState(root: string, state: WorkspaceState): void {
  const projects = store.get('projects', {} as Record<string, WorkspaceState>)
  projects[root] = state
  store.set('projects', projects)
}

export function registerWorkspaceIpc(): void {
  ipcMain.handle(IPC.workspaceGetState, (event) => {
    const pw = requireWindow(event)
    return getState(pw.root)
  })

  ipcMain.handle(IPC.workspaceSaveState, (event, state: WorkspaceState) => {
    const pw = requireWindow(event)
    saveState(pw.root, state)
  })
}
