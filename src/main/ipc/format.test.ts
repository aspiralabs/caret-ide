import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ ipcMain: { handle: () => {} } }))
vi.mock('../window', () => ({ projectWindowFor: () => undefined, onWindowClosed: () => {} }))

import { _resetPrettierCache, formatText, loadPrettier } from './format'

let root: string
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'caret-fmt-')))
  _resetPrettierCache()
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

const ugly = 'const x = {a:1,\n  b:2}\nfunction f( a,b ){return a+b}\n'

describe('formatText (#22)', () => {
  it('formats with the bundled Prettier and defaults when the project has no config', async () => {
    const file = join(root, 'a.ts')
    writeFileSync(file, ugly)
    const res = await formatText(root, { path: file, text: ugly, cursorOffset: 0 })
    expect(res.kind).toBe('formatted')
    if (res.kind !== 'formatted') return
    expect(res.formatted).toBe('const x = { a: 1, b: 2 };\nfunction f(a, b) {\n  return a + b;\n}\n')
    expect(res).toMatchObject({ changed: true, prettier: 'bundled', config: 'defaults' })
    expect((await loadPrettier(root)).source).toBe('bundled')
  })

  it('uses the global Settings config when the project has none', async () => {
    const file = join(root, 'a.ts')
    const res = await formatText(root, { path: file, text: ugly, globalConfig: '{"semi": false, "singleQuote": true}' })
    expect(res.kind).toBe('formatted')
    if (res.kind !== 'formatted') return
    expect(res.formatted).toBe('const x = { a: 1, b: 2 }\nfunction f(a, b) {\n  return a + b\n}\n')
    expect(res.config).toBe('global')
  })

  it('prefers the project’s own .prettierrc over the global config', async () => {
    writeFileSync(join(root, '.prettierrc'), '{ "semi": true, "tabWidth": 4 }')
    const file = join(root, 'a.ts')
    const res = await formatText(root, { path: file, text: ugly, globalConfig: '{"semi": false}' })
    expect(res.kind).toBe('formatted')
    if (res.kind !== 'formatted') return
    expect(res.formatted).toContain('    return a + b;')
    expect(res.config).toBe('project')
  })

  it('ignores a .prettierrc above the project root in favour of the global config', async () => {
    writeFileSync(join(root, '.prettierrc'), '{ "semi": true }')
    const project = join(root, 'project')
    mkdirSync(project)
    const res = await formatText(project, { path: join(project, 'a.ts'), text: ugly, globalConfig: '{"semi": false}' })
    expect(res).toMatchObject({ kind: 'formatted', config: 'global' })
    if (res.kind === 'formatted') expect(res.formatted).not.toContain(';')
  })

  it('respects .prettierignore, unknown file types and the size cap', async () => {
    writeFileSync(join(root, '.prettierignore'), 'generated/\n')
    mkdirSync(join(root, 'generated'))
    expect(await formatText(root, { path: join(root, 'generated', 'x.ts'), text: ugly })).toEqual({
      kind: 'skipped',
      reason: 'ignored'
    })
    expect(await formatText(root, { path: join(root, 'notes.unknownext'), text: 'x' })).toEqual({
      kind: 'skipped',
      reason: 'no-parser'
    })
    expect(await formatText(root, { path: join(root, 'big.ts'), text: 'x'.repeat(1024 * 1024 + 1) })).toEqual({
      kind: 'skipped',
      reason: 'too-large'
    })
    expect(await formatText(root, { path: join(root, 'node_modules', 'dep', 'i.js'), text: 'x' })).toEqual({
      kind: 'skipped',
      reason: 'ignored'
    })
  })

  it('reports syntax errors instead of throwing, and refuses paths outside the root', async () => {
    const res = await formatText(root, { path: join(root, 'bad.ts'), text: 'const = ;\n' })
    expect(res.kind).toBe('error')
    expect(await formatText(root, { path: '/etc/passwd', text: 'x' })).toMatchObject({ kind: 'error' })
  })

  it('maps the cursor through the format and reports unchanged input', async () => {
    const text = 'const x = 1;\n'
    const res = await formatText(root, { path: join(root, 'ok.ts'), text, cursorOffset: 6 })
    expect(res).toMatchObject({ kind: 'formatted', changed: false, cursorOffset: 6 })
  })

  it('loads the project’s own prettier when installed', async () => {
    // Point the temp project at this repo's prettier via a symlinked node_modules entry.
    mkdirSync(join(root, 'node_modules'), { recursive: true })
    const { symlinkSync } = await import('fs')
    symlinkSync(join(process.cwd(), 'node_modules', 'prettier'), join(root, 'node_modules', 'prettier'))
    writeFileSync(join(root, 'package.json'), '{"name":"t"}')
    expect((await loadPrettier(root)).source).toBe('project')
  })
})
