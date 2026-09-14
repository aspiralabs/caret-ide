/** Parse "v1.2.3" / "1.2.3-beta.1" → [1,2,3] (prerelease ignored); null when not semver. */
export function parseSemver(v: string): [number, number, number] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(v.trim())
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

/** -1 / 0 / 1 comparing two versions; unparsable versions compare as 0.0.0. */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const pa = parseSemver(a) ?? [0, 0, 0]
  const pb = parseSemver(b) ?? [0, 0, 0]
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1
  }
  return 0
}

/** Outcome of an update check. */
export interface UpdateInfo {
  current: string
  latest: string
  /** Release page to download from. */
  url: string
  isNewer: boolean
}
