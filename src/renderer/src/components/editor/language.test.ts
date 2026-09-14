import { describe, expect, it } from 'vitest'
import { languageForPath } from './language'

describe('languageForPath (#23)', () => {
  it('maps the common web languages', () => {
    expect(languageForPath('/p/a.tsx')).toBe('typescript')
    expect(languageForPath('/p/a.mjs')).toBe('javascript')
    expect(languageForPath('/p/a.scss')).toBe('scss')
    expect(languageForPath('/p/App.vue')).toBe('html')
    expect(languageForPath('/p/App.svelte')).toBe('html')
  })
  it('maps the added languages', () => {
    expect(languageForPath('/p/ci.yml')).toBe('yaml')
    expect(languageForPath('/p/Cargo.toml')).toBe('ini')
    expect(languageForPath('/p/run.sh')).toBe('shell')
    expect(languageForPath('/p/Dockerfile')).toBe('dockerfile')
    expect(languageForPath('/p/Dockerfile.dev')).toBe('dockerfile')
    expect(languageForPath('/p/q.sql')).toBe('sql')
    expect(languageForPath('/p/x.py')).toBe('python')
    expect(languageForPath('/p/main.go')).toBe('go')
    expect(languageForPath('/p/lib.rs')).toBe('rust')
    expect(languageForPath('/p/schema.graphql')).toBe('graphql')
    expect(languageForPath('/p/.zshrc')).toBe('shell')
    expect(languageForPath('/p/.prettierrc')).toBe('json')
  })
  it('handles env files and unknowns', () => {
    expect(languageForPath('/p/.env.local')).toBe('dotenv')
    expect(languageForPath('/p/weird.xyz')).toBe('plaintext')
    expect(languageForPath('/p/LICENSE')).toBe('plaintext')
  })
})
