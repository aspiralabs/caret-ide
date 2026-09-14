import { useToastStore } from '../stores/toast'
import { useSettingsStore } from '../stores/settings'

const LAST_CHECK_KEY = 'caret:lastUpdateCheck'
const DAY_MS = 24 * 60 * 60 * 1000

/** Whether an automatic check is due (setting on, and none in the last day). */
export function updateCheckDue(lastCheckMs: number | null, now: number, enabled: boolean): boolean {
  if (!enabled) return false
  return lastCheckMs === null || now - lastCheckMs > DAY_MS
}

/**
 * Check GitHub for a newer release and toast a Download link. `explicit`
 * (menu item) also reports "up to date" and errors; the launch check is
 * silent unless something is new.
 */
export async function checkForUpdates(explicit: boolean): Promise<void> {
  const toast = useToastStore.getState()
  try {
    const info = await window.ide.updates.check()
    try {
      localStorage.setItem(LAST_CHECK_KEY, String(Date.now()))
    } catch {
      /* storage unavailable */
    }
    if (info.isNewer) {
      toast.show(`Caret ${info.latest} is available (you have ${info.current})`, {
        action: { label: 'Download', run: () => window.open(info.url) },
        ttlMs: 0
      })
    } else if (explicit) {
      toast.show(`Caret ${info.current} is up to date`)
    }
  } catch (err) {
    if (explicit) toast.show(`Couldn't check for updates: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** Launch-time check, rate-limited to once a day and gated by the setting. */
export function maybeCheckForUpdatesAtLaunch(): void {
  let last: number | null = null
  try {
    const v = localStorage.getItem(LAST_CHECK_KEY)
    last = v ? Number(v) : null
  } catch {
    /* storage unavailable */
  }
  if (updateCheckDue(last, Date.now(), useSettingsStore.getState().settings.checkForUpdates)) void checkForUpdates(false)
}
