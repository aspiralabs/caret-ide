// Shared per-file markdown buffer so the CM6 live-preview editor and the Monaco
// source editor hand a file's content back and forth losslessly when the user
// toggles Preview ↔ Source. Both edit plain markdown text, so the handoff is a
// simple string — no conversion. `content` is the current (possibly unsaved)
// text; `baseline` is what's on disk (for dirty calc). Keyed by absolute path,
// cleared when the tab closes (see stores/tabs.ts).

const content = new Map<string, string>()
const baseline = new Map<string, string>()

export const mdGetContent = (path: string): string | undefined => content.get(path)
export const mdSetContent = (path: string, value: string): void => void content.set(path, value)

export const mdGetBaseline = (path: string): string | undefined => baseline.get(path)
export const mdSetBaseline = (path: string, value: string): void => void baseline.set(path, value)

export function mdClearDoc(path: string): void {
  content.delete(path)
  baseline.delete(path)
}
