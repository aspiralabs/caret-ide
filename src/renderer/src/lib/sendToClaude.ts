import { useTerminalsStore, type TerminalTab } from '../stores/terminals'
import { useLayoutStore } from '../stores/layout'
import { useProjectStore } from '../stores/project'
import { useToastStore } from '../stores/toast'
import { focusTerminal } from './terminalFocus'
import { asBracketedPaste } from '../components/browser/formatReference'
import { fencedSnippet, fileReference, lineReference } from './claudeRefs'

/** A selection reported by an editor: 1-based inclusive lines. */
export interface EditorSelection {
  text: string
  startLine: number
  endLine: number
}

/**
 * The terminal to send a prompt fragment to: the active tab if it runs
 * claude, else the first claude tab. Null when no session is running.
 */
export function claudeTerminal(
  terminals: ReadonlyArray<TerminalTab>,
  activeId: string | null
): TerminalTab | null {
  const isClaude = (t: TerminalTab): boolean => t.foreground === 'claude' && !t.exited && !!t.ptyId
  const active = terminals.find((t) => t.id === activeId)
  if (active && isClaude(active)) return active
  return terminals.find(isClaude) ?? null
}

/**
 * The prompt text for an editor selection: an `@path#L10-L20` mention plus
 * the selected lines fenced, so the model sees both the location and the
 * code. With no selection just the `@path` mention (Claude reads the file).
 */
export function selectionPrompt(
  path: string,
  root: string,
  selection: EditorSelection | null,
  lang = ''
): { marker: string; body: string | null } {
  if (!selection || !selection.text.trim()) {
    return { marker: fileReference(path, root) + ' ', body: null }
  }
  const ref = lineReference(path, root, selection.startLine, selection.endLine)
  return { marker: ref + ' ', body: `${ref}\n${fencedSnippet(selection.text, lang)}` }
}

/**
 * Write text into the running Claude Code session. Short mentions go in as
 * typed text; multi-line bodies as a bracketed paste (Claude Code condenses
 * them to a [Pasted text #N] chip). Returns false (with a toast) when no
 * session is running.
 */
export function sendToClaude(marker: string, body: string | null): boolean {
  const { terminals, activeId } = useTerminalsStore.getState()
  const target = claudeTerminal(terminals, activeId)
  if (!target?.ptyId) {
    useToastStore.getState().show('No terminal is running Claude Code')
    return false
  }
  window.ide.pty.write(target.ptyId, body ? `${marker.trimEnd()}${asBracketedPaste(body)}` : marker)
  const layout = useLayoutStore.getState()
  if (!layout.rightVisible) layout.togglePanel('right')
  useTerminalsStore.getState().setActive(target.id)
  focusTerminal(target.id)
  return true
}

/** "Add file to prompt": type an `@path ` mention for a tree node. */
export function sendFileReference(path: string): boolean {
  const root = useProjectStore.getState().info?.root ?? ''
  return sendToClaude(fileReference(path, root) + ' ', null)
}
