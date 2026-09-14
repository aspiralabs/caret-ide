import { join } from './path'
import { useProjectStore } from '../stores/project'
import { useTabsStore } from '../stores/tabs'
import { useLayoutStore } from '../stores/layout'
import { getEditor } from './editorBridge'
import { mdGetContent } from './markdownDoc'
import { getEditorModel } from './editorModels'
import { sendToClaude } from './sendToClaude'

/** Project-local dir for Caret's own files; ignored by git via its own .gitignore. */
export const CARET_DIR = '.caret'
export const SCRATCHPAD_FILE = 'prompts.md'

export const scratchpadPath = (root: string): string => join(root, CARET_DIR, SCRATCHPAD_FILE)
export const isScratchpad = (path: string, root: string): boolean => !!root && path === scratchpadPath(root)

const SEED = `# Prompt scratchpad

Draft long prompts here, then select text (or nothing, for the whole file) and press **Send to Claude**.
This file lives in \`.caret/\`, which git ignores.
`

/**
 * Make sure `.caret/prompts.md` exists (plus a `.caret/.gitignore` that
 * ignores the whole dir, so the project's own .gitignore is never touched)
 * and open it in a markdown tab.
 */
export async function openScratchpad(): Promise<void> {
  const root = useProjectStore.getState().info?.root
  if (!root) return
  const dir = join(root, CARET_DIR)
  await window.ide.fs.createDir(dir)
  await window.ide.fs.createFile(join(dir, '.gitignore')).then(
    () => window.ide.fs.writeFile(join(dir, '.gitignore'), '*\n'),
    () => undefined // already there
  )
  const path = scratchpadPath(root)
  await window.ide.fs.createFile(path).then(
    () => window.ide.fs.writeFile(path, SEED),
    () => undefined
  )
  useTabsStore.getState().openFile(path)
  const layout = useLayoutStore.getState()
  if (!layout.centerVisible) layout.togglePanel('center')
}

/**
 * Send the scratchpad's selection — or, with nothing selected, the whole
 * document — into the running Claude Code session as one paste.
 */
export function sendScratchpad(tabId: string, path: string): boolean {
  const selection = getEditor(tabId)?.getSelection?.()
  const text =
    selection?.text ?? getEditorModel(path)?.getValue() ?? mdGetContent(path) ?? ''
  const body = text.trim()
  if (!body) return false
  return sendToClaude('', body)
}
