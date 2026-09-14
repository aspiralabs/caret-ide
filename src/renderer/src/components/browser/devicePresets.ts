/** Fixed preview widths offered in the browser chrome; `null` = fluid (fill). */
export const DEVICE_PRESETS: ReadonlyArray<{ label: string; width: number | null }> = [
  { label: 'Fluid', width: null },
  { label: 'Phone · 375', width: 375 },
  { label: 'Phone L · 430', width: 430 },
  { label: 'Tablet · 768', width: 768 },
  { label: 'Laptop · 1024', width: 1024 },
  { label: 'Desktop · 1440', width: 1440 }
]

/**
 * The width the letterboxed viewport should actually take: the requested
 * device width, but never wider than the pane (a 1440 preset in a 900px pane
 * just fills it). `null` (fluid) → the full pane.
 */
export function effectivePreviewWidth(requested: number | null | undefined, available: number): number {
  if (!requested || requested <= 0) return available
  return Math.min(requested, available)
}

/** Label for the chrome's width badge, e.g. "375" or "" for fluid. */
export function presetLabel(width: number | null | undefined): string {
  return DEVICE_PRESETS.find((p) => p.width === (width ?? null))?.label ?? `${width}`
}
