// Renderer-side feature flag accessors. Flags ride on `AppSettings.features`
// (see shared/features.ts), so they are live like every other setting.
import type { FeatureId } from '@shared/features'
import { useSettingsStore } from '../stores/settings'

/** Hook: re-renders when the flag flips. */
export function useFeature(id: FeatureId): boolean {
  return useSettingsStore((s) => s.settings.features[id])
}

/** Non-hook read for stores, command handlers and menu builders. */
export function isFeatureEnabled(id: FeatureId): boolean {
  return useSettingsStore.getState().settings.features[id]
}
