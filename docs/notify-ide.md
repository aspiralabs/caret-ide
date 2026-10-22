# notify-ide: awaiting-input dots

When a Claude session in a Caret terminal stops to wait for you, a blue dot shows on that
project's tab in the title bar and on the session's terminal tab. That covers a question
(AskUserQuestion), a plan approval, a permission prompt and the end of a turn. The dot goes
away when you focus that terminal and type, or when you send the next prompt.

Behind the `awaitingNotify` flag (`"features": { "awaitingNotify": true }` in Caret's
settings.json). Terminals opened after the flag is on get it; restart older ones.

## How it works

- Caret listens on a per-process unix socket (`$TMPDIR/caret-<pid>.sock`, mode 0600) and gives
  every terminal `CARET_NOTIFY_SOCK`, `CARET_PTY_ID` and `notify-ide` on `PATH`.
- `notify-ide [awaiting|clear|hook]` sends one message and exits. It is plain `sh` + `nc`, takes
  a few milliseconds, and always exits 0. Outside Caret, or with Caret gone, it does nothing.
- `notify-ide hook` reads a Claude Code hook payload on stdin and Caret decides what it means
  (`src/main/ipc/awaitingParse.ts`):

| Hook | Effect |
|---|---|
| `Notification` (`permission_prompt`, `idle_prompt`, `elicitation_dialog`) | dot on |
| `Stop` | dot on |
| `PreToolUse` AskUserQuestion / ExitPlanMode | dot on |
| `PostToolUse` AskUserQuestion / ExitPlanMode | dot off |
| `UserPromptSubmit` | dot off |

Skills and scripts can also call `notify-ide` / `notify-ide clear` directly.

## Claude Code hooks

Add to `~/.claude/settings.json` (merge into any existing `hooks`). The `command -v` guard
keeps the hooks silent in terminals other than Caret's:

```json
{
  "hooks": {
    "Notification": [{ "hooks": [{ "type": "command", "command": "command -v notify-ide >/dev/null && notify-ide hook || true" }] }],
    "Stop": [{ "hooks": [{ "type": "command", "command": "command -v notify-ide >/dev/null && notify-ide hook || true" }] }],
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "command -v notify-ide >/dev/null && notify-ide hook || true" }] }],
    "PreToolUse": [{ "matcher": "AskUserQuestion|ExitPlanMode", "hooks": [{ "type": "command", "command": "command -v notify-ide >/dev/null && notify-ide hook || true" }] }],
    "PostToolUse": [{ "matcher": "AskUserQuestion|ExitPlanMode", "hooks": [{ "type": "command", "command": "command -v notify-ide >/dev/null && notify-ide hook || true" }] }]
  }
}
```
