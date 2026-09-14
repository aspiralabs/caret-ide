// ---------------------------------------------------------------------------
// Centralized IPC channel names so main and preload can never drift apart.
// `invoke`/`handle` channels are request/response; `event` channels are
// main -> renderer pushes.
// ---------------------------------------------------------------------------

export const IPC = {
  // filesystem (invoke)
  fsReadDir: 'fs:readDir',
  fsReadFile: 'fs:readFile',
  fsWriteFile: 'fs:writeFile',
  /** Write raw bytes (base64) — pasted images. */
  fsWriteBinary: 'fs:writeBinary',
  fsCreateFile: 'fs:createFile',
  fsCreateDir: 'fs:createDir',
  fsRename: 'fs:rename',
  fsTrash: 'fs:trash',
  fsReveal: 'fs:reveal',
  fsListFiles: 'fs:listFiles',
  fsReadDataUrl: 'fs:readDataUrl',
  fsWatchStart: 'fs:watchStart',

  // pty (invoke)
  ptyCreate: 'pty:create',
  ptyWrite: 'pty:write',
  ptyResize: 'pty:resize',
  ptyKill: 'pty:kill',
  ptyForeground: 'pty:foreground',

  // browser (invoke)
  browserCreate: 'browser:create',
  browserDestroy: 'browser:destroy',
  browserSetBounds: 'browser:setBounds',
  browserSetVisible: 'browser:setVisible',
  browserNavigate: 'browser:navigate',
  browserBack: 'browser:back',
  browserForward: 'browser:forward',
  browserReload: 'browser:reload',
  browserOpenDevTools: 'browser:openDevTools',
  browserPickElement: 'browser:pickElement',
  browserCancelPickElement: 'browser:cancelPickElement',
  browserFind: 'browser:find',
  browserStopFind: 'browser:stopFind',
  /** Renderer → main: the keychords to intercept while a preview page has focus. */
  browserSetChords: 'browser:setChords',
  browserSetZoom: 'browser:setZoom',

  // workspace / project (invoke)
  workspaceGetState: 'workspace:getState',
  workspaceSaveState: 'workspace:saveState',
  projectOpen: 'project:open',
  projectGetInfo: 'project:getInfo',

  // welcome screen (invoke)
  recentList: 'recent:list',
  welcomePick: 'welcome:pick',
  welcomeOpenPath: 'welcome:openPath',

  // project search (invoke)
  searchProject: 'search:project',

  // formatting (invoke)
  formatText: 'fmt:format',

  // git (invoke)
  gitStatus: 'git:status',
  /** Contents of a file at HEAD (null when not tracked). */
  gitShowHead: 'git:showHead',

  // session watcher (invoke)
  sessionWatchStart: 'session:watchStart',
  /** Recent Claude Code sessions for this project (for "Resume …"). */
  sessionList: 'session:list',

  // crash reporting / diagnostics (invoke)
  logList: 'log:list',
  logRead: 'log:read',
  logClear: 'log:clear',
  logReveal: 'log:reveal',
  logReport: 'log:report',

  // app settings (invoke)
  settingsGet: 'settings:get',
  settingsGetRaw: 'settings:getRaw',
  settingsSetRaw: 'settings:setRaw',
  settingsUpdate: 'settings:update',

  // native dialogs (invoke)
  dialogConfirmClose: 'dialog:confirmClose',

  // window controls (invoke)
  windowMinimize: 'window:minimize',
  windowMaximize: 'window:maximize',
  windowClose: 'window:close',
  /** Renderer → main: zoom factor for the app UI itself. */
  windowSetZoom: 'window:setZoom',
  /** Renderer → main: verdict for a pending close (true = go ahead). */
  windowCloseReply: 'window:closeReply',

  // ---- events (main -> renderer) ----
  evtFsChanged: 'fs:changed',
  evtPtyData: 'pty:data',
  evtPtyExit: 'pty:exit',
  evtBrowserNav: 'browser:did-navigate',
  evtBrowserTitle: 'browser:title-updated',
  evtBrowserFavicon: 'browser:favicon-updated',
  evtBrowserNewTab: 'browser:new-tab',
  evtBrowserFound: 'browser:found-in-page',
  /** Main → renderer: an intercepted keychord pressed while a preview page had focus. */
  evtBrowserChord: 'browser:chord',
  /** Main → renderer: a console error in a preview page (or a reset on navigation). */
  evtBrowserConsole: 'browser:console',
  evtSessionUpdate: 'session:update',
  evtCrashReported: 'log:reported',
  evtSettingsChanged: 'settings:changed',
  /** Main → renderer: the window is about to close; reply via windowCloseReply. */
  evtWindowCloseRequested: 'window:close-requested'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
