import { useSettingsStore } from '../stores/settings'
import { resolveKeybindings } from '../lib/commands'

/**
 * The primary keychord currently bound to a command (canonical form, e.g.
 * "mod+d"), resolved live from settings — or undefined when unbound. Feed the
 * result to a Tooltip's `shortcut` prop so hints track the user's keybindings.
 */
export function useCommandChord(commandId: string): string | undefined {
  const overrides = useSettingsStore((s) => s.settings.keybindings)
  return resolveKeybindings(overrides).get(commandId)?.[0]
}
