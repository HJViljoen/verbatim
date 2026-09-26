import { SHARE_BAND } from '../report-bands'
import { bandVerdict, type Counted, type ObjectKind, type Verdict } from './verdicts'

// The re-check on the whole of a refused month pair (market-first decision D's
// secondary line, WP2.3; MF2 part A). PURE: scripts/comparability-checks.ts
// reads lens_readings over each population's videos and writes what this
// returns into comparability_checks.
//
// THE POPULATIONS (plan WP2.3), each an explicit set of the month's MARKET
// videos (market_month_videos: full lane, a comment dated in the month, the
// client's own posts out), so a count never takes a video from outside its
// base:
//   same_searches_clean  surfaced by a search that ran unchanged through both
//                        months (lib/provenance/searches.ts, as
//                        measure-comparability decides it), without the
//                        segments_v1 makers and off-topic videos, and without
//                        the videos whose first-found terms were overwritten
//                        (`ambiguous` provenance: left out and counted). The
//                        only population where a "moved" may print, and only
//                        when both sides hold CHECK_MIN_VIDEOS videos.
//   dense20              the videos with DENSE_MIN_DATED or more comments dated
//                        in the month (lens_readings' p_min_dated_comments):
//                        printed as a note, never alone as "moved".
//   all_but_noise        the off-topic videos out, by a rule not yet checked by
//                        hand.
//   equal_age            both months read at the same number of updates after
//                        they ended (p_captured_before): from December with
//                        WP3.4, "checks pending" until then; not computed here.
// A population's maker and noise shares are those of its base before its own
// clean-up (for same_searches_clean, the same-searches videos; for dense20,
// the dense videos; for all_but_noise, the whole market), over both months.
//
// THE OBJECTS. The market's kinds, its ready subjects (a provisional subject
// earns no verdict, decision C), mood on its positive share (decision K), each
// pooled over the market's audiences; and the category's themes (theme rows
// are the category bucket only, n the category's videos in the population)
// that reach THEME_MIN_K videos in either month on the whole market.
//
// THE OUTCOME. bandVerdict with SHARE_BAND on the population's two sides:
//   moved / no_clear_change   as the band says;
//   too_few                   under the floor (fewer than 100 videos or 10 of
//                             the object's on a side);
//   follows_depth             dense20 only: the whole market's share FELL
//                             ("moved", down), among well-read videos it did
//                             not move, AND the well-read change is materially
//                             smaller than the whole market's (it rose, or it
//                             fell by at most DEPTH_SHRINK_MAX of the whole
//                             market's fall): the fall follows how deeply the
//                             newer month's videos have been read, not the
//                             market. A well-read fall about as large as the
//                             whole market's (staging's "Leaving for something
//                             else": -4.6 pts on the market, -6.1 among
//                             well-read videos) did not go away, so it reads
//                             no_clear_change and prints no depth sentence.

/** recheck_v2 (the deploy-3 review): follows_depth needs the well-read change
 *  to be materially smaller than the whole market's. recheck_v1 gave it
 *  whenever the well-read verdict merely did not move. */
export const RECHECK_METHOD_VERSION = 'recheck_v2'
export const RECHECK_POPULATIONS = ['same_searches_clean', 'dense20', 'all_but_noise'] as const
export type RecheckPopulation = (typeof RECHECK_POPULATIONS)[number]
/** comparability_checks.outcome */
export type CheckOutcome = 'moved' | 'no_clear_change' | 'too_few' | 'follows_depth'
/** The floor a side must reach before a same-searches "moved" can print. */
export const CHECK_MIN_VIDEOS = SHARE_BAND.minN
export const DENSE_MIN_DATED = 20
/** A theme is re-checked when the whole market holds it on this many videos in
 *  either month (the board's floor). */
export const THEME_MIN_K = 10
/** follows_depth: the largest well-read fall, as a share of the whole
 *  market's fall, that still counts as the fall going away. */
export const DEPTH_SHRINK_MAX = 0.5
/** The client's audience key: its own posts are never the market. */
const CLIENT_AUDIENCE = 'client'
const CATEGORY_AUDIENCE = 'industry-other'

/** One row of lens_readings (MF2), per audience. */
export interface LensRow {
  audience: string
  object_kind: string
  object_id: string
  k: number
  n: number
}

/** A market video of the month, with what decides its populations. */
export interface PopulationVideo {
  id: string
  /** Dated comments in the month (market_month_videos). */
  dated: number
  segment: 'maker' | 'noise' | 'market'
  /** Not surfaced in the month by any search that ran unchanged through both
   *  months (lib/provenance/searches.ts isOutside). */
  outside: boolean
  /** Its first-found terms were overwritten (video_provenance method). */
  ambiguous: boolean
}

export interface PopulationSet {
  population: RecheckPopulation
  /** The videos lens_readings reads (p_video_ids). */
  ids: string[]
  /** The base before the population's own clean-up. */
  base: number
  makers: number
  noise: number
  /** same_searches_clean: same-searches videos left out as `ambiguous`. */
  ambiguous: number
  /** p_min_dated_comments */
  minDated: number
}

export function populationSet(videos: readonly PopulationVideo[], population: RecheckPopulation): PopulationSet {
  const count = (vs: readonly PopulationVideo[], s: PopulationVideo['segment']) => vs.filter((v) => v.segment === s).length
  if (population === 'same_searches_clean') {
    const inside = videos.filter((v) => !v.outside)
    const base = inside.filter((v) => !v.ambiguous)
    return {
      population, ids: base.filter((v) => v.segment === 'market').map((v) => v.id), base: base.length,
      makers: count(base, 'maker'), noise: count(base, 'noise'), ambiguous: inside.length - base.length, minDated: 1,
    }
  }
  if (population === 'dense20') {
    const base = videos.filter((v) => v.dated >= DENSE_MIN_DATED)
    return { population, ids: base.map((v) => v.id), base: base.length, makers: count(base, 'maker'), noise: count(base, 'noise'), ambiguous: 0, minDated: DENSE_MIN_DATED }
  }
  return {
    population, ids: videos.filter((v) => v.segment !== 'noise').map((v) => v.id), base: videos.length,
    makers: count(videos, 'maker'), noise: count(videos, 'noise'), ambiguous: 0, minDated: 1,
  }
}

/** The population's maker and noise shares over both months, or null where
 *  neither side holds a video. */
export function populationShares(prev: PopulationSet, curr: PopulationSet): { makers: number; noise: number } | null {
  const base = prev.base + curr.base
  if (base <= 0) return null
  const round = (x: number) => Math.round(x * 10000) / 10000
  return { makers: round((prev.makers + curr.makers) / base), noise: round((prev.noise + curr.noise) / base) }
}

export type CheckObjectKind = 'kind' | 'subject' | 'mood' | 'theme'
export interface CheckObject { kind: CheckObjectKind; id: string; label: string }

const market = (r: LensRow) => r.audience !== CLIENT_AUDIENCE

/** One object's pooled side from one population-month's lens rows: k over the
 *  market's audiences (themes: the category bucket), n the population's
 *  videos there (mood: its judged videos). A missing object row is 0. */
export function pooledCount(rows: readonly LensRow[], object: Pick<CheckObject, 'kind' | 'id'>): Counted {
  const sum = (xs: readonly LensRow[], f: (r: LensRow) => number) => xs.reduce((a, r) => a + f(r), 0)
  if (object.kind === 'theme') {
    const cat = rows.filter((r) => r.audience === CATEGORY_AUDIENCE)
    return {
      k: sum(cat.filter((r) => r.object_kind === 'theme' && r.object_id === object.id), (r) => r.k),
      n: sum(cat.filter((r) => r.object_kind === 'denominator' && r.object_id === 'videos'), (r) => r.n),
    }
  }
  const mine = rows.filter(market)
  if (object.kind === 'mood') {
    // Judged videos per audience: the n of any of the four sentiment rows.
    const judged = new Map<string, number>()
    for (const r of mine) {
      if (r.object_kind === 'mood' && ['positive', 'negative', 'neutral', 'mixed'].includes(r.object_id)) judged.set(r.audience, r.n)
    }
    return {
      k: sum(mine.filter((r) => r.object_kind === 'mood' && r.object_id === object.id), (r) => r.k),
      n: [...judged.values()].reduce((a, b) => a + b, 0),
    }
  }
  return {
    k: sum(mine.filter((r) => r.object_kind === object.kind && r.object_id === object.id), (r) => r.k),
    n: sum(mine.filter((r) => r.object_kind === 'denominator' && r.object_id === 'videos'), (r) => r.n),
  }
}

/** The category themes worth a re-check: THEME_MIN_K videos in either month
 *  on the whole market. By id; labels are the caller's. */
export function themesToCheck(prevAll: readonly LensRow[], currAll: readonly LensRow[]): string[] {
  const ids = new Set<string>()
  for (const rows of [prevAll, currAll]) {
    for (const r of rows) if (r.audience === CATEGORY_AUDIENCE && r.object_kind === 'theme' && r.k >= THEME_MIN_K) ids.add(r.object_id)
  }
  return [...ids].sort()
}

/** The whole market's share fell clearly, and among well-read videos the
 *  change is materially smaller: it rose, held, or fell by at most
 *  DEPTH_SHRINK_MAX of the whole market's fall. */
function followsDepth(dense: Verdict, whole: Verdict | null): boolean {
  const w = whole?.changePts
  const d = dense.changePts
  if (whole?.state !== 'moved' || w == null || !(w < 0) || d == null || !Number.isFinite(d)) return false
  return d >= 0 || -d <= DEPTH_SHRINK_MAX * -w
}

export function outcomeOf(population: RecheckPopulation, verdict: Verdict, whole: Verdict | null): CheckOutcome {
  const sidesOk = !!verdict.baseline && verdict.value.n >= CHECK_MIN_VIDEOS && verdict.baseline.n >= CHECK_MIN_VIDEOS
  if (!sidesOk || verdict.state === 'too_little_data' || verdict.state === 'baseline_forming' || verdict.state === 'refused') return 'too_few'
  if (verdict.state === 'moved') return 'moved'
  if (population === 'dense20' && followsDepth(verdict, whole)) return 'follows_depth'
  return 'no_clear_change'
}

/** Only a same-searches "moved" may print as moved (plan WP2.3). */
export const mayPrintMoved = (row: Pick<CheckRow, 'population' | 'outcome'>): boolean =>
  row.population === 'same_searches_clean' && row.outcome === 'moved'

/** A comparability_checks row as the script inserts it. */
export interface CheckRow {
  client_id: string
  prev_month: string
  month: string
  population: RecheckPopulation
  object_kind: CheckObjectKind
  object_id: string
  k_prev: number
  n_prev: number
  k_curr: number
  n_curr: number
  population_makers: number | null
  population_noise: number | null
  verdict: Verdict
  outcome: CheckOutcome
  read_through_run: string | null
  method_version: string
}

const nextMonth = (m: string): string => {
  const d = new Date(`${m.slice(0, 7)}-01T00:00:00Z`)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10)
}

function verdictOf(object: CheckObject, prevMonth: string, month: string, prev: Counted, curr: Counted): Verdict {
  const kind: ObjectKind = object.kind
  return bandVerdict({
    objectKind: kind, objectId: object.id, objectLabel: object.label,
    audience: object.kind === 'theme' ? CATEGORY_AUDIENCE : 'market',
    window: { kind: 'month', from: month, to: nextMonth(month) },
    basis: { from: prevMonth, to: month },
    value: curr, baseline: prev, floor: SHARE_BAND,
  })
}

export interface RecheckInput {
  clientId: string
  prevMonth: string
  month: string
  objects: readonly CheckObject[]
  /** lens_readings over the whole market, each month (follows_depth's reference). */
  whole: { prev: readonly LensRow[]; curr: readonly LensRow[] }
  populations: readonly {
    sets: { prev: PopulationSet; curr: PopulationSet }
    lens: { prev: readonly LensRow[]; curr: readonly LensRow[] }
  }[]
  readThroughRun: string | null
  methodVersion?: string
}

/** Every object's row in every population, in a fixed order. */
export function recheckRows(input: RecheckInput): CheckRow[] {
  const out: CheckRow[] = []
  for (const p of input.populations) {
    const population = p.sets.curr.population
    const shares = populationShares(p.sets.prev, p.sets.curr)
    for (const object of input.objects) {
      const prev = pooledCount(p.lens.prev, object)
      const curr = pooledCount(p.lens.curr, object)
      const verdict = verdictOf(object, input.prevMonth, input.month, prev, curr)
      const whole = population === 'dense20'
        ? verdictOf(object, input.prevMonth, input.month, pooledCount(input.whole.prev, object), pooledCount(input.whole.curr, object))
        : null
      out.push({
        client_id: input.clientId, prev_month: input.prevMonth, month: input.month, population,
        object_kind: object.kind, object_id: object.id,
        k_prev: prev.k, n_prev: prev.n, k_curr: curr.k, n_curr: curr.n,
        population_makers: shares?.makers ?? null, population_noise: shares?.noise ?? null,
        verdict, outcome: outcomeOf(population, verdict, whole),
        read_through_run: input.readThroughRun, method_version: input.methodVersion ?? RECHECK_METHOD_VERSION,
      })
    }
  }
  return out
}

/** Is a held row the same reading as a planned one? (A recompute that changes
 *  nothing writes nothing; the newest computed_at wins otherwise.) */
export function sameCheck(held: Pick<CheckRow, 'k_prev' | 'n_prev' | 'k_curr' | 'n_curr' | 'outcome' | 'read_through_run' | 'method_version' | 'population_makers' | 'population_noise'>, row: CheckRow): boolean {
  const num = (x: unknown) => (x == null ? null : Number(x))
  return held.k_prev === row.k_prev && held.n_prev === row.n_prev && held.k_curr === row.k_curr && held.n_curr === row.n_curr
    && held.outcome === row.outcome && held.read_through_run === row.read_through_run && held.method_version === row.method_version
    && num(held.population_makers) === row.population_makers && num(held.population_noise) === row.population_noise
}
