// Palette command icons, mapped to lucide-react. `CommandIcon` keeps its
// name-based API so callers (CommandPalette, etc.) are unchanged; only the
// underlying glyphs come from lucide now.

import {
  PanelLeft,
  PanelRight,
  PanelsTopLeft,
  Globe,
  Terminal,
  WrapText,
  Save,
  X,
  FolderClosed,
  RefreshCw,
  FolderOpen,
  Settings,
  Code,
  type LucideIcon
} from 'lucide-react'
import type { CommandIconName } from '../lib/commands'

const icons: Record<CommandIconName, LucideIcon> = {
  'panel-left': PanelLeft,
  'panel-right': PanelRight,
  'panel-center': PanelsTopLeft,
  globe: Globe,
  terminal: Terminal,
  wrap: WrapText,
  save: Save,
  close: X,
  folder: FolderClosed,
  refresh: RefreshCw,
  'folder-open': FolderOpen,
  settings: Settings,
  code: Code
}

export function CommandIcon({ name }: { name: CommandIconName }): JSX.Element {
  const Icon = icons[name]
  return <Icon size={18} strokeWidth={1.5} />
}
