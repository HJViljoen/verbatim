import { activeCommunities } from '../reading/comparability'
import type { ConfigChange } from '../config-log'

// What we searched, and which of a month's videos only our own changes brought
// in (market-first decision D, plan WP1.4; the measure behind
// scripts/log-tracking-eras.ts and scripts/measure-comparability.ts).
//
// A SEARCH is one (platform, term) pair a gather ran; a community harvest is the
// term `r/<name>` on Reddit (lib/gather/subreddits.ts subredditLabel). The term
// set of each gather is exact: `keyword_performance` has one row per (run,
// platform, term), and a gather's time is its first row's (GC F28:
// `pipeline_runs.started_at` is re-stamped on resume).
//
// SEARCH-OUTSIDE (plan §4.2 PairRow.searchOutside): a video is OUTSIDE a pair of
// months when no search that ran unchanged through both months surfaced it. "Ran
// unchanged" means it ran in every COMPLETED gather from the first day of the
// earlier month to the pair's read-through gather. A gather that ended partial
// or failed (a spending cap, an outage) may have skipped searches our
// configuration still held: that is gather health's to report (`gatherHealth`,
// the pair row's `gather`), not a change of ours, so it does not decide what
// ran unchanged. A span holding no completed gather falls back to all of its
// gathers. "Surfaced" is any evidence we hold:
// its first-found terms (video_provenance), every snapshot of source_keywords,
// the current source_keywords and every gate verdict's keyword. So a video first
// found by a removed term that resurfaced under an unchanged one counts as
// inside. A video with no evidence at all is outside: nothing shows an unchanged
// search found it.
//
// A CHANGE'S REACH (config_change_reach): the month's videos surfaced ONLY by
// terms that change added or removed. The 13 Sep change's reach in September is
// the videos found by its four terms and nothing else (CQ F27 counts 187 by last
// surfacing).
//
// PURE.

/** Terms are compared trimmed and lowercased: a community is stamped with the
 *  name as configured (`r/Backpacks` and `r/backpacks` are one search). */
export const normTerm = (t: string): string => t.trim().toLowerCase()
export const searchKey = (platform: string, term: string): string => `${platform}\u0000${normTerm(term)}`

export interface KeywordRow { run_id: string; platform: string; keyword: string; created_at: string }
export interface RunRow { id: string; status: string | null; config_snapshot?: unknown }

export interface GatherRun {
  runId: string
  /** The first keyword_performance row's time. */
  at: string
  status: string | null
  /** (platform, term) keys the gather ran. */
  searches: ReadonlySet<string>
  /** The terms, any platform. */
  terms: ReadonlySet<string>
  /** (platform, term) keys the run's config_snapshot planned, or null when it has none (before 15 Sep). */
  planned: ReadonlySet<string> | null
}

const ms = (iso: string): number => Date.parse(iso)

/** The search plan a run's config_snapshot implies: every term on every
 *  platform, and each active community on Reddit when the run harvested any
 *  community at all (the harvest is behind a flag, lib/gather/gather.ts). */
export function plannedSearches(snapshot: unknown, harvested: boolean): Set<string> | null {
  if (!snapshot || typeof snapshot !== 'object') return null
  const s = snapshot as Record<string, unknown>
  const list = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => `${x}`.trim()).filter(Boolean) : [])
  const platforms = list(s.platforms)
  if (platforms.length === 0) return null
  const terms = [...new Set([...list(s.brand_keywords), ...list(s.competitor_keywords), ...list(s.industry_keywords)])]
  const out = new Set<string>()
  for (const p of platforms) for (const t of terms) out.add(searchKey(p, t))
  if (harvested && platforms.includes('reddit')) {
    for (const name of activeCommunities(s.subreddits) ?? []) out.add(searchKey('reddit', `r/${name}`))
  }
  return out
}

/** Every gather, oldest first, from keyword_performance and the runs. */
export function gathersOf(rows: readonly KeywordRow[], runs: readonly RunRow[]): GatherRun[] {
  const runById = new Map(runs.map((r) => [r.id, r]))
  const by = new Map<string, { at: string; searches: Set<string>; terms: Set<string> }>()
  for (const r of rows) {
    if (!r.run_id || Number.isNaN(ms(r.created_at))) continue
    const g = by.get(r.run_id) ?? { at: r.created_at, searches: new Set<string>(), terms: new Set<string>() }
    if (ms(r.created_at) < ms(g.at)) g.at = r.created_at
    g.searches.add(searchKey(r.platform, r.keyword))
    g.terms.add(normTerm(r.keyword))
    by.set(r.run_id, g)
  }
  return [...by.entries()]
    .map(([runId, g]) => {
      const run = runById.get(runId)
      const harvested = [...g.terms].some((t) => t.startsWith('r/'))
      return { runId, at: g.at, status: run?.status ?? null, searches: g.searches, terms: g.terms, planned: plannedSearches(run?.config_snapshot, harvested) }
    })
    .sort((a, b) => ms(a.at) - ms(b.at))
}

const fellShort = (g: GatherRun): boolean => g.status === 'partial' || g.status === 'failed'

/** The gathers from `from` (inclusive) through the gather `throughRunId` that
 *  decide what ran unchanged: the completed ones (a run whose row is unknown
 *  counts as completed), or every gather in the span when none completed.
 *  `left` names the partial or failed ones left out. */
export function decidingGathers(gathers: readonly GatherRun[], from: string, throughRunId: string): { deciding: GatherRun[]; left: GatherRun[] } {
  const through = gathers.find((g) => g.runId === throughRunId)
  if (!through) return { deciding: [], left: [] }
  const span = gathers.filter((g) => ms(g.at) >= ms(from) && ms(g.at) <= ms(through.at))
  const complete = span.filter((g) => !fellShort(g))
  return complete.length > 0 ? { deciding: complete, left: span.filter(fellShort) } : { deciding: span, left: [] }
}

/** The searches that ran in every deciding gather (`decidingGathers`) from
 *  `from` through the gather `throughRunId`. Empty when no gather falls in the
 *  span. */
export function unchangedSearches(gathers: readonly GatherRun[], from: string, throughRunId: string): Set<string> {
  const { deciding } = decidingGathers(gathers, from, throughRunId)
  if (deciding.length === 0) return new Set()
  const out = new Set(deciding[0].searches)
  for (const g of deciding.slice(1)) for (const s of [...out]) if (!g.searches.has(s)) out.delete(s)
  return out
}

/** When each term was first searched (any platform), for "only terms first
 *  searched on or after 13 Sep". */
export function firstSearched(gathers: readonly GatherRun[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const g of gathers) for (const t of g.terms) if (!out.has(t)) out.set(t, g.at)
  return out
}

// ---- WP1.8's one figure: the month's videos found only by searches added in it ----------
//
// "{about half} of September came from searches we added in September (356 of
// 654 …)" (the judge's ruling, 26 Sep; plan WP1.7, WP1.8). A month's video
// counts when its search evidence (`evidenceTerms`: first-found terms and
// communities, source_keywords now and in every snapshot, every gate verdict's
// keyword) is non-empty and made up ONLY of searches first run inside that
// month. A search is a term, or a community written `r/<name>`; its first run
// is its earliest gather on any platform (`firstSearched`). The change log is
// not the source: on 9 Sep it only flips r/backpacks from candidate to active,
// though it has run since 17 Aug, and it logs r/onebag only as a candidate,
// though it first ran on 9 Sep. A video any older search also surfaced is left
// out, whether that search still runs or was removed on 9 Sep. A video with no
// evidence, or whose provenance is 'ambiguous' (the gather that first stored it
// searched none of its evidence, so some other search found it), stays in the
// base and is never counted. Makers and off-topic videos stay in both.
//
// The base is the month's market (`market_month_videos`: the size headline's
// n). The strict search-outside count (`isOutside`) is decision D's rule 2 and
// nothing else: it also holds the videos only the searches removed on 9 Sep
// found, so it is never printed as "came from searches we added".

/** The searches first run inside `month` (any `YYYY-MM…`): on or after its
 *  first day and before the next month's, normalised as `firstSearched` keys
 *  them. */
export function searchesFirstRunIn(first: ReadonlyMap<string, string>, month: string): Set<string> {
  const lo = ms(`${month.slice(0, 7)}-01T00:00:00Z`)
  const d = new Date(lo)
  const hi = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)
  const out = new Set<string>()
  for (const [t, at] of first) {
    const x = ms(at)
    if (x >= lo && x < hi) out.add(t)
  }
  return out
}

/** Was this video found only by searches added in the month? Never where it
 *  has no evidence, and never where its provenance is 'ambiguous'. */
export function isAddedOnly(evidence: ReadonlySet<string> | undefined, added: ReadonlySet<string>, provenanceMethod?: string | null): boolean {
  if (provenanceMethod === 'ambiguous') return false
  if (!evidence || evidence.size === 0) return false
  for (const t of evidence) if (!added.has(t)) return false
  return true
}

/** How many of a month's videos were found only by searches added in it, of
 *  all of them (`n` is the base: every video passed, counted or not). */
export function addedOnlyOf(
  videos: readonly Pick<MonthVideo, 'id'>[],
  evidence: ReadonlyMap<string, ReadonlySet<string>>,
  added: ReadonlySet<string>,
  methodOf: (videoId: string) => string | null | undefined,
): { k: number; n: number } {
  let k = 0
  for (const v of videos) if (isAddedOnly(evidence.get(v.id), added, methodOf(v.id))) k++
  return { k, n: videos.length }
}

/** The fractions a share of the month is said as, nearest first. */
const MONTH_SHARE_LADDER: readonly (readonly [number, string])[] = [
  [1 / 10, 'about a tenth'], [1 / 5, 'about a fifth'], [1 / 4, 'about a quarter'], [1 / 3, 'about a third'],
  [2 / 5, 'about two fifths'], [1 / 2, 'about half'], [3 / 5, 'about three fifths'], [2 / 3, 'about two thirds'],
  [3 / 4, 'about three quarters'], [4 / 5, 'about four fifths'], [9 / 10, 'about nine tenths'],
]

/**
 * A share of the month in the words a reader would say, for "{about half} of
 * September came from searches we added in September": the nearest fraction
 * on a fixed ladder (a tenth, a fifth, a quarter, a third, two fifths, half,
 * three fifths, two thirds, three quarters, four fifths, nine tenths), "under
 * a tenth" below 5%, "almost all" from 95%, "none" at 0 and "all" at n. Never
 * hard-coded in copy: staging's 356 of 654 (54.4%) is "about half", and a
 * production figure outside 45% to 55% gets another word. Null on no base.
 */
export function monthShareWord(k: number, n: number): string | null {
  if (!Number.isInteger(k) || !Number.isInteger(n) || n <= 0 || k < 0 || k > n) return null
  if (k === 0) return 'none'
  if (k === n) return 'all'
  const s = k / n
  if (s < 0.05) return 'under a tenth'
  if (s >= 0.95) return 'almost all'
  let best = MONTH_SHARE_LADDER[0]
  for (const step of MONTH_SHARE_LADDER) if (Math.abs(s - step[0]) < Math.abs(s - best[0])) best = step
  return best[1]
}

/** Everything that shows which searches surfaced a video. */
export function evidenceTerms(parts: readonly (readonly (string | null | undefined)[] | null | undefined)[]): Set<string> {
  const out = new Set<string>()
  for (const part of parts) for (const t of part ?? []) {
    const s = normTerm(t ?? '')
    if (s) out.add(s)
  }
  return out
}

export interface MonthVideo {
  id: string
  platform: string
  /** month_denominators' audience string: 'industry-other' or 'competitor:<name>' (the client arm is not in the market). */
  audience: string
  /** Comments dated in the month. */
  dated: number
}

export const CATEGORY_AUDIENCE = 'industry-other'

/** Is a video outside the unchanged searches? */
export function isOutside(v: Pick<MonthVideo, 'platform'>, evidence: ReadonlySet<string> | undefined, unchanged: ReadonlySet<string>): boolean {
  for (const t of evidence ?? []) if (unchanged.has(searchKey(v.platform, t))) return false
  return true
}

/** A search change's added and removed terms, from its config_changes rows.
 *  Three shapes reach the log (GC F2): the trigger's whole arrays before and
 *  after; the reconstruction's one term a row, one side null; the 13 Sep hand
 *  SQL's added list with a null before. Exclusions are not searches and are
 *  skipped. Communities are read through
 *  `activeCommunities` (only an ACTIVE community is searched) as `r/<name>`. */
export function termDelta(rows: readonly (Pick<ConfigChange, 'surface' | 'before' | 'after'> & { field?: string | null })[]): { added: Set<string>; removed: Set<string> } {
  const added = new Set<string>()
  const removed = new Set<string>()
  const list = (v: unknown): string[] =>
    v == null ? [] : Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean)
      : typeof v === 'string' ? [v.trim()].filter(Boolean) : []
  const norm = (xs: string[]): string[] => xs.map(normTerm).filter(Boolean)
  for (const r of rows) {
    let before: string[]
    let after: string[]
    if (r.surface === 'subreddits') {
      before = norm([...(activeCommunities(r.before) ?? [])].map((n) => `r/${n}`))
      after = norm([...(activeCommunities(r.after) ?? [])].map((n) => `r/${n}`))
    } else if (r.surface === 'terms' && r.field !== 'exclude_terms') {
      // `exclude_terms` is on the terms surface, but an exclusion is not a
      // search: it names the wrong senses of a name for the relevance check.
      before = norm(list(r.before))
      after = norm(list(r.after))
    } else continue
    const b = new Set(before)
    const a = new Set(after)
    for (const t of a) if (!b.has(t)) added.add(t)
    for (const t of b) if (!a.has(t)) removed.add(t)
  }
  // A term the group both removed and added (two rows of one swap) moved nothing.
  for (const t of [...added]) if (removed.has(t)) { added.delete(t); removed.delete(t) }
  return { added, removed }
}

/** The month's videos surfaced only by terms the change moved (`evidence` as
 *  `evidenceTerms` builds it, normalised). */
export function reachOf(
  delta: { added: ReadonlySet<string>; removed: ReadonlySet<string> },
  videos: readonly MonthVideo[],
  evidence: ReadonlyMap<string, ReadonlySet<string>>,
): MonthVideo[] {
  const moved = new Set([...delta.added, ...delta.removed])
  if (moved.size === 0) return []
  return videos.filter((v) => {
    const e = evidence.get(v.id)
    if (!e || e.size === 0) return false
    for (const t of e) if (!moved.has(t)) return false
    return true
  })
}

/** Split a month's videos into the market (all of them) and the category. */
export function populations(videos: readonly MonthVideo[]): { market: MonthVideo[]; category: MonthVideo[] } {
  return { market: [...videos], category: videos.filter((v) => v.audience === CATEGORY_AUDIENCE) }
}

/** The median, or null on nothing (percentile_cont(0.5), as market_month_depth). */
export function median(xs: readonly number[]): number | null {
  const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  if (s.length === 0) return null
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** Gather health for one month: the gathers run in it, how many ended partial or
 *  failed, and how many planned searches they did not run (per the run's
 *  config_snapshot; a run without one counts no shortfall and is named by the
 *  caller). */
export function gatherHealth(gathers: readonly GatherRun[], month: string): { month: string; runs: number; partial: number; searches_short: number; unplanned: number } {
  const start = ms(`${month.slice(0, 7)}-01T00:00:00Z`)
  const d = new Date(start)
  const end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)
  const inMonth = gathers.filter((g) => ms(g.at) >= start && ms(g.at) < end)
  let short = 0
  let unplanned = 0
  for (const g of inMonth) {
    if (!g.planned) { unplanned++; continue }
    for (const s of g.planned) if (!g.searches.has(s)) short++
  }
  return {
    month: `${month.slice(0, 7)}-01`,
    runs: inMonth.length,
    partial: inMonth.filter((g) => g.status === 'partial' || g.status === 'failed').length,
    searches_short: short,
    unplanned,
  }
}

/** One `config_change_reach` row as a script plans it (before the client id
 *  and the method are added). */
export interface ReachRowPlan {
  change_id: string
  /** `YYYY-MM-01`. */
  month: string
  population: 'market' | 'category'
  videos_touched: number
  videos_in_month: number
  read_through_run: string | null
}

/**
 * One reach row per (change, month, population), the key a batch must not
 * repeat. Two adjacent pairs share a month: (Jul, Aug) and (Aug, Sep) both
 * measure August. A change dated late in September (the gate fix and
 * attribution v3, dated at the fix deploy) falls inside BOTH spans, because a
 * span runs to its later month's freeze line and August's is 1 Oct. So the
 * pair loop plans August's reach for that change twice. Inserted in one
 * statement, the two copies share `computed_at` (one now() per statement), the
 * primary key's last column, and the insert fails on the key.
 *
 * The copies read the same month set, so they are identical when read through
 * the same update. Where they are not, the copy read through the LATER update
 * wins (`finishedAt` names each update's finish; an unknown one sorts first).
 * Otherwise the first copy is kept, in the order planned.
 */
export function oneReachRowEach<T extends ReachRowPlan>(
  rows: readonly T[],
  finishedAt: (runId: string | null) => string | null,
): T[] {
  const at = (r: T): number => {
    const t = ms(finishedAt(r.read_through_run) ?? '')
    return Number.isNaN(t) ? -Infinity : t
  }
  const index = new Map<string, number>()
  const out: T[] = []
  for (const r of rows) {
    const key = `${r.change_id}|${r.month.slice(0, 10)}|${r.population}`
    const i = index.get(key)
    if (i === undefined) {
      index.set(key, out.length)
      out.push(r)
    } else if (at(r) > at(out[i])) {
      out[i] = r
    }
  }
  return out
}

/** A JSON value with every object's keys in one order, arrays as they are. */
function canonicalJson(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonicalJson)
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return Object.fromEntries(Object.keys(o).sort().map((k) => [k, canonicalJson(o[k])]))
  }
  return v
}

/**
 * Do two JSON values hold the same thing, whatever order their object keys
 * came in? A jsonb column hands keys back in its own order (shorter keys
 * first: `curr`, `prev`, `surface`, `change_id`, `population`), never the
 * order they were written in, so `JSON.stringify` of a row read back never
 * equalled the row about to be written, and measure-comparability re-inserted
 * both pair rows on every same-state `--apply` (the 26 Sep staging MF1
 * rehearsal). Array order still counts.
 */
export function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonicalJson(a)) === JSON.stringify(canonicalJson(b))
}
