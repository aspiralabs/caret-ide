// Colour-scheme notifications for programs in the terminal (DEC private mode
// 2031, the Contour spec also implemented by Ghostty and Kitty). A program
// opts in with `CSI ? 2031 h`; from then on the terminal sends
// `CSI ? 997 ; 1 n` (dark) or `CSI ? 997 ; 2 n` (light) whenever the theme
// changes, and answers the query `CSI ? 996 n` with the same report.
//
// Claude Code relies on this: it reads the background once via OSC 11 and only
// re-reads it on a notification, so without one its truecolor text (e.g. the
// question in an AskUserQuestion prompt) keeps the previous theme's colours.

export const THEME_NOTIFY_MODE = 2031
/** `CSI ? 996 n`: "which colour scheme is active?" */
export const THEME_QUERY = 996

/** The report a program receives for the given appearance. */
export function themeReport(appearance: 'light' | 'dark'): string {
  return `\x1b[?997;${appearance === 'dark' ? 1 : 2}n`
}

/**
 * For a `CSI ? … h` (set) / `CSI ? … l` (reset): the new mode-2031 state, or
 * null when the sequence doesn't touch it. One sequence can carry several
 * modes (`CSI ? 1000 ; 2031 h`).
 */
export function themeNotifyChange(params: readonly (number | number[])[], set: boolean): boolean | null {
  return params.some((p) => p === THEME_NOTIFY_MODE) ? set : null
}
