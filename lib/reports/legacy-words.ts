/**
 * Words a frozen snapshot still carries from before the em-dash sweep
 * (copy de-clutter, 2026-09-24).
 *
 * A snapshot freezes numbers, and it should never freeze words; a few builders
 * still write sentences into `report_snapshots.data`, so an artefact built
 * before the sweep re-renders its old punctuation. This walks the data at render
 * and swaps ONLY the exact phrases the sweep rewrote. Each pattern is a whole
 * product phrase with its own words either side of the dash, so a commenter's
 * quote or a model's sentence can never match one (quotes are refs with
 * `text: ''` in a snapshot anyway).
 */
const LEGACY: readonly [RegExp, string][] = [
  [/ is outside this quarter — it is the month the product is in now\./g, ' is outside this quarter: it is the month the product is in now.'],
  [/the month's own reading agreed — it cleared its band/g, "the month's own reading agreed: it cleared its band"],
  [/the month's own reading did not agree — inside the band/g, "the month's own reading did not agree: inside the band"],
  [/^(.+?) — you against /g, '$1: you against '],
  [/ of what the search plan gathered — read, but not counted into a subject/g, ' of what the search plan gathered: read, but not counted into a subject'],
  [/^Your subjects were not compared across this quarter — they are not counted as one window for this workspace yet, so no subject comparison was attempted\.$/g, 'Your subjects were not compared across this quarter.'],
  [/could not be quoted — too short, or nothing but a handle/g, 'could not be quoted: too short, or nothing but a handle'],
  [/ was not in English — (\d[\d,]*) of (\d[\d,]*) videos whose language we know/g, ' was not in English: $1 of $2 videos whose language we know'],
  [/, counted in the videos we read — not comparisons we drew\./g, ', counted in the videos we read, not comparisons we drew.'],
  [/ — this update’s (\d[\d,]*) (videos?)$/g, ' · this update’s $1 $2'],
  [/ carried a comparison this month — the readings are here/g, ' carried a comparison this month: the readings are here'],
  [/ moved beyond their band this month — /g, ' moved beyond their band this month: '],
  [/^Your update — /g, 'Your update · '],
  [/^(.+?) — ((?:January|February|March|April|May|June|July|August|September|October|November|December) has closed at )/g, '$1: $2'],
  [/, before this reading — the numbers in it are that day’s\./g, ', before this reading. The numbers in it are that day’s.'],
  [/ is unusual (this week|in this update) — (\d[\d,]*) of /g, ' is unusual $1 · $2 of '],
  // Overview sentences the monthly snapshot stores (sweep F2).
  [/ this month — (\d[\d,]*) of (\d[\d,]*) videos\./g, ' this month, $1 of $2 videos.'],
  [/ this month — the change and the band are on each row\./g, ' this month; the change and the band are on each row.'],
  [/nothing has been proposed — name the five to eight/g, 'nothing has been proposed. Name the five to eight'],
  [/ lands one reading later — and it is read /g, ' lands one reading later, and it is read '],
  [/too few for its column to answer — the category column/g, 'too few for its column to answer; the category column'],
  [/One monthly reading so far — the first comparison/g, 'One monthly reading so far. The first comparison'],
  [/^Thin month — far fewer/g, 'Thin month: far fewer'],
  [/^Still filling — this month/g, 'Still filling: this month'],
  [/ conversation — never whether you succeeded\./g, ' conversation, never whether you succeeded.'],
  [/^(.+?) — no reading yet on this subject\.$/g, '$1: no reading yet on this subject.'],
  [/^(.+?) — not tracked\.$/g, '$1: not tracked.'],
]

function fix(s: string): string {
  if (!s.includes('—')) return s
  let out = s
  for (const [re, to] of LEGACY) out = out.replace(re, to)
  return out
}

/** A copy of `data` with the sweep's legacy phrases rewritten; the same object
 *  when nothing in it matched, so a current snapshot costs one walk. */
export function withCurrentWords<T>(data: T): T {
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return fix(v)
    if (Array.isArray(v)) {
      let changed = false
      const next = v.map((x) => { const y = walk(x); if (y !== x) changed = true; return y })
      return changed ? next : v
    }
    if (v && typeof v === 'object') {
      let changed = false
      const next: Record<string, unknown> = {}
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        const y = walk(x)
        if (y !== x) changed = true
        next[k] = y
      }
      return changed ? next : v
    }
    return v
  }
  return walk(data) as T
}
