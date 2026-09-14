// ---------------------------------------------------------------------------
// Update check. The app ships unsigned, so Squirrel.Mac (electron-updater)
// can't install updates in place — instead we ask GitHub for the latest
// release and offer the download page. Once the build is signed and
// notarised, electron-updater can replace this with an in-place update.
// ---------------------------------------------------------------------------

import { app, ipcMain, net } from 'electron'
import { IPC } from '../shared/ipc'
import { compareVersions, type UpdateInfo } from '../shared/version'

const LATEST_URL = 'https://api.github.com/repos/aspiralabs/caret-ide/releases/latest'
const RELEASES_URL = 'https://github.com/aspiralabs/caret-ide/releases'

/** Read the latest release tag from GitHub; throws on network / API failure. */
export async function checkForUpdate(fetchImpl: (url: string, init?: RequestInit) => Promise<Response> = (u, i) => net.fetch(u, i)): Promise<UpdateInfo> {
  const current = app.getVersion()
  const res = await fetchImpl(LATEST_URL, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': `Caret/${current}` } })
  if (!res.ok) throw new Error(`GitHub responded ${res.status}`)
  const data = (await res.json()) as { tag_name?: string; html_url?: string }
  const latest = (data.tag_name ?? '').replace(/^v/, '')
  if (!latest) throw new Error('No release tag in response')
  return { current, latest, url: data.html_url ?? RELEASES_URL, isNewer: compareVersions(latest, current) > 0 }
}

export function registerUpdateIpc(): void {
  ipcMain.handle(IPC.updateCheck, () => checkForUpdate())
}
