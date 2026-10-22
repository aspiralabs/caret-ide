// ---------------------------------------------------------------------------
// Shell integration: teach zsh to emit OSC 133 command-boundary sequences so
// the terminal can navigate between commands and rerun the last one.
//
// zsh reads its rc files from $ZDOTDIR, so we point ZDOTDIR at a directory we
// own whose files source the user's real ones (from the original ZDOTDIR, or
// $HOME) and then install precmd/preexec hooks:
//   133;A          prompt starts (command boundary)
//   133;C          command output begins
//   133;D;<code>   command finished with exit code
//   633;E;<b64>    the command line about to run (base64, so `;` is safe)
//   7;file://<host><cwd>   the shell's cwd at every prompt (terminal-mode title,
//                          Switch to IDE — no lsof needed)
// Only zsh is wired; other shells run untouched.
//
// Separately, `notify-ide` (awaiting-input dots, see ipc/awaiting) lives in a
// bin dir that every pty gets on PATH; the zsh shim re-prepends it after the
// user's rc in case that rewrote PATH.
// ---------------------------------------------------------------------------

import { chmodSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

/** Contents of the shim rc files, keyed by file name. */
export function zshIntegrationFiles(): Record<string, string> {
  const restore = `CARET_USER_ZDOTDIR="\${CARET_USER_ZDOTDIR:-$HOME}"\nZDOTDIR="$CARET_USER_ZDOTDIR"\n`
  const sourceUser = (name: string): string => `[[ -f "$ZDOTDIR/${name}" ]] && source "$ZDOTDIR/${name}"\n`
  const rezdot = `ZDOTDIR="$CARET_ZDOTDIR"\n`
  return {
    '.zshenv': `# Caret shell integration\n${restore}${sourceUser('.zshenv')}${rezdot}`,
    '.zprofile': `# Caret shell integration\n${restore}${sourceUser('.zprofile')}${rezdot}`,
    '.zlogin': `# Caret shell integration\n${restore}${sourceUser('.zlogin')}${rezdot}`,
    '.zshrc': `# Caret shell integration (OSC 133 command boundaries)
${restore}${sourceUser('.zshrc')}
[[ -n "$CARET_BIN" ]] && path=("$CARET_BIN" \${path:#$CARET_BIN})
__caret_precmd() {
  local code=$?
  printf '\\e]133;D;%s\\a\\e]133;A\\a\\e]7;file://%s%s\\a' "$code" "$HOST" "$PWD"
}
__caret_preexec() {
  printf '\\e]633;E;%s\\a\\e]133;C\\a' "$(printf %s "$1" | base64 | tr -d '\\n')"
}
autoload -Uz add-zsh-hook
add-zsh-hook precmd __caret_precmd
add-zsh-hook preexec __caret_preexec
`
  }
}

/**
 * Environment overrides for a zsh pty: our ZDOTDIR plus the user's original
 * so the shims can find their rc files. Returns {} for other shells.
 */
export function shellIntegrationEnv(shell: string, integrationDir: string, env: NodeJS.ProcessEnv): Record<string, string> {
  if (!/(^|\/)zsh$/.test(shell)) return {}
  return {
    CARET_ZDOTDIR: integrationDir,
    CARET_USER_ZDOTDIR: env.ZDOTDIR || env.HOME || '',
    ZDOTDIR: integrationDir
  }
}

/** Write the shim files (idempotent) and return the directory. */
export function ensureShellIntegration(userData: string): string {
  const dir = join(userData, 'shell-integration', 'zsh')
  mkdirSync(dir, { recursive: true })
  for (const [name, body] of Object.entries(zshIntegrationFiles())) writeFileSync(join(dir, name), body, 'utf8')
  return dir
}

/**
 * `notify-ide [awaiting|clear|hook]`: tell Caret this terminal's Claude
 * session is waiting on the user (or no longer is). `hook` forwards a Claude
 * Code hook payload from stdin and lets Caret decide. Plain sh + nc so it
 * starts in milliseconds, and it always exits 0 — outside Caret, or with
 * Caret gone, it does nothing, so a hook can never stall or fail Claude.
 */
export const NOTIFY_IDE_SCRIPT = `#!/bin/sh
# Caret: mark this terminal's Claude session as waiting on you (or not).
#   notify-ide [awaiting]   show the dot on this project / session tab
#   notify-ide clear        remove it
#   notify-ide hook         read a Claude Code hook payload on stdin
# No-op (exit 0) outside a Caret terminal.
sock="$CARET_NOTIFY_SOCK"
id="$CARET_PTY_ID"
cmd="\${1:-awaiting}"
case "$cmd" in
  awaiting|clear|hook) ;;
  *) echo "usage: notify-ide [awaiting|clear|hook]" >&2; exit 0 ;;
esac
if [ -z "$sock" ] || [ -z "$id" ] || [ ! -S "$sock" ]; then
  # Drain a hook payload so the writer never sees EPIPE.
  [ "$cmd" = hook ] && cat >/dev/null
  exit 0
fi
{
  printf '%s %s\\n' "$cmd" "$id"
  [ "$cmd" = hook ] && head -c 65536
} | nc -U -w 1 "$sock" >/dev/null 2>&1
exit 0
`

/** Write the notify-ide script (idempotent) and return its bin directory. */
export function ensureNotifyIde(userData: string): string {
  const dir = join(userData, 'shell-integration', 'bin')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, 'notify-ide')
  writeFileSync(file, NOTIFY_IDE_SCRIPT, 'utf8')
  chmodSync(file, 0o755)
  return dir
}
