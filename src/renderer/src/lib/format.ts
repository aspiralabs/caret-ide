import type { FormatResult } from '@shared/types'
import { useSettingsStore } from '../stores/settings'
import { useToastStore } from '../stores/toast'

/** Ask main to format a buffer, passing the global config from Settings. */
export function requestFormat(path: string, text: string, cursorOffset: number): Promise<FormatResult> {
  return window.ide.format.text({
    path,
    text,
    cursorOffset,
    globalConfig: useSettingsStore.getState().settings.prettierConfig
  })
}

/** Human message for a non-formatted outcome (null when nothing to say). */
export function formatOutcomeMessage(res: FormatResult, explicit: boolean): string | null {
  switch (res.kind) {
    case 'formatted':
      return explicit && !res.changed ? 'Already formatted' : null
    case 'skipped':
      if (!explicit) return null
      return res.reason === 'ignored'
        ? 'File is ignored by .prettierignore'
        : res.reason === 'no-parser'
          ? 'Prettier has no parser for this file type'
          : 'File is too large to format (1 MB limit)'
    case 'error':
      return `Prettier: ${res.message.split('\n')[0]}`
  }
}

/** Toast the outcome of an explicit Format Document, where there is one. */
export function reportFormat(res: FormatResult, explicit: boolean): void {
  const msg = formatOutcomeMessage(res, explicit)
  if (msg) useToastStore.getState().show(msg)
}
