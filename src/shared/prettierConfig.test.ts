import { describe, expect, it } from 'vitest'
import { chooseConfig, parseGlobalPrettierConfig } from './prettierConfig'

describe('parseGlobalPrettierConfig (#22)', () => {
  it('accepts a JSON object, rejects everything else with a message', () => {
    expect(parseGlobalPrettierConfig('{"semi": false, "singleQuote": true}')).toEqual({
      options: { semi: false, singleQuote: true }
    })
    expect(parseGlobalPrettierConfig('  ')).toEqual({ options: null })
    expect(parseGlobalPrettierConfig('[1]').error).toMatch(/object/)
    expect(parseGlobalPrettierConfig('semi: false').error).toMatch(/Invalid JSON/)
  })
})

describe('chooseConfig', () => {
  it('prefers the project config, then the global one, then defaults', () => {
    expect(chooseConfig({ semi: true }, '{"semi": false}')).toEqual({ options: { semi: true }, source: 'project' })
    expect(chooseConfig(null, '{"semi": false}')).toEqual({ options: { semi: false }, source: 'global' })
    expect(chooseConfig(null, 'garbage')).toEqual({ options: {}, source: 'defaults' })
    expect(chooseConfig(null, '')).toEqual({ options: {}, source: 'defaults' })
  })
})
