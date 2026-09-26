import { monthStartOf } from '../../reading/month-key'
import { segmentOf } from './board'

// "With this update" (market-first WP2.7, plan §2.2 block 3 and §4.2
// `ArrivalsBlock`): what came into the market with the latest update, as
// counts that add to months, and the themes heard for the first time with it.
//
// COUNTS THAT ADD TO MONTHS, NEVER A WEEK ALONE (§9.1 #5). MF2's
// `update_arrivals` counts, per month, the market's videos first stored since
// the previous update and by this one's finish that carry a comment dated in
// the month, and the market's comments dated in the month first captured in
// that span. So `commentsCaptured`, update after update, adds up to the
// month's market comments (staging, September: 1,742 with the 9 Sep update,
// 2,463 with the 10 Sep and 11,999 with the 20 Sep make 16,204, the month's
// market comments); `videosFirstRead` counts only videos new to what we hold.
//
// HEARD FOR THE FIRST TIME uses This week's floor (`NEW_THEME_FLOOR`, 10
// videos in the month) and WP1.9's "re-grouped" rule (an update that opened a
// new clustering regime heard nothing for the first time; its minted
// identities are counted instead). Read on the category, where themes are
// grouped (decision E), and grouped by decision F as the board is: a theme
// half or more makers' (or off-topic) is counted, not named, so the list names
// the market's own conversations first.
//
// PURE. The loader reads `update_arrivals`, the themes the update minted, the
// segment shares and the provenance, and hands them in.

/** How many new themes the block names; the rest are counted. */
export const ARRIVAL_THEMES_SHOWN = 5

/** §4.2's `ArrivalsBlock`. `fromNewSearches` is null where the theme's
 *  provenance could not be measured (never a zero). `grouped` is additive:
 *  the new themes at the floor led by makers or set aside as off-topic
 *  (decision F), counted and not named. */
export interface ArrivalsBlock {
  run: { id: string; date: string }
  months: { month: string; videosFirstRead: number; commentsCaptured: number }[]
  current: { month: string; videos: number | null; updates: number }
  newThemes: { registryId: string; label: string; k: number; fromNewSearches: number | null }[]
  regrouped: number | null
  grouped?: { makers: number; setAside: number }
}

/** One row of `update_arrivals`, as PostgREST returns it. */
export interface UpdateArrivalsRow {
  month: string
  videos_first_read: number | string
  comments_captured: number | string
}

const count = (v: number | string): number | null => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isInteger(n) && n >= 0 ? n : null
}

/** The rows by month, oldest first; a row that is not a pair of counts is
 *  dropped rather than printed as a smaller number. */
export function arrivalMonths(rows: readonly UpdateArrivalsRow[]): ArrivalsBlock['months'] {
  const out = new Map<string, ArrivalsBlock['months'][number]>()
  for (const r of rows) {
    const v = count(r.videos_first_read)
    const c = count(r.comments_captured)
    if (v == null || c == null) continue
    const month = monthStartOf(r.month)
    if (!out.has(month)) out.set(month, { month, videosFirstRead: v, commentsCaptured: c })
  }
  return [...out.values()].sort((a, b) => (a.month < b.month ? -1 : 1))
}

/** The latest update on or before `now`: the run "as at" names. */
export function latestUpdate<R extends { id: string; started_at: string; completed_at?: string | null }>(runs: readonly R[], now: string): R | null {
  const nowMs = Date.parse(now)
  let best: { r: R; ms: number } | null = null
  for (const r of runs) {
    const ms = Date.parse(r.completed_at ?? r.started_at)
    if (Number.isNaN(ms) || ms > nowMs) continue
    if (!best || ms > best.ms) best = { r, ms }
  }
  return best?.r ?? null
}

/**
 * The themes heard for the first time with the update, at the floor in the
 * month: the ones not led by makers or set aside, largest first, each with how
 * many of its videos came from searches first run in the month; the others
 * counted (decision F).
 */
export function arrivalThemes(
  shown: readonly { id: string; label: string; videos: number }[],
  shares: { maker: ReadonlyMap<string, number | null>; noise: ReadonlyMap<string, number | null> } | null,
  provenance: ReadonlyMap<string, { fromNewSearches: number; of: number } | null>,
): Pick<ArrivalsBlock, 'newThemes' | 'grouped'> {
  const newThemes: ArrivalsBlock['newThemes'] = []
  let makers = 0
  let setAside = 0
  for (const t of [...shown].sort((a, b) => b.videos - a.videos || a.id.localeCompare(b.id))) {
    const seg = shares ? segmentOf({ makerShare: shares.maker.get(t.id) ?? null, noiseShare: shares.noise.get(t.id) ?? null }) : null
    if (seg === 'makers') makers++
    else if (seg === 'noise') setAside++
    else newThemes.push({ registryId: t.id, label: t.label, k: t.videos, fromNewSearches: provenance.get(t.id)?.fromNewSearches ?? null })
  }
  return { newThemes, grouped: { makers, setAside } }
}

/** The block, from the loader's reads. */
export function buildArrivals(input: {
  run: { id: string; date: string }
  rows: readonly UpdateArrivalsRow[]
  current: ArrivalsBlock['current']
  themes: { shown: readonly { id: string; label: string; videos: number }[]; regrouped: { themes: number } | null }
  shares: { maker: ReadonlyMap<string, number | null>; noise: ReadonlyMap<string, number | null> } | null
  provenance: ReadonlyMap<string, { fromNewSearches: number; of: number } | null>
}): ArrivalsBlock {
  const themes = input.themes.regrouped ? { newThemes: [], grouped: { makers: 0, setAside: 0 } } : arrivalThemes(input.themes.shown, input.shares, input.provenance)
  return {
    run: input.run,
    months: arrivalMonths(input.rows),
    current: input.current,
    ...themes,
    regrouped: input.themes.regrouped?.themes ?? null,
  }
}
