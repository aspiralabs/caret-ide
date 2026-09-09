import type { CenterTab } from '../../stores/tabs'
import BrowserChrome from './BrowserChrome'
import BrowserFindBar from './BrowserFindBar'
import BrowserViewport from './BrowserViewport'

// ---------------------------------------------------------------------------
// BrowserPane — the center-panel content for the active browser tab.
// Chrome (nav bar) on top, the WebContentsView placeholder viewport below.
// Mounted only for the active browser tab (guaranteed by CenterPanel).
// ---------------------------------------------------------------------------

export default function BrowserPane({ tab }: { tab: CenterTab }): JSX.Element {
  return (
    <div className="flex h-full min-h-0 flex-col bg-ink-bg">
      <BrowserChrome tab={tab} />
      {/* Docked above the viewport (not floating): the native WebContentsView
          always paints over our DOM, so an overlay would be hidden behind it. */}
      <BrowserFindBar tabId={tab.id} />
      {/* min-h-0 lets the viewport shrink correctly inside the flex column. */}
      <div className="min-h-0 flex-1">
        <BrowserViewport tabId={tab.id} />
      </div>
    </div>
  )
}
