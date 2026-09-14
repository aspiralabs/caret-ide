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
// Only zsh is wired; other shells run untouched.
// ---------------------------------------------------------------------------

import { mkdirSync, writeFileSync } from 'fs'
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
__caret_precmd() {
  local code=$?
  printf '\\e]133;D;%s\\a\\e]133;A\\a' "$code"
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
