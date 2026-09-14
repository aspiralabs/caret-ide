// Text-vs-binary classification and encoding/EOL round-tripping for
// `fs:readFile` / `fs:writeFile`. Kept free of electron imports so it's
// unit-testable in plain node.

import type { FileTextMeta } from '../../shared/types'

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
// substituting U+FFFD. We strip a BOM ourselves so it can be reported.
const strictUtf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })

/** Dominant line ending: CRLF when it appears at least as often as a bare LF. */
export function detectEol(text: string): FileTextMeta['eol'] {
  let crlf = 0
  let lf = 0
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) !== 10) continue
    if (i > 0 && text.charCodeAt(i - 1) === 13) crlf++
    else lf++
  }
  return crlf > 0 && crlf >= lf ? 'crlf' : 'lf'
}

export interface DecodedText extends FileTextMeta {
  binary: boolean
  /** Text with LF line endings and no BOM (the editor's canonical form). */
  content: string
}

/**
 * Decode a file buffer for editing. UTF-8 (strict) first; a file that isn't
 * valid UTF-8 but has no NUL bytes is treated as Latin-1 so it opens and
 * round-trips byte-for-byte instead of being corrupted by a lossy decode.
 * NUL bytes → binary. A BOM and CRLF endings are stripped/normalised and
 * reported in the meta so `encodeText` can restore them on save.
 */
export function decodeText(buf: Buffer): DecodedText {
  const none: DecodedText = { binary: true, content: '', encoding: 'utf8', bom: false, eol: 'lf' }
  if (looksBinary(buf)) return none
  let bom = false
  let encoding: FileTextMeta['encoding'] = 'utf8'
  let text: string
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    bom = true
    buf = buf.subarray(3)
  }
  try {
    text = strictUtf8.decode(buf)
  } catch {
    if (bom) return none // a BOM promised UTF-8; anything else is not text we understand
    encoding = 'latin1'
    text = buf.toString('latin1')
  }
  const eol = detectEol(text)
  // Always normalise: a mixed-EOL file edits as LF and saves with its
  // dominant ending throughout.
  const content = text.replace(/\r\n/g, '\n')
  return { binary: false, content, encoding, bom, eol }
}

/** Encode editor text back to bytes, restoring the file's BOM, EOL and charset. */
export function encodeText(content: string, meta?: Partial<FileTextMeta>): Buffer {
  const eol = meta?.eol ?? 'lf'
  const text = eol === 'crlf' ? content.replace(/\r?\n/g, '\r\n') : content
  const body = meta?.encoding === 'latin1' ? Buffer.from(text, 'latin1') : Buffer.from(text, 'utf8')
  if (meta?.bom && meta.encoding !== 'latin1') return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), body])
  return body
}
