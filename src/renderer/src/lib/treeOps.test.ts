import { describe, expect, it } from 'vitest'
import type { DirEntry } from '@shared/types'
import { canMoveInto, dropDirFor, entryShown, filterPaths, rangeBetween, visibleOrder } from './treeOps'
import { componentName, FILE_TEMPLATES } from './fileTemplates'

const e = (path: string, isDir = false, ignored = false): DirEntry => ({
  name: path.slice(path.lastIndexOf('/') + 1),
  path,
  isDir,
  isSymlink: false,
  ignored
})

describe('visibleOrder / rangeBetween (#30)', () => {
  const children = {
    '/p': [e('/p/src', true), e('/p/.env'), e('/p/a.ts')],
    '/p/src': [e('/p/src/b.ts'), e('/p/src/deep', true)],
    '/p/src/deep': [e('/p/src/deep/c.ts')]
  }
  it('walks expanded dirs in display order', () => {
    expect(visibleOrder('/p', children, new Set(['/p/src']))).toEqual(['/p/src', '/p/src/b.ts', '/p/src/deep', '/p/.env', '/p/a.ts'])
    expect(visibleOrder('/p', children, new Set())).toEqual(['/p/src', '/p/.env', '/p/a.ts'])
    expect(visibleOrder('/p', children, new Set(['/p/src']), (x) => !x.name.startsWith('.'))).not.toContain('/p/.env')
  })
  it('selects an inclusive range either direction', () => {
    const order = visibleOrder('/p', children, new Set(['/p/src']))
    expect(rangeBetween(order, '/p/src/b.ts', '/p/.env')).toEqual(['/p/src/b.ts', '/p/src/deep', '/p/.env'])
    expect(rangeBetween(order, '/p/.env', '/p/src/b.ts')).toEqual(['/p/src/b.ts', '/p/src/deep', '/p/.env'])
    expect(rangeBetween(order, null, '/p/a.ts')).toEqual(['/p/a.ts'])
  })
})

describe('drop / move rules (#29)', () => {
  it('drops land in the dir or a file’s parent', () => {
    expect(dropDirFor({ path: '/p/src', isDir: true })).toBe('/p/src')
    expect(dropDirFor({ path: '/p/src/a.ts', isDir: false })).toBe('/p/src')
  })
  it('refuses no-op and self moves', () => {
    expect(canMoveInto('/p/src/a.ts', '/p/src')).toBe(false)
    expect(canMoveInto('/p/src', '/p/src')).toBe(false)
    expect(canMoveInto('/p/src', '/p/src/deep')).toBe(false)
    expect(canMoveInto('/p/src/a.ts', '/p/lib')).toBe(true)
    expect(canMoveInto('/p/src', '/p/srcx')).toBe(true)
  })
})

describe('visibility toggles (#33) and filter (#31)', () => {
  it('hides dotfiles / ignored per the toggles', () => {
    expect(entryShown(e('/p/.env'), { showIgnored: true, showDotfiles: false })).toBe(false)
    expect(entryShown(e('/p/dist', true, true), { showIgnored: false, showDotfiles: true })).toBe(false)
    expect(entryShown(e('/p/a.ts'), { showIgnored: false, showDotfiles: false })).toBe(true)
  })
  it('ranks basename hits before path hits', () => {
    const rels = ['src/tabs.ts', 'docs/tabs/intro.md', 'lib/other.ts']
    expect(filterPaths(rels, 'tabs')).toEqual(['src/tabs.ts', 'docs/tabs/intro.md'])
    expect(filterPaths(rels, '')).toEqual([])
    expect(filterPaths(rels, 'TABS.TS')).toEqual(['src/tabs.ts'])
  })
})

describe('file templates (#32)', () => {
  it('derives component names and renders bodies', () => {
    expect(componentName('nav-bar.tsx')).toBe('NavBar')
    expect(componentName('.tsx')).toBe('Component')
    const react = FILE_TEMPLATES.find((t) => t.id === 'react')!
    expect(react.body('user_card.tsx')).toContain('function UserCard()')
    const test = FILE_TEMPLATES.find((t) => t.id === 'test')!
    expect(test.body('tabs.test.ts')).toContain("describe('tabs'")
    expect(FILE_TEMPLATES.find((t) => t.id === 'md')!.body('NOTES.md')).toBe('# NOTES\n\n')
  })
})
