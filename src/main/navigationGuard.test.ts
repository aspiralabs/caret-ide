import { describe, expect, it } from 'vitest'
import { previewPermissionAllowed, shouldBlockNavigation } from './navigationGuard'

describe('shouldBlockNavigation (bug #6)', () => {
  const dev = 'http://localhost:5173/'
  const prod = 'file:///Applications/Caret.app/Contents/Resources/app.asar/out/renderer/index.html'

  it('allows reloads of the same document (with or without a hash)', () => {
    expect(shouldBlockNavigation(dev, dev)).toBe(false)
    expect(shouldBlockNavigation(prod, prod)).toBe(false)
    expect(shouldBlockNavigation(prod + '#welcome', prod)).toBe(false)
    expect(shouldBlockNavigation(prod, prod + '#welcome')).toBe(false)
  })

  it('blocks a dropped file navigating the app away', () => {
    expect(shouldBlockNavigation(dev, 'file:///Users/me/notes.txt')).toBe(true)
    expect(shouldBlockNavigation(prod, 'file:///Users/me/notes.txt')).toBe(true)
  })

  it('blocks external URLs', () => {
    expect(shouldBlockNavigation(dev, 'https://example.com/')).toBe(true)
  })
})

describe('previewPermissionAllowed (bug #13)', () => {
  it('denies privacy-sensitive permissions by default', () => {
    for (const p of ['media', 'geolocation', 'notifications', 'midi', 'clipboard-read', 'openExternal']) {
      expect(previewPermissionAllowed(p)).toBe(false)
    }
  })
  it('allows fullscreen and pointer lock', () => {
    expect(previewPermissionAllowed('fullscreen')).toBe(true)
    expect(previewPermissionAllowed('pointerLock')).toBe(true)
  })
})
