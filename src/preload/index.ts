import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC } from '../shared/ipc'
import type {
  AppSettings,
  BrowserFaviconEvent,
  BrowserFindOptions,
  BrowserFoundEvent,
  BrowserNavEvent,
  BrowserNewTabEvent,
  BrowserOpenFindEvent,
  BrowserOpenPaletteEvent,
  BrowserStopFindAction,
  BrowserTitleEvent,
  CrashReport,
  CrashReportMeta,
  DirEntry,
  FsChangeEvent,
  GitStatus,
  PickedElement,
  ProjectInfo,
  PtyCreateOptions,
  PtyCreateResult,
  PtyDataEvent,
  PtyExitEvent,
  PtyForeground,
  ReadFileResult,
  Rect,
  RendererErrorPayload,
  SessionUpdateEvent,
  WorkspaceState
} from '../shared/types'

/** Subscribe helper: returns an unsubscribe function. */
function on<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: Electron.IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api = {
  project: {
    getInfo: (): Promise<ProjectInfo> => ipcRenderer.invoke(IPC.projectGetInfo),
    open: (): Promise<void> => ipcRenderer.invoke(IPC.projectOpen)
  },

  fs: {
    readDir: (path: string): Promise<DirEntry[]> => ipcRenderer.invoke(IPC.fsReadDir, path),
    readFile: (path: string): Promise<ReadFileResult> => ipcRenderer.invoke(IPC.fsReadFile, path),
    writeFile: (path: string, content: string): Promise<void> =>
      ipcRenderer.invoke(IPC.fsWriteFile, path, content),
    createFile: (path: string): Promise<void> => ipcRenderer.invoke(IPC.fsCreateFile, path),
    createDir: (path: string): Promise<void> => ipcRenderer.invoke(IPC.fsCreateDir, path),
    rename: (oldPath: string, newPath: string): Promise<void> =>
      ipcRenderer.invoke(IPC.fsRename, oldPath, newPath),
    trash: (path: string): Promise<void> => ipcRenderer.invoke(IPC.fsTrash, path),
    reveal: (path: string): Promise<void> => ipcRenderer.invoke(IPC.fsReveal, path),
    /** Flat list of every project file (absolute paths) for quick-open (⌘P). */
    listFiles: (): Promise<string[]> => ipcRenderer.invoke(IPC.fsListFiles),
    /** Begin watching the project root; changes arrive via `onChanged`. */
    watch: (): Promise<void> => ipcRenderer.invoke(IPC.fsWatchStart),
    onChanged: (cb: (e: FsChangeEvent) => void): (() => void) => on(IPC.evtFsChanged, cb)
  },

  pty: {
    create: (opts: PtyCreateOptions): Promise<PtyCreateResult> =>
      ipcRenderer.invoke(IPC.ptyCreate, opts),
    write: (ptyId: string, data: string): void => {
      ipcRenderer.send(IPC.ptyWrite, ptyId, data)
    },
    resize: (ptyId: string, cols: number, rows: number): void => {
      ipcRenderer.send(IPC.ptyResize, ptyId, cols, rows)
    },
    kill: (ptyId: string): Promise<void> => ipcRenderer.invoke(IPC.ptyKill, ptyId),
    foreground: (ptyId: string): Promise<PtyForeground> =>
      ipcRenderer.invoke(IPC.ptyForeground, ptyId),
    onData: (cb: (e: PtyDataEvent) => void): (() => void) => on(IPC.evtPtyData, cb),
    onExit: (cb: (e: PtyExitEvent) => void): (() => void) => on(IPC.evtPtyExit, cb)
  },

  browser: {
    create: (tabId: string, url: string): Promise<void> =>
      ipcRenderer.invoke(IPC.browserCreate, tabId, url),
    destroy: (tabId: string): Promise<void> => ipcRenderer.invoke(IPC.browserDestroy, tabId),
    setBounds: (tabId: string, rect: Rect): void => {
      ipcRenderer.send(IPC.browserSetBounds, tabId, rect)
    },
    setVisible: (tabIds: string[]): Promise<void> =>
      ipcRenderer.invoke(IPC.browserSetVisible, tabIds),
    navigate: (tabId: string, url: string): Promise<void> =>
      ipcRenderer.invoke(IPC.browserNavigate, tabId, url),
    back: (tabId: string): Promise<void> => ipcRenderer.invoke(IPC.browserBack, tabId),
    forward: (tabId: string): Promise<void> => ipcRenderer.invoke(IPC.browserForward, tabId),
    reload: (tabId: string): Promise<void> => ipcRenderer.invoke(IPC.browserReload, tabId),
    /** Toggle inline devtools; resolves with the new open state (true = now open). */
    openDevTools: (tabId: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC.browserOpenDevTools, tabId),
    /** Enter "select element" mode; resolves with the picked element or null (cancel). */
    pickElement: (tabId: string): Promise<PickedElement | null> =>
      ipcRenderer.invoke(IPC.browserPickElement, tabId),
    /** Cancel an in-flight element pick (toolbar toggle-off). */
    cancelPickElement: (tabId: string): Promise<void> =>
      ipcRenderer.invoke(IPC.browserCancelPickElement, tabId),
    /** Find text in the page (empty string clears the highlight). */
    find: (tabId: string, text: string, opts?: BrowserFindOptions): void => {
      ipcRenderer.send(IPC.browserFind, tabId, text, opts ?? {})
    },
    /** Stop an active find, optionally clearing/keeping the selection. */
    stopFind: (tabId: string, action?: BrowserStopFindAction): void => {
      ipcRenderer.send(IPC.browserStopFind, tabId, action ?? 'clearSelection')
    },
    onDidNavigate: (cb: (e: BrowserNavEvent) => void): (() => void) => on(IPC.evtBrowserNav, cb),
    onTitleUpdated: (cb: (e: BrowserTitleEvent) => void): (() => void) =>
      on(IPC.evtBrowserTitle, cb),
    onFaviconUpdated: (cb: (e: BrowserFaviconEvent) => void): (() => void) =>
      on(IPC.evtBrowserFavicon, cb),
    onNewTab: (cb: (e: BrowserNewTabEvent) => void): (() => void) => on(IPC.evtBrowserNewTab, cb),
    onFound: (cb: (e: BrowserFoundEvent) => void): (() => void) => on(IPC.evtBrowserFound, cb),
    onOpenFind: (cb: (e: BrowserOpenFindEvent) => void): (() => void) =>
      on(IPC.evtBrowserOpenFind, cb),
    onOpenPalette: (cb: (e: BrowserOpenPaletteEvent) => void): (() => void) =>
      on(IPC.evtBrowserOpenPalette, cb)
  },

  workspace: {
    getState: (): Promise<WorkspaceState> => ipcRenderer.invoke(IPC.workspaceGetState),
    saveState: (state: WorkspaceState): Promise<void> =>
      ipcRenderer.invoke(IPC.workspaceSaveState, state)
  },

  git: {
    /** Read a one-shot git status snapshot for the project root. */
    status: (): Promise<GitStatus> => ipcRenderer.invoke(IPC.gitStatus)
  },

  session: {
    /** Start watching Claude Code session metadata for this project (spec §6). */
    watch: (): Promise<void> => ipcRenderer.invoke(IPC.sessionWatchStart),
    onUpdate: (cb: (e: SessionUpdateEvent) => void): (() => void) => on(IPC.evtSessionUpdate, cb)
  },

  logs: {
    /** All stored crash reports, newest first (metadata only). */
    list: (): Promise<CrashReportMeta[]> => ipcRenderer.invoke(IPC.logList),
    /** Full report by id, or null if missing. */
    read: (id: string): Promise<CrashReport | null> => ipcRenderer.invoke(IPC.logRead, id),
    /** Delete all reports; resolves to the number removed. */
    clear: (): Promise<number> => ipcRenderer.invoke(IPC.logClear),
    /** Reveal a report file (or the reports folder when no id) in the OS file manager. */
    reveal: (id?: string): Promise<void> => ipcRenderer.invoke(IPC.logReveal, id),
    /** Record a renderer-side error to disk; resolves to the new report id. */
    report: (payload: RendererErrorPayload): Promise<string | null> =>
      ipcRenderer.invoke(IPC.logReport, payload),
    /** Fires when any process records a new report (live indicator refresh). */
    onReported: (cb: (e: CrashReportMeta) => void): (() => void) => on(IPC.evtCrashReported, cb)
  },

  settings: {
    // main is schema-agnostic, so these carry a RAW (unvalidated, possibly
    // partial) settings object — the renderer normalizes with `normalizeSettings`.
    /** Current raw settings object. */
    get: (): Promise<Partial<AppSettings>> => ipcRenderer.invoke(IPC.settingsGet),
    /** Raw settings.json text + its absolute path (for the JSON editor). */
    getRaw: (): Promise<{ path: string; content: string }> =>
      ipcRenderer.invoke(IPC.settingsGetRaw),
    /** Write raw JSON text; applies live when it parses. */
    setRaw: (content: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.settingsSetRaw, content),
    /** Merge a partial patch (used by the Settings UI). Resolves to the raw result. */
    update: (patch: Partial<AppSettings>): Promise<Partial<AppSettings>> =>
      ipcRenderer.invoke(IPC.settingsUpdate, patch),
    /** Fires whenever settings change (any window, UI, JSON, or external edit). */
    onChanged: (cb: (s: Partial<AppSettings>) => void): (() => void) =>
      on(IPC.evtSettingsChanged, cb)
  },

  dialog: {
    /** Native 3-button unsaved-changes prompt. Resolves to the chosen action. */
    confirmClose: (name: string): Promise<'save' | 'dontSave' | 'cancel'> =>
      ipcRenderer.invoke(IPC.dialogConfirmClose, name)
  },

  files: {
    // Electron 32+ removed the non-standard `File.path`; `webUtils.getPathForFile`
    // is the supported way to resolve the absolute path of a drag-and-dropped file.
    // Returns '' if the File isn't backed by a real OS path.
    pathForFile: (file: File): string => {
      try {
        return webUtils.getPathForFile(file)
      } catch {
        return ''
      }
    }
  },

  window: {
    minimize: (): void => {
      ipcRenderer.send(IPC.windowMinimize)
    },
    maximize: (): void => {
      ipcRenderer.send(IPC.windowMaximize)
    },
    close: (): void => {
      ipcRenderer.send(IPC.windowClose)
    }
  }
}

export type IdeApi = typeof api

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('ide', api)
} else {
  // Fallback for the unlikely case contextIsolation is disabled.
  // @ts-ignore — window typing provided by index.d.ts
  window.ide = api
}
