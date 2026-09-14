// Text-vs-binary classification for `fs:readFile`. Kept free of electron
// imports so it's unit-testable in plain node.

/** Bytes scanned for a NUL when sniffing for binary content. */
const SNIFF_BYTES = 8192

/** Heuristic binary sniff: a null byte in the first chunk means "not text". */
export function looksBinary(buf: Buffer): boolean {
  const len = Math.min(buf.length, SNIFF_BYTES)
  for (let i = 0; i < len; i++) {
    if (buf[i] === 0) return true
  }
  return false
}

// `fatal` makes decode() throw on any invalid sequence instead of silently
// substituting U+FFFD; `ignoreBOM` keeps a leading BOM in the output (matching
// Buffer#toString) so a save round-trips the file byte-for-byte.
const strictUtf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })

/**
 * Decode a file buffer as UTF-8 text, or report it as binary when it contains
 * a NUL byte or is not valid UTF-8. A lossy decode is never returned: a
 * Latin-1 file would otherwise open with replacement characters that a save
 * then writes back, corrupting it (the old `�`-and-no-0xEF heuristic let any
 * file containing `ï` through).
 */
export function decodeText(buf: Buffer): { binary: boolean; content: string } {
  if (looksBinary(buf)) return { binary: true, content: '' }
  try {
    return { binary: false, content: strictUtf8.decode(buf) }
  } catch {
    return { binary: true, content: '' }
  }
}
