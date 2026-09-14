import { execFileSync } from 'child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { ensureShellIntegration, shellIntegrationEnv, zshIntegrationFiles } from './shellIntegration'

describe('shell integration (#44)', () => {
  it('only wires zsh', () => {
    expect(shellIntegrationEnv('/bin/bash', '/x', {})).toEqual({})
    expect(shellIntegrationEnv('/bin/zsh', '/x', { HOME: '/Users/me' })).toEqual({
      CARET_ZDOTDIR: '/x',
      CARET_USER_ZDOTDIR: '/Users/me',
      ZDOTDIR: '/x'
    })
    expect(shellIntegrationEnv('zsh', '/x', { ZDOTDIR: '/custom', HOME: '/Users/me' }).CARET_USER_ZDOTDIR).toBe('/custom')
  })

  it('writes shims that source the user rc files and install the hooks', () => {
    const userData = mkdtempSync(join(tmpdir(), 'caret-si-'))
    try {
      const dir = ensureShellIntegration(userData)
      const rc = readFileSync(join(dir, '.zshrc'), 'utf8')
      expect(rc).toContain('source "$ZDOTDIR/.zshrc"')
      expect(rc).toContain('add-zsh-hook precmd __caret_precmd')
      expect(rc).toContain('133;A')
      expect(Object.keys(zshIntegrationFiles()).sort()).toEqual(['.zlogin', '.zprofile', '.zshenv', '.zshrc'])
      // Idempotent.
      ensureShellIntegration(userData)
    } finally {
      rmSync(userData, { recursive: true, force: true })
    }
  })

  it('a real zsh emits the sequences and still sources the user .zshrc', () => {
    const home = mkdtempSync(join(tmpdir(), 'caret-home-'))
    try {
      writeFileSync(join(home, '.zshrc'), 'export CARET_TEST_RC=loaded\n')
      const dir = ensureShellIntegration(home)
      const env = { ...process.env, HOME: home, ...shellIntegrationEnv('/bin/zsh', dir, { HOME: home }) }
      delete (env as Record<string, string | undefined>).ZDOTDIR_ORIG
      const out = execFileSync('/bin/zsh', ['-i', '-c', 'echo "rc=$CARET_TEST_RC"; __caret_preexec "ls -la"; __caret_precmd'], {
        env,
        encoding: 'latin1',
        stdio: ['pipe', 'pipe', 'ignore']
      })
      expect(out).toContain('rc=loaded')
      expect(out).toContain('\x1b]633;E;' + Buffer.from('ls -la').toString('base64') + '\x07\x1b]133;C\x07')
      expect(out).toMatch(/\x1b]133;D;\d+\x07\x1b]133;A\x07/)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })
})
