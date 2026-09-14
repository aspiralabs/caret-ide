// ---------------------------------------------------------------------------
// Filesystem IPC (spec §3, §5.1, §9.4).
//
// Main process owns ALL filesystem access. Every path arriving from the
// renderer is validated with `assertInsideRoot` against the owning window's
// project root before it is touched. One chokidar watcher runs per window.
// ---------------------------------------------------------------------------

import { promises as fsp } from 'fs'
import { basename, dirname, join } from 'path'
import { randomBytes } from 'crypto'
import { execFile } from 'child_process'
import { ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import chokidar, { type FSWatcher } from 'chokidar'
import { IPC } from '../../shared/ipc'
import type { DirEntry, FileTextMeta, FsChangeEvent, FsChangeKind, ReadFileResult } from '../../shared/types'
import { assertInsideRoot } from '../security'
import { decodeText, encodeText } from './textDecode'
import { onWindowClosed, projectWindowFor, type ProjectWindow } from '../window'

/** Directories displayed in the tree but never watched (spec §5.1). */
const IGNORE_DIRS = new Set(['node_modules', '.git', '.next', 'dist'])

/**
 * Batch-check which of `paths` (absolute) are git-ignored, via a single
 * `git check-ignore` run in `root`. Returns a Set of the ignored absolute
 * paths. Resolves empty on any failure (git missing, not a repo) or when
 * nothing matches — check-ignore exits 1 with empty output in that case, and
 * 128 when not a repo, so we just trust stdout and ignore the exit code.
 * With `-z --stdin`, both the fed paths and the emitted matches are
 * NUL-separated. Tracked files that match a pattern are not reported (git's
 * index-aware default), so only genuinely-ignored paths gray out.
 */
function checkIgnored(root: string, paths: string[]): Promise<Set<string>> {
  return new Promise((resolve) => {
    if (paths.length === 0) return resolve(new Set())
    const child = execFile(
      'git',
      ['check-ignore', '--stdin', '-z'],
      { cwd: root, timeout: 4000, maxBuffer: 8 * 1024 * 1024, windowsHide: true },
      (_err, stdout) => resolve(new Set(stdout ? stdout.split('\0').filter(Boolean) : []))
    )
    child.stdin?.end(paths.join('\0'))
  })
}

/** Safety cap on the flat file listing (spec: slim IDE, huge repos degrade UX). */
const MAX_LISTED_FILES = 20000

/**
 * Flat list of every project file for the command palette / quick-open (⌘P).
 * Prefers `git ls-files` (fast, honors .gitignore, includes untracked-but-not-
 * ignored files); falls back to a manual recursive walk when the root is not a
 * git repo. Returns absolute paths. Resolves null from git on any failure so the
 * caller can fall back.
 */
function gitListFiles(root: string): Promise<string[] | null> {
  return new Promise((resolve) => {
    execFile(
      'git',
      ['-C', root, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
      { cwd: root, timeout: 8000, maxBuffer: 64 * 1024 * 1024, windowsHide: true },
      (err, stdout) => {
        if (err) return resolve(null)
        const rels = stdout.split('\0').filter(Boolean)
        resolve(rels.slice(0, MAX_LISTED_FILES).map((r) => join(root, r)))
      }
    )
  })
}

async function walkFiles(root: string): Promise<string[]> {
  const out: string[] = []
  async function walk(dir: string): Promise<void> {
    if (out.length >= MAX_LISTED_FILES) return
    let dirents: import('fs').Dirent[]
    try {
      dirents = await fsp.readdir(dir, { withFileTypes: true })
    } catch {
      return // unreadable dir — skip rather than crash the whole listing
    }
    for (const d of dirents) {
      if (out.length >= MAX_LISTED_FILES) return
      if (IGNORE_DIRS.has(d.name) || d.name === '.git') continue
      const full = join(dir, d.name)
      if (d.isDirectory()) {
        await walk(full)
      } else if (d.isFile()) {
        out.push(full)
      }
    }
  }
  await walk(root)
  return out
}

export async function listProjectFiles(root: string): Promise<string[]> {
  const viaGit = await gitListFiles(root)
  return viaGit ?? walkFiles(root)
}

/** One chokidar watcher per window, disposed on window close. */
const watchers = new Map<number, FSWatcher>()

/** Resolve the owning ProjectWindow or throw (invoke errors reject in renderer). */
function requireWindow(event: IpcMainInvokeEvent): ProjectWindow {
  const pw = projectWindowFor(event.sender)
  if (!pw) throw new Error('No project window for sender')
  return pw
}

async function readDir(root: string, dirPath: string): Promise<DirEntry[]> {
  const abs = assertInsideRoot(root, dirPath)
  const dirents = await fsp.readdir(abs, { withFileTypes: true })

  const entries: DirEntry[] = []
  for (const d of dirents) {
    const full = join(abs, d.name)
    let isDir = d.isDirectory()
    const isSymlink = d.isSymbolicLink()

    // Resolve symlinks so a link to a directory expands like a directory.
    if (isSymlink) {
      try {
        // A link whose target lies outside the project would be refused by
        // every other fs call (assertInsideRoot realpaths), so don't list it.
        assertInsideRoot(root, full)
        const st = await fsp.stat(full)
        isDir = st.isDirectory()
      } catch {
        // Broken symlink, unreadable target, or escapes the root: skip it.
        continue
      }
    }

    entries.push({
      name: d.name,
      path: full,
      isDir,
      isSymlink,
      ignored: IGNORE_DIRS.has(d.name)
    })
  }

  // Gray out anything git ignores too, not just the hardcoded dirs — one batched
  // `git check-ignore` per listing. Union keeps .git (never in .gitignore) dim.
  const gitIgnored = await checkIgnored(root, entries.map((e) => e.path))
  for (const e of entries) {
    if (gitIgnored.has(e.path)) e.ignored = true
  }

  // Directories first, then files; alphabetical, case-insensitive within each group.
  entries.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'accent' })
  })

  return entries
}

async function readFile(root: string, filePath: string): Promise<ReadFileResult> {
  const abs = assertInsideRoot(root, filePath)
  const buf = await fsp.readFile(abs)
  // UTF-8 (strict) or Latin-1, never a lossy decode; BOM/CRLF are reported so
  // a save restores them (see textDecode.ts).
  const { binary, content, encoding, bom, eol } = decodeText(buf)
  return { content, encoding, bom, eol, binary }
}

/** Image extensions we'll inline as data URLs for the markdown live preview. */
const IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  // Not an image, but the viewer tab shows PDFs through the same data: path.
  '.pdf': 'application/pdf'
}

/** Max inlined image size — keeps a huge asset from bloating a data URL. */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024

/**
 * Read a project image as a `data:` URL for inline rendering (CSP allows
 * `data:`; local `file://` is blocked). Returns null for non-images, missing
 * files, or anything over the size cap. Path is validated against the root.
 */
async function readDataUrl(root: string, filePath: string): Promise<string | null> {
  try {
    // Inside the try: an out-of-root image (e.g. a root-relative `/x.png` the
    // renderer couldn't map) is "no image", not an error worth a crash report.
    const abs = assertInsideRoot(root, filePath)
    const ext = abs.slice(abs.lastIndexOf('.')).toLowerCase()
    const mime = IMAGE_MIME[ext]
    if (!mime) return null
    const stat = await fsp.stat(abs)
    if (!stat.isFile() || stat.size > MAX_IMAGE_BYTES) return null
    const buf = await fsp.readFile(abs)
    return `data:${mime};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

/**
 * Atomic save: write to a temp file beside the target, copy the target's
 * mode across, then rename over it. A crash or power loss mid-write leaves
 * the old file intact instead of a truncated one, and the file's executable
 * bit / permissions survive. Falls back to a plain write when the rename
 * step isn't possible (exotic filesystems).
 */
export async function writeFileAtomic(abs: string, content: string | Buffer): Promise<void> {
  const tmp = join(dirname(abs), `.${basename(abs)}.caret-${randomBytes(4).toString('hex')}.tmp`)
  let mode: number | undefined
  try {
    mode = (await fsp.stat(abs)).mode
  } catch {
    /* new file */
  }
  try {
    await fsp.writeFile(tmp, content, typeof content === 'string' ? 'utf8' : undefined)
    if (mode !== undefined) await fsp.chmod(tmp, mode)
    await fsp.rename(tmp, abs)
  } catch (err) {
    await fsp.unlink(tmp).catch(() => {})
    if ((err as NodeJS.ErrnoException).code === 'EXDEV' || (err as NodeJS.ErrnoException).code === 'EPERM') {
      await fsp.writeFile(abs, content, typeof content === 'string' ? 'utf8' : undefined)
      return
    }
    throw err
  }
}

/**
 * Rename without clobbering: `fs.rename` silently replaces an existing target,
 * so refuse with EEXIST when something else already lives at `newPath`. A
 * case-only rename on a case-insensitive filesystem (README.md → readme.md)
 * "exists" but is the same inode, and is allowed through.
 */
export async function renameSafe(root: string, oldPath: string, newPath: string): Promise<void> {
  const absOld = assertInsideRoot(root, oldPath)
  const absNew = assertInsideRoot(root, newPath)
  if (absOld === absNew) return
  let target: import('fs').Stats | null = null
  try {
    target = await fsp.lstat(absNew)
  } catch {
    /* nothing there — the normal case */
  }
  if (target) {
    const source = await fsp.lstat(absOld)
    const sameFile = source.ino === target.ino && source.dev === target.dev
    if (!sameFile) {
      const err = new Error(`EEXIST: "${newPath}" already exists`) as NodeJS.ErrnoException
      err.code = 'EEXIST'
      throw err
    }
  }
  await fsp.rename(absOld, absNew)
}

/** Start (or reuse) the single chokidar watcher for this window's root. */
function startWatch(pw: ProjectWindow): void {
  if (watchers.has(pw.id)) return // already watching — no-op

  const watcher = chokidar.watch(pw.root, {
    ignoreInitial: true,
    // Never traverse the hardcoded ignore dirs (spec §5.1) or dotfile noise.
    ignored: (p: string) => {
      // Match a path segment equal to any ignore dir, anywhere in the path.
      for (const dir of IGNORE_DIRS) {
        if (p.includes(`/${dir}/`) || p.endsWith(`/${dir}`)) return true
      }
      // Our own atomic-save temp files.
      return /\.caret-[0-9a-f]{8}\.tmp$/.test(p)
    },
    // Keep watcher lightweight; don't follow symlinks out of the project.
    followSymlinks: false,
    ignorePermissionErrors: true
  })

  const forward = (kind: FsChangeKind) => (path: string): void => {
    if (pw.win.isDestroyed()) return
    const payload: FsChangeEvent = { path, kind }
    pw.win.webContents.send(IPC.evtFsChanged, payload)
  }

  watcher
    .on('add', forward('add'))
    .on('addDir', forward('addDir'))
    .on('change', forward('change'))
    .on('unlink', forward('unlink'))
    .on('unlinkDir', forward('unlinkDir'))
    // A watcher error must never crash main; log and continue.
    .on('error', (err) => console.error('[fs] chokidar error:', err))

  watchers.set(pw.id, watcher)
}

export function registerFsIpc(): void {
  ipcMain.handle(IPC.fsReadDir, (event, path: string) => {
    const pw = requireWindow(event)
    return readDir(pw.root, path)
  })

  ipcMain.handle(IPC.fsReadFile, (event, path: string) => {
    const pw = requireWindow(event)
    return readFile(pw.root, path)
  })

  ipcMain.handle(
    IPC.fsWriteFile,
    (event, path: string, content: string, meta?: Partial<FileTextMeta>) => {
      const pw = requireWindow(event)
      const abs = assertInsideRoot(pw.root, path)
      return writeFileAtomic(abs, encodeText(content, meta))
    }
  )

  ipcMain.handle(IPC.fsWriteBinary, async (event, path: string, base64: string) => {
    const pw = requireWindow(event)
    const abs = assertInsideRoot(pw.root, path)
    await fsp.mkdir(dirname(abs), { recursive: true })
    await writeFileAtomic(abs, Buffer.from(base64, 'base64'))
  })

  ipcMain.handle(IPC.fsCreateFile, async (event, path: string) => {
    const pw = requireWindow(event)
    const abs = assertInsideRoot(pw.root, path)
    // `wx` flag fails if the file already exists — the intended behavior.
    const handle = await fsp.open(abs, 'wx')
    await handle.close()
  })

  ipcMain.handle(IPC.fsCreateDir, (event, path: string) => {
    const pw = requireWindow(event)
    const abs = assertInsideRoot(pw.root, path)
    return fsp.mkdir(abs, { recursive: true })
  })

  ipcMain.handle(IPC.fsRename, (event, oldPath: string, newPath: string) => {
    const pw = requireWindow(event)
    return renameSafe(pw.root, oldPath, newPath)
  })

  ipcMain.handle(IPC.fsTrash, (event, path: string) => {
    const pw = requireWindow(event)
    const abs = assertInsideRoot(pw.root, path)
    // Move to Trash, never unlink (spec §9.4).
    return shell.trashItem(abs)
  })

  ipcMain.handle(IPC.fsReveal, (event, path: string) => {
    const pw = requireWindow(event)
    const abs = assertInsideRoot(pw.root, path)
    shell.showItemInFolder(abs)
  })

  ipcMain.handle(IPC.fsListFiles, (event) => {
    const pw = requireWindow(event)
    return listProjectFiles(pw.root)
  })

  ipcMain.handle(IPC.fsReadDataUrl, (event, path: string) => {
    const pw = requireWindow(event)
    return readDataUrl(pw.root, path)
  })

  ipcMain.handle(IPC.fsWatchStart, (event) => {
    const pw = requireWindow(event)
    startWatch(pw)
  })

  // Dispose the per-window watcher when its window closes.
  onWindowClosed((windowId) => {
    const watcher = watchers.get(windowId)
    if (watcher) {
      watcher.close().catch(() => {})
      watchers.delete(windowId)
    }
  })
}
