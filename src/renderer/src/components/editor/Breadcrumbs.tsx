import { ChevronRight } from 'lucide-react'
import { useProjectStore } from '../../stores/project'
import { useFilesStore } from '../../stores/files'
import { useLayoutStore } from '../../stores/layout'
import { crumbsFor } from '../../lib/breadcrumbs'
import { fileIcon } from '../files/icons'

/**
 * Path strip above an editor: project-relative directory segments and the
 * file name. Clicking a segment reveals it in the file tree (expanding the
 * folder / selecting the file), showing the sidebar if hidden.
 */
export default function Breadcrumbs({ path }: { path: string }): JSX.Element {
  const root = useProjectStore((s) => s.info?.root ?? '')
  const crumbs = crumbsFor(path, root)
  const reveal = (target: string, isDir: boolean): void => {
    const layout = useLayoutStore.getState()
    if (!layout.leftVisible) layout.togglePanel('left')
    const files = useFilesStore.getState()
    if (isDir) {
      void files.expandDir(target).then(() => files.setSelected(target))
    } else {
      void files.revealPath(target, root)
    }
  }
  return (
    <div className="flex h-6 shrink-0 items-center gap-0.5 overflow-hidden border-b border-ink-border bg-ink-panel px-2 text-[11px] text-ink-muted">
      {crumbs.map((c, i) => (
        <span key={c.path} className="flex min-w-0 items-center gap-0.5">
          {i > 0 && <ChevronRight size={11} className="shrink-0 opacity-60" />}
          <button
            onClick={() => reveal(c.path, c.isDir)}
            title={c.path}
            className={`flex min-w-0 items-center gap-1 truncate rounded px-1 hover:bg-ink-hover hover:text-ink-text ${
              c.isDir ? '' : 'text-ink-text'
            }`}
          >
            {!c.isDir && <span className="inline-flex h-3.5 w-3.5 items-center justify-center">{fileIcon(c.name)}</span>}
            <span className="truncate">{c.name}</span>
          </button>
        </span>
      ))}
    </div>
  )
}
