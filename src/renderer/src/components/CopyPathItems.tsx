import { useProjectStore } from '../stores/project'
import { fileReference, relativePath } from '../lib/claudeRefs'

/** Write text to the clipboard, ignoring failures (no permission / headless). */
export function copyText(text: string): void {
  void navigator.clipboard?.writeText(text).catch(() => {})
}

/**
 * The three "copy" entries shared by the file-tree and editor-tab context
 * menus: absolute path, project-relative path, and the `@path` form Claude
 * Code accepts in a prompt. `MenuItem` is passed in so each menu keeps its
 * own styling.
 */
export default function CopyPathItems({
  path,
  MenuItem,
  onDone
}: {
  path: string
  MenuItem: (props: { label: string; onClick: () => void }) => JSX.Element
  onDone: () => void
}): JSX.Element {
  const root = useProjectStore.getState().info?.root ?? ''
  const run = (text: string) => (): void => {
    copyText(text)
    onDone()
  }
  return (
    <>
      <MenuItem label="Copy Path" onClick={run(path)} />
      <MenuItem label="Copy Relative Path" onClick={run(relativePath(path, root))} />
      <MenuItem label="Copy @file Reference" onClick={run(fileReference(path, root))} />
    </>
  )
}
