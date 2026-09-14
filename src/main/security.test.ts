import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { assertInsideRoot, realPathLenient } from './security'

let base: string
let root: string
let outside: string

beforeEach(() => {
  // realpath the tmp dir itself: on macOS /var → /private/var.
  base = realpathSync(mkdtempSync(join(tmpdir(), 'caret-sec-')))
  root = join(base, 'project')
  outside = join(base, 'outside')
  mkdirSync(root)
  mkdirSync(outside)
  writeFileSync(join(outside, 'secret.txt'), 'shh')
  writeFileSync(join(root, 'ok.txt'), 'fine')
})
afterEach(() => rmSync(base, { recursive: true, force: true }))

describe('assertInsideRoot', () => {
  it('allows the root and paths under it', () => {
    expect(assertInsideRoot(root, root)).toBe(root)
    expect(assertInsideRoot(root, join(root, 'ok.txt'))).toBe(join(root, 'ok.txt'))
    expect(assertInsideRoot(root, join(root, 'sub', 'new.txt'))).toBe(join(root, 'sub', 'new.txt'))
  })

  it('rejects lexical traversal', () => {
    expect(() => assertInsideRoot(root, join(root, '..', 'outside', 'secret.txt'))).toThrow(
      /escapes project root/
    )
    expect(() => assertInsideRoot(root, '/etc/passwd')).toThrow()
    // Sibling with a shared prefix is not inside.
    mkdirSync(root + '-other')
    expect(() => assertInsideRoot(root, join(root + '-other', 'x'))).toThrow()
  })

  it('rejects a symlink inside the project pointing outside (bug #14)', () => {
    symlinkSync(outside, join(root, 'secrets'))
    expect(() => assertInsideRoot(root, join(root, 'secrets'))).toThrow(/escapes/)
    expect(() => assertInsideRoot(root, join(root, 'secrets', 'secret.txt'))).toThrow(/escapes/)
    // Even a not-yet-existing file beneath the link resolves outside.
    expect(() => assertInsideRoot(root, join(root, 'secrets', 'new.txt'))).toThrow(/escapes/)
  })

  it('rejects a symlinked file pointing outside', () => {
    symlinkSync(join(outside, 'secret.txt'), join(root, 'leak.txt'))
    expect(() => assertInsideRoot(root, join(root, 'leak.txt'))).toThrow(/escapes/)
  })

  it('allows symlinks that stay inside the project', () => {
    mkdirSync(join(root, 'real'))
    writeFileSync(join(root, 'real', 'a.txt'), 'a')
    symlinkSync(join(root, 'real'), join(root, 'alias'))
    expect(assertInsideRoot(root, join(root, 'alias', 'a.txt'))).toBe(join(root, 'real', 'a.txt'))
  })

  it('works when the root itself is reached through a symlink', () => {
    symlinkSync(root, join(base, 'proj-link'))
    expect(assertInsideRoot(join(base, 'proj-link'), join(base, 'proj-link', 'ok.txt'))).toBe(
      join(root, 'ok.txt')
    )
  })
})

describe('realPathLenient', () => {
  it('resolves the deepest existing ancestor and re-appends the missing tail', () => {
    expect(realPathLenient(join(root, 'a', 'b', 'c.txt'))).toBe(join(root, 'a', 'b', 'c.txt'))
    symlinkSync(outside, join(root, 'link'))
    expect(realPathLenient(join(root, 'link', 'x', 'y'))).toBe(join(outside, 'x', 'y'))
  })
})
