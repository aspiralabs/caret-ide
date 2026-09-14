// ---------------------------------------------------------------------------
// Colour themes. A palette drives every surface at once: the `ink-*` CSS
// variables (whole UI), Monaco (editor chrome + syntax) and xterm (ANSI).
// Bundled palettes below; users add their own as JSON under
// `customThemes` in settings.json (same shape as BUNDLED_THEMES entries).
// ---------------------------------------------------------------------------

export interface InkColors {
  bg: string
  panel: string
  sidebar: string
  terminal: string
  elevated: string
  border: string
  hover: string
  active: string
  text: string
  muted: string
  tree: string
  accent: string
  accentHover: string
  codeInline: string
}

export interface SyntaxColors {
  strings: string
  keywords: string
  functions: string
  variables: string
  types: string
  properties: string
  numbers: string
  comments: string
  text: string
}

export interface AnsiColors {
  black: string
  red: string
  green: string
  yellow: string
  blue: string
  magenta: string
  cyan: string
  white: string
  brightBlack: string
  brightRed: string
  brightGreen: string
  brightYellow: string
  brightBlue: string
  brightMagenta: string
  brightCyan: string
  brightWhite: string
}

export interface ThemePalette {
  id: string
  name: string
  appearance: 'light' | 'dark'
  ink: InkColors
  syntax: SyntaxColors
  ansi: AnsiColors
}

const ONE_DARK_ANSI: AnsiColors = {
  black: '#282c34', red: '#e06c75', green: '#98c379', yellow: '#e5c07b', blue: '#61afef', magenta: '#c678dd', cyan: '#56b6c2', white: '#abb2bf',
  brightBlack: '#5c6370', brightRed: '#e06c75', brightGreen: '#98c379', brightYellow: '#e5c07b', brightBlue: '#61afef', brightMagenta: '#c678dd', brightCyan: '#56b6c2', brightWhite: '#ffffff'
}
const ONE_LIGHT_ANSI: AnsiColors = {
  black: '#383a42', red: '#e45649', green: '#50a14f', yellow: '#986801', blue: '#4078f2', magenta: '#a626a4', cyan: '#0184bc', white: '#a0a1a7',
  brightBlack: '#4f525e', brightRed: '#e45649', brightGreen: '#50a14f', brightYellow: '#c18401', brightBlue: '#4078f2', brightMagenta: '#a626a4', brightCyan: '#0184bc', brightWhite: '#383a42'
}
const SOLARIZED_ANSI: AnsiColors = {
  black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900', blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5',
  brightBlack: '#002b36', brightRed: '#cb4b16', brightGreen: '#586e75', brightYellow: '#657b83', brightBlue: '#839496', brightMagenta: '#6c71c4', brightCyan: '#93a1a1', brightWhite: '#fdf6e3'
}
const GITHUB_DARK_ANSI: AnsiColors = {
  black: '#484f58', red: '#ff7b72', green: '#3fb950', yellow: '#d29922', blue: '#58a6ff', magenta: '#bc8cff', cyan: '#39c5cf', white: '#b1bac4',
  brightBlack: '#6e7681', brightRed: '#ffa198', brightGreen: '#56d364', brightYellow: '#e3b341', brightBlue: '#79c0ff', brightMagenta: '#d2a8ff', brightCyan: '#56d4dd', brightWhite: '#f0f6fc'
}
const GITHUB_LIGHT_ANSI: AnsiColors = {
  black: '#24292f', red: '#cf222e', green: '#116329', yellow: '#4d2d00', blue: '#0969da', magenta: '#8250df', cyan: '#1b7c83', white: '#6e7781',
  brightBlack: '#57606a', brightRed: '#a40e26', brightGreen: '#1a7f37', brightYellow: '#633c01', brightBlue: '#218bff', brightMagenta: '#a475f9', brightCyan: '#3192aa', brightWhite: '#8c959f'
}

export const BUNDLED_THEMES: ThemePalette[] = [
  {
    id: 'caret-dark',
    name: 'Caret Dark',
    appearance: 'dark',
    ink: { bg: '#181818', panel: '#141414', sidebar: '#111111', terminal: '#0d0d0d', elevated: '#1f1f1f', border: '#2a2a2a', hover: '#232323', active: '#163761', text: '#d6d6dd', muted: '#6d6d6d', tree: '#9d9d9d', accent: '#228df2', accentHover: '#4aa3f5', codeInline: '#e394dc' },
    syntax: { strings: 'e394dc', keywords: '83d6c5', functions: 'efb080', variables: 'aa9bf5', types: 'ebc88d', properties: 'd6d6dd', numbers: 'ebc88d', comments: '6d6d6d', text: 'd6d6dd' },
    ansi: ONE_DARK_ANSI
  },
  {
    id: 'caret-light',
    name: 'Caret Light',
    appearance: 'light',
    ink: { bg: '#ffffff', panel: '#f2f3f5', sidebar: '#f6f7f9', terminal: '#fbfcfd', elevated: '#ffffff', border: '#e0e2e6', hover: '#eceef1', active: '#d3e5fb', text: '#1c1e21', muted: '#6b7280', tree: '#4b5563', accent: '#0969da', accentHover: '#1a7ff0', codeInline: '#a2277c' },
    syntax: { strings: '50a14f', keywords: 'a626a4', functions: '4078f2', variables: 'e45649', types: 'c18401', properties: '4078f2', numbers: '986801', comments: 'a0a1a7', text: '383a42' },
    ansi: ONE_LIGHT_ANSI
  },
  {
    id: 'one-dark',
    name: 'One Dark',
    appearance: 'dark',
    ink: { bg: '#282c34', panel: '#21252b', sidebar: '#21252b', terminal: '#1e2227', elevated: '#2c313a', border: '#181a1f', hover: '#2c313a', active: '#2c4a6b', text: '#abb2bf', muted: '#5c6370', tree: '#9da5b4', accent: '#528bff', accentHover: '#6a9cff', codeInline: '#e06c75' },
    syntax: { strings: '98c379', keywords: 'c678dd', functions: '61afef', variables: 'e06c75', types: 'e5c07b', properties: 'd19a66', numbers: 'd19a66', comments: '5c6370', text: 'abb2bf' },
    ansi: ONE_DARK_ANSI
  },
  {
    id: 'solarized-dark',
    name: 'Solarized Dark',
    appearance: 'dark',
    ink: { bg: '#002b36', panel: '#00212b', sidebar: '#00212b', terminal: '#002b36', elevated: '#073642', border: '#0a3a46', hover: '#073642', active: '#0e4a5a', text: '#93a1a1', muted: '#586e75', tree: '#839496', accent: '#268bd2', accentHover: '#3d9de0', codeInline: '#d33682' },
    syntax: { strings: '2aa198', keywords: '859900', functions: '268bd2', variables: 'b58900', types: 'cb4b16', properties: '839496', numbers: 'd33682', comments: '586e75', text: '93a1a1' },
    ansi: SOLARIZED_ANSI
  },
  {
    id: 'solarized-light',
    name: 'Solarized Light',
    appearance: 'light',
    ink: { bg: '#fdf6e3', panel: '#eee8d5', sidebar: '#eee8d5', terminal: '#fdf6e3', elevated: '#fdf6e3', border: '#d9d2c0', hover: '#e6dfcc', active: '#cfe3ea', text: '#586e75', muted: '#93a1a1', tree: '#657b83', accent: '#268bd2', accentHover: '#1e7bbf', codeInline: '#d33682' },
    syntax: { strings: '2aa198', keywords: '859900', functions: '268bd2', variables: 'b58900', types: 'cb4b16', properties: '657b83', numbers: 'd33682', comments: '93a1a1', text: '586e75' },
    ansi: SOLARIZED_ANSI
  },
  {
    id: 'github-dark',
    name: 'GitHub Dark',
    appearance: 'dark',
    ink: { bg: '#0d1117', panel: '#010409', sidebar: '#010409', terminal: '#0d1117', elevated: '#161b22', border: '#30363d', hover: '#161b22', active: '#1f3a5f', text: '#e6edf3', muted: '#7d8590', tree: '#c9d1d9', accent: '#2f81f7', accentHover: '#58a6ff', codeInline: '#ff7b72' },
    syntax: { strings: 'a5d6ff', keywords: 'ff7b72', functions: 'd2a8ff', variables: 'ffa657', types: 'ffa657', properties: '79c0ff', numbers: '79c0ff', comments: '8b949e', text: 'e6edf3' },
    ansi: GITHUB_DARK_ANSI
  },
  {
    id: 'github-light',
    name: 'GitHub Light',
    appearance: 'light',
    ink: { bg: '#ffffff', panel: '#f6f8fa', sidebar: '#f6f8fa', terminal: '#ffffff', elevated: '#ffffff', border: '#d0d7de', hover: '#eaeef2', active: '#ddf4ff', text: '#1f2328', muted: '#656d76', tree: '#424a53', accent: '#0969da', accentHover: '#218bff', codeInline: '#cf222e' },
    syntax: { strings: '0a3069', keywords: 'cf222e', functions: '8250df', variables: '953800', types: '953800', properties: '0550ae', numbers: '0550ae', comments: '6e7781', text: '1f2328' },
    ansi: GITHUB_LIGHT_ANSI
  }
]

const HEX = /^#[0-9a-f]{6}$/i

/** Loosely validate a user-supplied palette; null when unusable. */
export function validateTheme(input: unknown): ThemePalette | null {
  if (!input || typeof input !== 'object') return null
  const o = input as Record<string, unknown>
  if (typeof o.id !== 'string' || !o.id || typeof o.name !== 'string') return null
  if (o.appearance !== 'light' && o.appearance !== 'dark') return null
  const base = BUNDLED_THEMES.find((t) => t.appearance === o.appearance) ?? BUNDLED_THEMES[0]
  const merge = <T extends object>(defaults: T, given: unknown, hexOnly: boolean): T => {
    const out: Record<string, string> = { ...(defaults as Record<string, string>) }
    if (given && typeof given === 'object') {
      for (const [k, v] of Object.entries(given as Record<string, unknown>)) {
        if (k in out && typeof v === 'string' && (!hexOnly || HEX.test(v))) out[k] = v
      }
    }
    return out as unknown as T
  }
  return {
    id: o.id,
    name: o.name,
    appearance: o.appearance,
    ink: merge(base.ink, o.ink, true),
    syntax: merge(base.syntax, o.syntax, false),
    ansi: merge(base.ansi, o.ansi, true)
  }
}

/** Bundled + valid custom themes (custom ids shadow bundled ones). */
export function allThemes(custom: unknown): ThemePalette[] {
  const extra = Array.isArray(custom) ? custom.map(validateTheme).filter((t): t is ThemePalette => t !== null) : []
  const ids = new Set(extra.map((t) => t.id))
  return [...BUNDLED_THEMES.filter((t) => !ids.has(t.id)), ...extra]
}

/** The palette to use for an effective appearance, falling back to the bundled default. */
export function resolvePalette(themes: ThemePalette[], appearance: 'light' | 'dark', darkId: string, lightId: string): ThemePalette {
  const want = appearance === 'dark' ? darkId : lightId
  return themes.find((t) => t.id === want && t.appearance === appearance) ?? (appearance === 'dark' ? BUNDLED_THEMES[0] : BUNDLED_THEMES[1])
}

/** `#rrggbb` → "r g b" (the form the ink-* CSS variables use). */
export function hexToTriplet(hex: string): string {
  const h = hex.replace('#', '')
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(' ')
}

/** CSS custom properties for a palette (applied on <html>). */
export function cssVarsFor(p: ThemePalette): Record<string, string> {
  const i = p.ink
  return {
    '--ink-bg': hexToTriplet(i.bg),
    '--ink-panel': hexToTriplet(i.panel),
    '--ink-sidebar': hexToTriplet(i.sidebar),
    '--ink-terminal': hexToTriplet(i.terminal),
    '--ink-elevated': hexToTriplet(i.elevated),
    '--ink-border': hexToTriplet(i.border),
    '--ink-hover': hexToTriplet(i.hover),
    '--ink-active': hexToTriplet(i.active),
    '--ink-selection': hexToTriplet(i.active),
    '--ink-text': hexToTriplet(i.text),
    '--ink-muted': hexToTriplet(i.muted),
    '--ink-tree': hexToTriplet(i.tree),
    '--ink-accent': hexToTriplet(i.accent),
    '--ink-accent-hover': hexToTriplet(i.accentHover),
    '--code-inline': i.codeInline
  }
}
