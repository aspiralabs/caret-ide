/** True when a line looks like a GFM table row (starts with `|`). */
export function isTableRow(lineText: string): boolean {
  return /^\s*\|/.test(lineText)
}

/**
 * Column (0-based offset within the line) of the start of the next / previous
 * cell's content relative to `col`, or null when there is none. Cells are the
 * text between unescaped pipes; the returned position skips the pipe and one
 * leading space so the caret lands on the content.
 */
export function adjacentCellOffset(lineText: string, col: number, dir: 1 | -1): number | null {
  const pipes: number[] = []
  for (let i = 0; i < lineText.length; i++) {
    if (lineText[i] === '|' && lineText[i - 1] !== '\\') pipes.push(i)
  }
  if (pipes.length < 2) return null
  const cellStart = (pipeIdx: number): number => {
    let p = pipes[pipeIdx] + 1
    if (lineText[p] === ' ') p++
    return Math.min(p, lineText.length)
  }
  // Index of the pipe that opens the cell the caret is currently in.
  let current = -1
  for (let i = 0; i < pipes.length; i++) if (pipes[i] < col) current = i
  const target = current + dir
  // The last pipe closes the row; there is no cell after it.
  if (target < 0 || target >= pipes.length - 1) return null
  return cellStart(target)
}
