/** Non-hook read of the effective theme (the <html> class is the source of truth once applied). */
function currentTheme(): 'light' | 'dark' {
  return document.documentElement.classList.contains('theme-light') ? 'light' : 'dark'
}

let seq = 0
let initialised: 'light' | 'dark' | null = null

/**
 * Render Mermaid source to SVG markup. The library (~2 MB) is loaded on first
 * use only, and re-initialised when the app theme flips so diagrams match.
 * Returns null for empty input; rejects on a syntax error (the widget shows it).
 */
export async function renderMermaid(code: string): Promise<string | null> {
  const src = code.trim()
  if (!src) return null
  const mermaid = (await import('mermaid')).default
  const theme = currentTheme()
  if (initialised !== theme) {
    mermaid.initialize({ startOnLoad: false, theme: theme === 'dark' ? 'dark' : 'default', securityLevel: 'strict' })
    initialised = theme
  }
  const { svg } = await mermaid.render(`caret-mermaid-${++seq}`, src)
  return svg
}
