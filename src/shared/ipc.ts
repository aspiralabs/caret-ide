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
  fsCreateFile: 'fs:createFile',
  fsCreateDir: 'fs:createDir',
  fsRename: 'fs:rename',
  fsTrash: 'fs:trash',
  fsReveal: 'fs:reveal',
  fsListFiles: 'fs:listFiles',
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

  // workspace / project (invoke)
  workspaceGetState: 'workspace:getState',
  workspaceSaveState: 'workspace:saveState',
  projectOpen: 'project:open',
  projectGetInfo: 'project:getInfo',

  // welcome screen (invoke)
  recentList: 'recent:list',
  welcomePick: 'welcome:pick',
  welcomeOpenPath: 'welcome:openPath',

  // git (invoke)
  gitStatus: 'git:status',

  // session watcher (invoke)
  sessionWatchStart: 'session:watchStart',

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

  // ---- events (main -> renderer) ----
  evtFsChanged: 'fs:changed',
  evtPtyData: 'pty:data',
  evtPtyExit: 'pty:exit',
  evtBrowserNav: 'browser:did-navigate',
  evtBrowserTitle: 'browser:title-updated',
  evtBrowserFavicon: 'browser:favicon-updated',
  evtBrowserNewTab: 'browser:new-tab',
  evtBrowserFound: 'browser:found-in-page',
  evtBrowserOpenFind: 'browser:open-find',
  evtBrowserOpenPalette: 'browser:open-palette',
  evtSessionUpdate: 'session:update',
  evtCrashReported: 'log:reported',
  evtSettingsChanged: 'settings:changed'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
