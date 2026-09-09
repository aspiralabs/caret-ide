let counter = 0

/** Short unique id for tabs/views. Stable within a session; good enough for keys. */
export function uid(prefix = 'id'): string {
  counter += 1
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}`
}
