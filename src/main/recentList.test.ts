import { describe, expect, it } from 'vitest'
import { addRecent, groupRecent, MAX_RECENT, removeRecent, setGroup, setPinned, sortRecent } from './recentList'

describe('recent projects list (#46)', () => {
  it('moves reopened projects to the front and caps only the unpinned tail', () => {
    let list = addRecent([], '/p/a', 1)
    list = setPinned(list, '/p/a', true)
    for (let i = 0; i < MAX_RECENT + 3; i++) list = addRecent(list, `/p/x${i}`, 10 + i)
    expect(list.filter((p) => !p.pinned)).toHaveLength(MAX_RECENT)
    expect(list.some((p) => p.root === '/p/a')).toBe(true) // pinned survives
    list = addRecent(list, '/p/a', 999)
    expect(list[0]).toMatchObject({ root: '/p/a', pinned: true, lastOpened: 999 })
  })

  it('removes, pins/unpins and groups', () => {
    let list = addRecent(addRecent([], '/p/a', 1), '/p/b', 2)
    list = setGroup(list, '/p/a', '  Work ')
    expect(list.find((p) => p.root === '/p/a')?.group).toBe('Work')
    list = setGroup(list, '/p/a', '')
    expect(list.find((p) => p.root === '/p/a')?.group).toBeUndefined()
    list = setPinned(list, '/p/b', true)
    list = setPinned(list, '/p/b', false)
    expect(list.find((p) => p.root === '/p/b')?.pinned).toBeUndefined()
    expect(removeRecent(list, '/p/a').map((p) => p.root)).toEqual(['/p/b'])
  })

  it('sorts pinned first and groups into sections (named groups, then the rest)', () => {
    let list = addRecent(addRecent(addRecent([], '/p/a', 1), '/p/b', 2), '/p/c', 3)
    list = setPinned(list, '/p/a', true)
    expect(sortRecent(list).map((p) => p.root)).toEqual(['/p/a', '/p/c', '/p/b'])
    list = setGroup(list, '/p/c', 'Work')
    list = setGroup(list, '/p/b', 'Work')
    const groups = groupRecent(list)
    expect(groups.map((g) => g.group)).toEqual(['Work', ''])
    expect(groups[0].projects.map((p) => p.root)).toEqual(['/p/c', '/p/b'])
    expect(groups[1].projects.map((p) => p.root)).toEqual(['/p/a'])
  })
})
