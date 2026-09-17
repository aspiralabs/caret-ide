import { app, BrowserWindow, dialog, ipcMain, Menu, type MenuItemConstructorOptions } from 'electron'
import { existsSync, statSync } from 'fs'
import { join, resolve } from 'path'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { IPC } from '../shared/ipc'
import { chordToAccelerator, type MenuCommandEvent, type MenuCommandItem, type MenuItemSpec, type MenuSpec } from '../shared/menu'
import type { ProjectProbe } from '../shared/types'
import {
  createProjectWindow,
  createOrFocusTerminalWindow,
  createOrFocusWelcomeWindow,
  closeWelcomeWindow,
  focusIfOpen,
  projectInfo,
  projectWindowFor,
  allProjectWindows,
  onWindowClosed,
  replyClose,
  wasLastClosedWelcome
} from './window'
import { addRecentProject, getRecentProjects, groupRecentProject, pinRecentProject, removeRecentProject } from './recentProjects'
import { registerFsIpc, watchExtraRoot, watchedRoots } from './ipc/fs'
import { readStartupMode, resolveBootTarget } from './bootMode'
import { registerPtyIpc } from './ipc/pty'
import { registerBrowserIpc, relayoutBrowserViews } from './ipc/browser'
import { registerWorkspaceIpc } from './ipc/workspace'
import { registerSessionIpc } from './ipc/session'
import { registerGitIpc } from './ipc/git'
import { registerSettingsIpc } from './ipc/settings'
import { registerSearchIpc } from './ipc/search'
import { registerFormatIpc } from './ipc/format'
import { registerUpdateIpc } from './updates'
import { installCrashReporting } from './logger'

function openProjectPath(root: string): void {
  // Record every open (CLI, picker, welcome, recent) so the welcome MRU stays current.
  addRecentProject(root, Date.now())
  // Keep the Dock's "Open Recent" list in sync with what we just opened.
  buildDockMenu()
  if (!focusIfOpen(root)) createProjectWindow(root)
  // A project is now showing, whichever route opened it (Dock, CLI, second
  // instance, welcome buttons) — the welcome screen has done its job.
  closeWelcomeWindow()
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

/** The last spec the renderer sent; null until it boots (fallback menu below). */
let menuSpec: MenuSpec[] | null = null
let acceleratorsSuspended = false

/**
 * Menu command ids main handles itself. "New Terminal Window" must work with
 * only the welcome screen open (which runs no command loop), so it never
 * round-trips through a renderer.
 */
const MAIN_MENU_COMMANDS: Record<string, () => void> = {
  'new-terminal-window': () => createOrFocusTerminalWindow()
}

/** Send a menu click to the focused project window as a command / chord. */
function dispatchMenuCommand(item: MenuCommandItem): void {
  const local = MAIN_MENU_COMMANDS[item.id]
  if (local) {
    local()
    return
  }
  const win = BrowserWindow.getFocusedWindow() ?? allProjectWindows()[0]?.win
  if (!win || win.isDestroyed()) return
  const payload: MenuCommandEvent = { id: item.id, chord: item.chord }
  win.webContents.send(IPC.evtMenuCommand, payload)
}

function itemFromSpec(item: MenuItemSpec): MenuItemConstructorOptions {
  if (item.type === 'separator') return { type: 'separator' }
  if (item.type === 'role') {
    return {
      role: item.role as MenuItemConstructorOptions['role'],
      ...(item.label ? { label: item.label } : {}),
      ...(item.accelerator && !acceleratorsSuspended ? { accelerator: item.accelerator } : {})
    }
  }
  const accelerator = item.chord && !acceleratorsSuspended ? chordToAccelerator(item.chord) : null
  return {
    label: item.label,
    ...(accelerator ? { accelerator } : {}),
    click: () => dispatchMenuCommand(item)
  }
}

/** Build the native menu from the renderer's spec (menuSpec) or the minimal fallback. */
function buildMenuFromSpec(spec: MenuSpec[]): void {
  const template: MenuItemConstructorOptions[] = spec.map((menu) => {
    if (menu.role === 'appMenu') return { role: 'appMenu' as const }
    if (menu.role === 'editMenu') return { role: 'editMenu' as const }
    if (menu.role === 'windowMenu') return { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }] }
    return { label: menu.label, submenu: menu.items.map(itemFromSpec) }
  })
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function buildMenu(): void {
  if (menuSpec) {
    buildMenuFromSpec(menuSpec)
    return
  }
  const isMac = process.platform === 'darwin'
  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [{ role: 'appMenu' as const }]
      : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Terminal Window', click: () => createOrFocusTerminalWindow() },
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

/**
 * Build the macOS Dock right-click menu. Items here render above the OS-supplied
 * "Options / Show All Windows / Quit" section. No-op off macOS (app.dock is
 * macOS-only). Called at boot and whenever the recent list changes.
 */
function buildDockMenu(): void {
  if (process.platform !== 'darwin' || !app.dock) return
  const recents = getRecentProjects().slice(0, 8)
  const template: MenuItemConstructorOptions[] = [
    { label: 'New Terminal Window', click: () => createOrFocusTerminalWindow() },
    { label: 'Open Project…', click: () => openProjectFlow() },
    { label: 'Welcome Screen', click: () => createOrFocusWelcomeWindow() }
  ]

  // Jump directly to a specific open project window. The OS-supplied "Show All
  // Windows" only fans them out; this focuses one by name. Checkmark marks the
  // currently focused window.
  const open = allProjectWindows()
  if (open.length) {
    template.push(
      { type: 'separator' },
      {
        label: 'Open Windows',
        submenu: open.map((pw) => ({
          label: pw.name || pw.root,
          type: 'checkbox' as const,
          checked: pw.win.isFocused(),
          click: () => {
            if (pw.win.isMinimized()) pw.win.restore()
            pw.win.focus()
          }
        }))
      }
    )
  }

  if (recents.length) {
    template.push(
      { type: 'separator' },
      {
        label: 'Open Recent',
        submenu: recents.map((r) => ({
          label: r.name || r.root,
          click: () => openProjectPath(r.root)
        }))
      }
    )
  }
  app.dock.setMenu(Menu.buildFromTemplate(template))
}

function registerCoreIpc(): void {
  ipcMain.handle(IPC.projectGetInfo, (e) => {
    const pw = projectWindowFor(e.sender)
    if (!pw) throw new Error('No project window for sender')
    return projectInfo(pw)
  })
  ipcMain.handle(IPC.projectOpen, () => openProjectFlow())

  // Multi-root: extra folders a window may browse/edit besides its project.
  ipcMain.handle(IPC.projectAddRoot, async (e) => {
    const pw = projectWindowFor(e.sender)
    if (!pw) return null
    const res = await dialog.showOpenDialog(pw.win, {
      title: 'Add Folder to Workspace',
      buttonLabel: 'Add',
      properties: ['openDirectory']
    })
    const dir = res.canceled ? null : (res.filePaths[0] ?? null)
    if (!dir || dir === pw.root || pw.extraRoots.includes(dir)) return null
    pw.extraRoots.push(dir)
    watchExtraRoot(pw, dir, true)
    return dir
  })
  ipcMain.handle(IPC.projectSetRoots, (e, roots: string[]) => {
    const pw = projectWindowFor(e.sender)
    if (!pw) return []
    const valid = (Array.isArray(roots) ? roots : [])
      .filter((r): r is string => typeof r === 'string' && r !== pw.root)
      .filter((r) => {
        try {
          return statSync(r).isDirectory()
        } catch {
          return false
        }
      })
    for (const r of pw.extraRoots) if (!valid.includes(r)) watchExtraRoot(pw, r, false)
    for (const r of valid) if (!pw.extraRoots.includes(r)) watchExtraRoot(pw, r, true)
    pw.extraRoots = [...new Set(valid)]
    return pw.extraRoots
  })

  // Terminal mode's promotion offer: is this adopted folder a project in its own right?
  ipcMain.handle(IPC.projectProbe, (e, dir: string): ProjectProbe => {
    const pw = projectWindowFor(e.sender)
    if (!pw || typeof dir !== 'string' || !pw.extraRoots.includes(dir)) {
      return { recent: false, hasGit: false, hasPackageJson: false }
    }
    return {
      recent: getRecentProjects().some((r) => r.root === dir),
      hasGit: existsSync(join(dir, '.git')),
      hasPackageJson: existsSync(join(dir, 'package.json'))
    }
  })

  // --- Welcome screen ---
  ipcMain.handle(IPC.recentList, () => getRecentProjects())
  ipcMain.handle(IPC.recentRemove, (_e, root: string) => {
    removeRecentProject(root)
    buildDockMenu()
    return getRecentProjects()
  })
  ipcMain.handle(IPC.recentPin, (_e, root: string, pinned: boolean) => {
    pinRecentProject(root, pinned === true)
    return getRecentProjects()
  })
  ipcMain.handle(IPC.recentGroup, (_e, root: string, group: string | null) => {
    groupRecentProject(root, typeof group === 'string' ? group : null)
    return getRecentProjects()
  })

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
  ipcMain.handle(IPC.windowNewTerminal, () => {
    createOrFocusTerminalWindow()
  })
  ipcMain.on(IPC.windowCloseReply, (e, ok: boolean) => replyClose(e.sender, ok === true))

  ipcMain.on(IPC.menuSet, (_e, spec: MenuSpec[]) => {
    if (!Array.isArray(spec)) return
    menuSpec = spec
    buildMenu()
  })
  ipcMain.on(IPC.menuSuspendAccelerators, (_e, on: boolean) => {
    acceleratorsSuspended = on === true
    buildMenu()
  })
  ipcMain.on(IPC.windowSetZoom, (e, factor: number) => {
    if (typeof factor !== 'number' || !Number.isFinite(factor)) return
    e.sender.setZoomFactor(Math.min(3, Math.max(0.5, factor)))
    // Re-place the preview views: their bounds depend on the zoom factor.
    relayoutBrowserViews(e.sender)
  })
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
  buildDockMenu()
  // Keep the Dock's "Open Windows" list and its focus checkmark accurate as
  // windows open, close, and change focus. (Opens rebuild via openProjectPath.)
  onWindowClosed(() => buildDockMenu())
  app.on('browser-window-focus', () => buildDockMenu())
  app.on('browser-window-blur', () => buildDockMenu())
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
  registerSearchIpc()
  registerFormatIpc()
  registerUpdateIpc()

  // Non-interactive smoke test: open a known folder and exit, bypassing the
  // modal folder picker. Used to verify boot (node-pty ABI, preload load,
  // window creation) in CI / headless runs. Set SMOKE_TEST=1 [SMOKE_PROJECT=/path].
  if (process.env.SMOKE_TEST) {
    // SMOKE_MODE=terminal boots a terminal-mode window instead of a project:
    // the pty round-trip below must still pass, and no watcher may start (AC25).
    const terminalMode = process.env.SMOKE_MODE === 'terminal'
    const root = terminalMode ? app.getPath('home') : process.env.SMOKE_PROJECT || app.getPath('home')
    const pw = terminalMode ? createOrFocusTerminalWindow() : focusIfOpen(root) ? undefined : createProjectWindow(root)
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

      // Drive a Prettier format through main (loads the bundled prettier via
      // dynamic import — the thing most likely to break under asar packaging).
      const fscript = `window.ide.format.text({ path: ${JSON.stringify(root + '/__smoke__.ts')}, text: 'const a=1' })
        .then((r) => r.kind === 'formatted' && r.formatted === 'const a = 1;\\n' ? 'FORMAT_OK' : 'FORMAT_BAD:' + JSON.stringify(r))
        .catch((err) => 'FORMAT_ERR:' + err.message)`
      wc.executeJavaScript(fscript).then((r) => console.log('SMOKE_FORMAT:', r))
    })
    const logWatcher = (label: string): void => {
      if (!pw) return
      const watched = watchedRoots(pw.id)
      console.log(watched === undefined ? `${label}: none` : `${label}: ${JSON.stringify(watched)}`)
    }

    // Terminal mode with SMOKE_PROJECT: drive Switch to IDE end to end with
    // real input events — type `cd <project>` into the shell, wait for the
    // prompt (OSC 7), press ⌘⇧I — then assert the watcher covers exactly the
    // adopted folder (AC11, AC13, AC25). Before that the watcher must not exist.
    const driveSwitch = terminalMode && !!process.env.SMOKE_PROJECT && wc
    if (driveSwitch) {
      const dir = process.env.SMOKE_PROJECT as string
      const type = (text: string): void => {
        for (const ch of text) wc.sendInputEvent({ type: 'char', keyCode: ch })
      }
      setTimeout(() => {
        logWatcher('SMOKE_WATCHER_BEFORE')
        // Input events only reach xterm's textarea while the window has focus —
        // and on macOS a plain win.focus() won't take it from another app.
        app.focus({ steal: true })
        pw?.win.focus()
        wc.focus()
        type(`cd ${JSON.stringify(dir)}`)
        wc.sendInputEvent({ type: 'keyDown', keyCode: 'Return' })
        wc.sendInputEvent({ type: 'char', keyCode: '\r' })
        wc.sendInputEvent({ type: 'keyUp', keyCode: 'Return' })
        setTimeout(() => {
          wc.executeJavaScript('document.title').then((t) => console.log('SMOKE_TITLE_AFTER_CD:', t))
          wc.sendInputEvent({ type: 'keyDown', keyCode: 'I', modifiers: ['cmd', 'shift'] })
          wc.sendInputEvent({ type: 'keyUp', keyCode: 'I', modifiers: ['cmd', 'shift'] })
          setTimeout(() => {
            wc.executeJavaScript('document.title').then((t) => console.log('SMOKE_TITLE:', t))
            logWatcher('SMOKE_WATCHER_AFTER')
          }, 2500)
        }, 2000)
      }, 3500)
    }

    setTimeout(() => {
      if (terminalMode && !driveSwitch) logWatcher('SMOKE_WATCHER')
      console.log('SMOKE_OK: window created for', root)
      app.exit(0)
    }, driveSwitch ? 10000 : 8000)
    return
  }

  // Dev convenience: open a folder directly and skip the picker (window stays up
  // even if you'd otherwise cancel the dialog). e.g. IDE_OPEN_PROJECT=/path npm run dev
  // Open target precedence: explicit env (dev) → `caret --dir <path>` → the
  // startupMode setting (terminal window, else welcome screen). See bootMode.ts.
  const target = resolveBootTarget({
    envDir: process.env.IDE_OPEN_PROJECT,
    cliDir: parseDirArg(process.argv, process.cwd()),
    startupMode: readStartupMode(app.getPath('userData'))
  })
  console.log('[boot] target:', target.kind === 'project' ? `project ${target.root}` : target.kind)
  if (target.kind === 'project') openProjectPath(target.root)
  else if (target.kind === 'terminal') createOrFocusTerminalWindow()
  else createOrFocusWelcomeWindow()

  // Dock click with no windows: same rule as launch, re-read so a changed
  // setting applies without a restart.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length !== 0) return
    if (readStartupMode(app.getPath('userData')) === 'terminal') createOrFocusTerminalWindow()
    else createOrFocusWelcomeWindow()
  })
})

app.on('window-all-closed', () => {
  // Single-purpose IDE: no tray/background mode. Quit when the last PROJECT
  // window closes. Dismissing the welcome screen or a terminal-mode window on
  // macOS keeps the app alive (Dock click / `activate` reopens one), like any
  // other Mac app.
  if (process.platform === 'darwin' && wasLastClosedWelcome()) return
  app.quit()
})
