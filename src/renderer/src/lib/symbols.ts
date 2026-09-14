/** A navigable symbol in the active document (palette `@` mode). */
export interface DocSymbol {
  name: string
  /** 'function' | 'class' | 'heading' | … (drives the icon/label). */
  kind: string
  /** 1-based line. */
  line: number
  /** Nesting depth for indentation. */
  depth: number
}

/**
 * Flatten a TypeScript `NavigationTree` (from Monaco's TS worker) into a
 * depth-first list. `lineOf` maps a text offset to a 1-based line.
 */
export function flattenNavTree(
  tree: { text: string; kind: string; spans: Array<{ start: number }>; childItems?: unknown[] } | null | undefined,
  lineOf: (offset: number) => number
): DocSymbol[] {
  const out: DocSymbol[] = []
  const walk = (node: typeof tree, depth: number): void => {
    if (!node) return
    for (const child of (node.childItems ?? []) as Array<NonNullable<typeof tree>>) {
      const span = child.spans?.[0]
      const isGlobal = child.kind === 'module' && child.text === '<global>'
      if (span && child.text && !isGlobal) {
        out.push({ name: child.text, kind: child.kind, line: lineOf(span.start), depth })
      }
      walk(child, isGlobal ? depth : depth + 1)
    }
  }
  walk(tree, 0)
  return out
}

/** Markdown ATX headings (`## Title`) as symbols; depth = heading level − 1. */
export function markdownHeadings(text: string): DocSymbol[] {
  const out: DocSymbol[] = []
  let inFence = false
  text.split('\n').forEach((raw, i) => {
    const line = raw.trimEnd()
    if (/^(```|~~~)/.test(line.trim())) inFence = !inFence
    if (inFence) return
    const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line)
    if (m) out.push({ name: m[2], kind: 'heading', line: i + 1, depth: m[1].length - 1 })
  })
  return out
}
