import { describe, expect, it } from 'vitest'
import { detectPackageManager, parseScripts, runScriptCommand } from './packageScripts'
import { detectDevServerUrls, DevServerOffers } from './devServer'

describe('parseScripts (integration #18)', () => {
  it('lists string scripts in order and tolerates garbage', () => {
    expect(parseScripts('{"scripts":{"dev":"vite","test":"vitest run","weird":5}}')).toEqual([
      { name: 'dev', command: 'vite' },
      { name: 'test', command: 'vitest run' }
    ])
    expect(parseScripts('{}')).toEqual([])
    expect(parseScripts('nope')).toEqual([])
  })
})

describe('package manager detection / run command', () => {
  it('prefers bun, then pnpm, then yarn, else npm', () => {
    expect(detectPackageManager(['package.json', 'bun.lockb'])).toBe('bun')
    expect(detectPackageManager(['pnpm-lock.yaml', 'yarn.lock'])).toBe('pnpm')
    expect(detectPackageManager(['yarn.lock'])).toBe('yarn')
    expect(detectPackageManager(['package-lock.json'])).toBe('npm')
    expect(detectPackageManager([])).toBe('npm')
  })
  it('formats the command per manager and quotes odd names', () => {
    expect(runScriptCommand('npm', 'dev')).toBe('npm run dev')
    expect(runScriptCommand('yarn', 'build:prod')).toBe('yarn build:prod')
    expect(runScriptCommand('pnpm', 'dev')).toBe('pnpm dev')
    expect(runScriptCommand('bun', 'dev')).toBe('bun run dev')
    expect(runScriptCommand('npm', "we ird")).toBe("npm run 'we ird'")
  })
})

describe('detectDevServerUrls', () => {
  it('finds local URLs through ANSI colour codes and prose', () => {
    const vite = '\x1b[32m➜\x1b[39m  \x1b[1mLocal\x1b[22m:   \x1b[36mhttp://localhost:\x1b[1m5173\x1b[22m/\x1b[39m\n'
    expect(detectDevServerUrls(vite)).toEqual(['http://localhost:5173/'])
    expect(detectDevServerUrls('Server listening at http://127.0.0.1:8080.')).toEqual(['http://127.0.0.1:8080'])
    expect(detectDevServerUrls('ready on http://0.0.0.0:3000')).toEqual(['http://localhost:3000'])
    expect(detectDevServerUrls('open http://app.localhost:3000/dashboard and http://localhost:3000/dashboard')).toEqual([
      'http://app.localhost:3000/dashboard',
      'http://localhost:3000/dashboard'
    ])
  })
  it('ignores remote URLs and plain text', () => {
    expect(detectDevServerUrls('see https://vitejs.dev/guide')).toEqual([])
    expect(detectDevServerUrls('nothing here')).toEqual([])
  })
})

describe('DevServerOffers', () => {
  it('offers each URL once per terminal', () => {
    const o = new DevServerOffers()
    expect(o.fresh('http://localhost:5173/')).toEqual(['http://localhost:5173/'])
    expect(o.fresh('again http://localhost:5173/')).toEqual([])
    expect(o.fresh('http://localhost:4000')).toEqual(['http://localhost:4000'])
  })
})
