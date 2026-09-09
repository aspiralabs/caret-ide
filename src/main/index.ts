import { app, BrowserWindow, dialog, ipcMain, Menu, type MenuItemConstructorOptions } from 'electron'
import { statSync } from 'fs'
import { resolve } from 'path'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { IPC } from '../shared/ipc'
import {
  createProjectWindow,
  createOrFocusWelcomeWindow,
  closeWelcomeWindow,
  focusIfOpen,
  projectInfo,
  projectWindowFor
} from './window'
import { addRecentProject, getRecentProjects } from './recentProjects'
import { registerFsIpc } from './ipc/fs'
import { registerPtyIpc } from './ipc/pty'
import { registerBrowserIpc } from './ipc/browser'
import { registerWorkspaceIpc } from './ipc/workspace'
import { registerSessionIpc } from './ipc/session'
import { registerGitIpc } from './ipc/git'
import { registerSettingsIpc } from './ipc/settings'
import { installCrashReporting } from './logger'

function openProjectPath(root: string): void {
  // Record every open (CLI, picker, welcome, recent) so the welcome MRU stays current.
  addRecentProject(root, Date.now())
  if (focusIfOpen(root)) return
  createProjectWindow(root)
}

/**
 * Extract an absolute directory from `--dir <path>` in an argv list (used by the
 * `caret <dir>` CLI). Returns null if absent or not an existing directory.
 */
function parseDirArg(argv: string[], cwd: string): string | null {
  const i = argv.indexOf('--dir')
  if (i === -1 || i + 1 >= argv.length) return null
  const p = resolve(cwd, argv[i + 1])
  try {
    return statSync(p).isDirectory() ? p : null
  } catch {
    return null
  }
}

/** Show the native folder picker and open the chosen folder as a project window. */
async function openProjectFlow(): Promise<boolean> {
  const res = await dialog.showOpenDialog({
    title: 'Open Project',
    buttonLabel: 'Open',
    properties: ['openDirectory', 'createDirectory']
  })
  if (res.canceled || !res.filePaths[0]) return false
  openProjectPath(res.filePaths[0])
  return true
}

function buildMenu(): void {
  const isMac = process.platform === 'darwin'
  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [{ role: 'appMenu' as const }]
      : []),
    {
      label: 'File',
      submenu: [
        { label: 'Open Project…', accelerator: 'CmdOrCtrl+O', click: () => openProjectFlow() },
        { type: 'separator' },
        isMac ? { role: 'close' as const, accelerator: '' } : { role: 'quit' as const }
      ]
    },
    // Edit menu kept so ⌘C/⌘V/⌘X/undo work inside inputs and xterm.
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        // Note: no ⌘R reload role here — the renderer owns ⌘R to reload the
        // active browser preview (spec §8). Force-reload the app via ⌥⌘R.
        { role: 'forceReload', accelerator: 'Alt+CmdOrCtrl+R' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function registerCoreIpc(): void {
  ipcMain.handle(IPC.projectGetInfo, (e) => {
    const pw = projectWindowFor(e.sender)
    if (!pw) throw new Error('No project window for sender')
    return projectInfo(pw)
  })
  ipcMain.handle(IPC.projectOpen, () => openProjectFlow())

  // --- Welcome screen ---
  ipcMain.handle(IPC.recentList, () => getRecentProjects())

  // "Open project" from the welcome screen: show the picker, and if a folder is
  // chosen, open it and dismiss the welcome window.
  ipcMain.handle(IPC.welcomePick, async () => {
    const opened = await openProjectFlow()
    if (opened) closeWelcomeWindow()
    return opened
  })

  // Open a specific recent project from the welcome screen, then dismiss it.
  ipcMain.handle(IPC.welcomeOpenPath, (_e, root: string) => {
    openProjectPath(root)
    closeWelcomeWindow()
  })

  // Native "unsaved changes" prompt with three real choices (window.confirm can
  // only offer two). Returns which button the user picked.
  ipcMain.handle(IPC.dialogConfirmClose, async (e, name: string) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const opts = {
      type: 'warning' as const,
      buttons: ['Save', "Don't Save", 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      message: `Do you want to save the changes you made to "${name}"?`,
      detail: "Your changes will be lost if you don't save them."
    }
    const { response } = win
      ? await dialog.showMessageBox(win, opts)
      : await dialog.showMessageBox(opts)
    return response === 0 ? 'save' : response === 1 ? 'dontSave' : 'cancel'
  })

  ipcMain.on(IPC.windowMinimize, (e) => BrowserWindow.fromWebContents(e.sender)?.minimize())
  ipcMain.on(IPC.windowMaximize, (e) => {
    const w = BrowserWindow.fromWebContents(e.sender)
    if (!w) return
    w.isMaximized() ? w.unmaximize() : w.maximize()
  })
  ipcMain.on(IPC.windowClose, (e) => BrowserWindow.fromWebContents(e.sender)?.close())
}

// App name (About panel, notifications, packaged menu bar). In dev the bold
// menu-bar title still reads "Electron" — that comes from the unpackaged
// Electron.app bundle and only reflects productName once packaged.
app.setName('Caret')

// Isolate the dev-server instance (hot reload) from the built app. Without this
// they'd share one single-instance lock, so `caret <dir>` — which launches the
// built out/ bundle — would route into the hot-reloading dev window instead of
// the built app. A separate userData dir gives the dev instance its own lock.
if (process.env.ELECTRON_RENDERER_URL) {
  app.setPath('userData', `${app.getPath('userData')}-dev`)
}

// Single-instance: a second `caret <dir>` launch forwards its path to the
// already-running Caret rather than starting a duplicate app.
const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
  app.quit()
}

app.on('second-instance', (_e, argv, workingDirectory) => {
  const dir = parseDirArg(argv, workingDirectory)
  if (dir) {
    openProjectPath(dir)
  } else {
    // No path given (bare relaunch): just surface an existing window.
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  }
})

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) return
  electronApp.setAppUserModelId('co.aspiralabs.caret')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Install crash handlers first so failures during the rest of boot are logged.
  installCrashReporting()

  buildMenu()
  registerCoreIpc()

  // Feature IPC modules self-register their handlers and self-clean per-window
  // state via window.onWindowClosed.
  registerFsIpc()
  registerPtyIpc()
  registerBrowserIpc()
  registerWorkspaceIpc()
  registerSessionIpc()
  registerGitIpc()
  registerSettingsIpc()

  // Non-interactive smoke test: open a known folder and exit, bypassing the
  // modal folder picker. Used to verify boot (node-pty ABI, preload load,
  // window creation) in CI / headless runs. Set SMOKE_TEST=1 [SMOKE_PROJECT=/path].
  if (process.env.SMOKE_TEST) {
    const root = process.env.SMOKE_PROJECT || app.getPath('home')
    const pw = focusIfOpen(root) ? undefined : createProjectWindow(root)
    const wc = pw?.win.webContents
    wc?.on('console-message', (_e, level, message) => {
      console.log(`SMOKE_RENDERER[${level}]: ${message}`)
    })
    wc?.on('render-process-gone', (_e, d) => console.log('SMOKE_RENDERER_GONE:', d.reason))
    wc?.on('did-finish-load', () => {
      console.log('SMOKE_RENDERER: did-finish-load')
      // Drive a real pty echo round-trip through the renderer's window.ide API —
      // exercises preload -> IPC -> node-pty -> data event end to end (spec M1).
      const script = `new Promise((resolve) => {
        const timeout = setTimeout(() => resolve('PTY_TIMEOUT'), 4000)
        let buf = ''
        const off = window.ide.pty.onData((e) => {
          buf += e.data
          if (buf.includes('__smoke_pty__')) { clearTimeout(timeout); off(); resolve('PTY_OK') }
        })
        window.ide.pty.create({ cwd: ${JSON.stringify(root)}, cols: 80, rows: 24 })
          .then(({ ptyId }) => window.ide.pty.write(ptyId, 'echo __smoke_pty__\\r'))
          .catch((err) => resolve('PTY_ERR:' + err.message))
      })`
      wc.executeJavaScript(script).then((r) => console.log('SMOKE_PTY:', r))

      // Drive a WebContentsView create + navigate round-trip (spec M2).
      const bscript = `new Promise((resolve) => {
        const timeout = setTimeout(() => resolve('BROWSER_TIMEOUT'), 4000)
        const off = window.ide.browser.onDidNavigate((e) => {
          if (e.tabId === 'smoke-tab') { clearTimeout(timeout); off(); resolve('BROWSER_OK:' + e.url) }
        })
        window.ide.browser.create('smoke-tab', 'about:blank')
          .catch((err) => resolve('BROWSER_ERR:' + err.message))
      })`
      wc.executeJavaScript(bscript).then((r) => console.log('SMOKE_BROWSER:', r))
    })
    setTimeout(() => {
      console.log('SMOKE_OK: window created for', root)
      app.exit(0)
    }, 8000)
    return
  }

  // Dev convenience: open a folder directly and skip the picker (window stays up
  // even if you'd otherwise cancel the dialog). e.g. IDE_OPEN_PROJECT=/path npm run dev
  // Open target precedence: explicit env (dev) → `caret --dir <path>` → picker.
  const cliDir = parseDirArg(process.argv, process.cwd())
  if (process.env.IDE_OPEN_PROJECT) {
    openProjectPath(process.env.IDE_OPEN_PROJECT)
  } else if (cliDir) {
    openProjectPath(cliDir)
  } else {
    // No project specified: greet with the welcome screen (recent projects +
    // open button) instead of dropping straight into the native folder picker.
    createOrFocusWelcomeWindow()
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createOrFocusWelcomeWindow()
  })
})

app.on('window-all-closed', () => {
  // Single-purpose IDE: no tray/background mode. Quit when the last project closes.
  app.quit()
})
