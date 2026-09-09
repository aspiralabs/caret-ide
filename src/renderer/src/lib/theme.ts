// ---------------------------------------------------------------------------
// Theme resolution — turns the user's `settings.theme` ('light' | 'dark' |
// 'system') into an EFFECTIVE 'light' | 'dark' and pushes it to every surface
// that can't read Tailwind's CSS variables directly:
//   • the document root  -> toggles `.theme-light` (drives all `ink-*` colors)
//   • Monaco             -> 'slim-light' / 'slim-dark' (defined in setupMonaco)
//   • xterm terminals    -> the palettes below
//
// The DOM/Monaco/xterm palettes mirror the CSS variables in index.css. Keep
// the two in sync when tweaking a color.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react'
import type { ITheme } from '@xterm/xterm'
import type { ThemeSetting } from '@shared/types'
import { useSettingsStore } from '../stores/settings'

export type EffectiveTheme = 'light' | 'dark'

const prefersDark = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-color-scheme: dark)').matches

/** The OS-level light/dark preference right now. */
export function systemTheme(): EffectiveTheme {
  return prefersDark() ? 'dark' : 'light'
}

/** Collapse a setting (which may be 'system') into a concrete theme. */
export function resolveTheme(setting: ThemeSetting): EffectiveTheme {
  return setting === 'system' ? systemTheme() : setting
}

/** The Monaco theme name registered for an effective theme (see setupMonaco). */
export function monacoTheme(effective: EffectiveTheme): string {
  return effective === 'light' ? 'slim-light' : 'slim-dark'
}

/** xterm color themes — mirror --ink-terminal / --ink-text / --ink-accent etc.
 *  A light terminal also needs a light-friendly ANSI palette (One Light) or
 *  program output like bright-white text would vanish on the near-white bg. */
export function xtermTheme(effective: EffectiveTheme): ITheme {
  if (effective === 'light') {
    return {
      background: '#fbfcfd',
      foreground: '#383a42',
      cursor: '#0969da',
      cursorAccent: '#fbfcfd',
      selectionBackground: '#d3e5fb',
      black: '#383a42',
      red: '#e45649',
      green: '#50a14f',
      yellow: '#986801',
      blue: '#4078f2',
      magenta: '#a626a4',
      cyan: '#0184bc',
      white: '#a0a1a7',
      brightBlack: '#696c77',
      brightRed: '#e45649',
      brightGreen: '#50a14f',
      brightYellow: '#c18401',
      brightBlue: '#4078f2',
      brightMagenta: '#a626a4',
      brightCyan: '#0184bc',
      brightWhite: '#383a42'
    }
  }
  return {
    background: '#0d0d0d',
    foreground: '#d6d6dd',
    cursor: '#228df2',
    cursorAccent: '#0d0d0d',
    selectionBackground: '#163761'
  }
}

/** Apply the effective theme to the document root (drives all `ink-*` colors). */
export function applyThemeClass(effective: EffectiveTheme): void {
  document.documentElement.classList.toggle('theme-light', effective === 'light')
}

/**
 * The current effective theme, reacting to BOTH the user's setting and — when
 * the setting is 'system' — live OS preference changes.
 */
export function useEffectiveTheme(): EffectiveTheme {
  const setting = useSettingsStore((s) => s.settings.theme)
  const [system, setSystem] = useState<EffectiveTheme>(systemTheme)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (): void => setSystem(mq.matches ? 'dark' : 'light')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return setting === 'system' ? system : setting
}
