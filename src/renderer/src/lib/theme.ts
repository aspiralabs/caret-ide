// ---------------------------------------------------------------------------
// Theme resolution — turns the user's `settings.theme` ('light' | 'dark' |
// 'system') into an EFFECTIVE 'light' | 'dark' and pushes it to every surface
// that can't read Tailwind's CSS variables directly:
//   • the document root  -> ink-* CSS variables + `.theme-light` (whole UI)
//   • Monaco             -> a theme defined from the palette (see setupMonaco)
//   • xterm terminals    -> chrome + ANSI colours from the palette
// The palette itself comes from lib/themes.ts (bundled + custom), picked per
// appearance by settings.themeDark / themeLight.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from 'react'
import type { ITheme } from '@xterm/xterm'
import type { ThemeSetting } from '@shared/types'
import { useSettingsStore } from '../stores/settings'
import { allThemes, cssVarsFor, resolvePalette, type ThemePalette } from './themes'

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

/**
 * Hook installed by setupMonaco so this module can define Monaco themes from a
 * palette without importing monaco itself (keeps the welcome screen light).
 */
let monacoDefiner: ((p: ThemePalette, name: string) => void) | null = null
const definedMonaco = new Set<string>()
export function registerMonacoThemeDefiner(fn: (p: ThemePalette, name: string) => void): void {
  monacoDefiner = fn
  definedMonaco.clear()
}

/** The Monaco theme name for a palette, defining it on first use. */
export function monacoTheme(p: ThemePalette): string {
  const name = `caret-${p.id}`
  if (!definedMonaco.has(name) && monacoDefiner) {
    monacoDefiner(p, name)
    definedMonaco.add(name)
  }
  return name
}

/** xterm colours for a palette: chrome from `ink`, ANSI from the palette's own set. */
export function xtermTheme(p: ThemePalette): ITheme {
  return {
    background: p.ink.terminal,
    foreground: p.ink.text,
    cursor: p.ink.accent,
    cursorAccent: p.ink.terminal,
    selectionBackground: p.ink.active,
    ...p.ansi
  }
}

/** Apply a palette to the document root: the ink-* variables + the appearance class. */
export function applyPalette(p: ThemePalette): void {
  const root = document.documentElement
  root.classList.toggle('theme-light', p.appearance === 'light')
  for (const [k, v] of Object.entries(cssVarsFor(p))) root.style.setProperty(k, v)
  root.style.colorScheme = p.appearance
}

/** The palette for the current effective appearance and theme settings. */
export function usePalette(): ThemePalette {
  const effective = useEffectiveTheme()
  const themeDark = useSettingsStore((s) => s.settings.themeDark)
  const themeLight = useSettingsStore((s) => s.settings.themeLight)
  const custom = useSettingsStore((s) => s.settings.customThemes)
  return useMemo(
    () => resolvePalette(allThemes(custom), effective, themeDark, themeLight),
    [effective, themeDark, themeLight, custom]
  )
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
