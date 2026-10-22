import { execFile, execFileSync } from 'child_process'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs'
import { createServer } from 'net'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { ensureNotifyIde, ensureShellIntegration, shellIntegrationEnv, zshIntegrationFiles } from './shellIntegration'

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
      // OSC 7: the cwd after every prompt (the test's cwd here).
      expect(out).toContain('\x1b]7;file://')
      expect(out).toMatch(new RegExp('\\x1b\\]7;file://[^/]*' + process.cwd().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\x07'))
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('the zsh shim re-prepends the notify-ide bin dir after the user rc', () => {
    expect(zshIntegrationFiles()['.zshrc']).toContain('[[ -n "$CARET_BIN" ]] && path=("$CARET_BIN" ${path:#$CARET_BIN})')
  })
})

describe('notify-ide script', () => {
  function run(bin: string, args: string[], env: Record<string, string>, input = ''): Promise<number> {
    return new Promise((resolve) => {
      const child = execFile(join(bin, 'notify-ide'), args, { env: { PATH: '/usr/bin:/bin', ...env }, timeout: 5000 }, (err) =>
        resolve(err ? ((err as { code?: number }).code ?? 1) : 0)
      )
      child.stdin?.end(input)
    })
  }

  it('is executable and no-ops (exit 0) outside Caret or with a dead socket', async () => {
    const userData = mkdtempSync(join(tmpdir(), 'caret-ni-'))
    try {
      const bin = ensureNotifyIde(userData)
      expect(statSync(join(bin, 'notify-ide')).mode & 0o111).toBeTruthy()
      expect(await run(bin, ['awaiting'], {})).toBe(0)
      expect(await run(bin, ['hook'], { CARET_PTY_ID: 'pty_1_0', CARET_NOTIFY_SOCK: join(userData, 'gone.sock') }, '{}')).toBe(0)
      expect(await run(bin, ['nonsense'], {})).toBe(0)
      ensureNotifyIde(userData) // idempotent
    } finally {
      rmSync(userData, { recursive: true, force: true })
    }
  })

  it('sends "<cmd> <ptyId>" and, for hook, the stdin payload', async () => {
    const userData = mkdtempSync(join(tmpdir(), 'caret-ni-'))
    const sock = join(tmpdir(), `caret-test-${process.pid}.sock`)
    const got: string[] = []
    const srv = createServer((s) => {
      let b = ''
      s.on('data', (d) => (b += d))
      s.on('end', () => {
        got.push(b)
        s.end()
      })
    })
    await new Promise<void>((r) => srv.listen(sock, r))
    try {
      const bin = ensureNotifyIde(userData)
      const env = { CARET_PTY_ID: 'pty_5_2', CARET_NOTIFY_SOCK: sock }
      expect(await run(bin, [], env)).toBe(0)
      expect(await run(bin, ['clear'], env)).toBe(0)
      expect(await run(bin, ['hook'], env, '{"hook_event_name":\n"Stop"}')).toBe(0)
      expect(got).toEqual(['awaiting pty_5_2\n', 'clear pty_5_2\n', 'hook pty_5_2\n{"hook_event_name":\n"Stop"}'])
    } finally {
      await new Promise((r) => srv.close(r))
      rmSync(userData, { recursive: true, force: true })
    }
  })
})
