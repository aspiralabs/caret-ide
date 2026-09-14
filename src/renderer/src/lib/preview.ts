import { useLayoutStore } from '../stores/layout'
import { useTabsStore } from '../stores/tabs'
import { useToastStore } from '../stores/toast'
import { useProjectStore } from '../stores/project'
import { join } from './path'
import { fileReference } from './claudeRefs'
import { sendToClaude } from './sendToClaude'

/** Reload every browser tab (after a save, when "reload on save" is on). */
export function reloadAllPreviews(): void {
  for (const t of useTabsStore.getState().tabs) {
    if (t.kind === 'browser') void window.ide.browser.reload(t.id)
  }
}

/** Called by editors after a successful save. */
export function afterSaveReload(): void {
  if (useLayoutStore.getState().reloadPreviewOnSave) reloadAllPreviews()
}

/** File name for a saved screenshot: `shot-2026-09-14-041530.png`. */
export function screenshotName(now: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `shot-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}.png`
}

/** Strip the data-URL prefix → base64 payload. */
export function dataUrlBase64(dataUrl: string): string {
  const i = dataUrl.indexOf(',')
  return i === -1 ? '' : dataUrl.slice(i + 1)
}

/** Screenshot the page to the clipboard. */
export async function copyScreenshot(tabId: string): Promise<boolean> {
  const url = await window.ide.browser.capture(tabId)
  if (!url) return false
  try {
    const blob = await (await fetch(url)).blob()
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    useToastStore.getState().show('Screenshot copied')
    return true
  } catch (err) {
    useToastStore.getState().show(`Couldn't copy screenshot: ${err instanceof Error ? err.message : String(err)}`)
    return false
  }
}

/**
 * Screenshot the page into `.caret/screenshots/` and mention the file in the
 * Claude Code session (it reads images by path).
 */
export async function screenshotToClaude(tabId: string): Promise<boolean> {
  const root = useProjectStore.getState().info?.root
  if (!root) return false
  const url = await window.ide.browser.capture(tabId)
  if (!url) return false
  const path = join(root, '.caret', 'screenshots', screenshotName(new Date()))
  await window.ide.fs.writeBinary(path, dataUrlBase64(url))
  return sendToClaude(fileReference(path, root) + ' ', null)
}
