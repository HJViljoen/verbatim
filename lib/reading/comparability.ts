import type { ConfigChange } from '../config-log'
import { subredditKey } from '../gather/subreddits'
import { monthStartOf, nextMonth, prevMonth } from './month-key'
import { freezeBoundary, monthEndInstant } from './monthly'
import type { MonthState } from './reading-month'
import type { Counted } from './verdicts'

// Comparability v1: our own changes refuse a comparison (market-first
// decision D, plan §4.2, WP1.3).
//
// WHAT THIS IS FOR. The one change the product printed in September was
// mostly us: 206 of September's 625 category videos came only from search
// terms added on 13–17 Sep, and 48% of August's comments were captured by
// September's runs (GC F7–F8). A banded "moved" over those two months is a
// statement about our search set. Two months are compared only when they were
// read the same way:
//   - the newer month has ended and was read past its end;
//   - under 10% of either month's videos came from searches that did not run
//     unchanged through both months;
//   - no change of ours touched 10% or more of either month;
//   - the newer month's threads have filled to four fifths of the older's.
// From 1% to 9% the verdict prints with a note. A change we have not measured
// yet counts as 10%.
//
// WHICH VIEW. The market pools the category with the videos filed under a
// tracked brand (decision E), so re-filing a video between a brand and the
// category does not move the market's own figures, but it does move themes
// (grouped per audience) and brands. Each change names the views it can move;
// a pair is judged for one view.
//
// PURE. The measured inputs come from MF1's `month_pair_comparability` (WP1.4,
// `measure-comparability`), read by the loader; absence reads as "unmeasured",
// never as "no change".

export const COMPARE_REFUSE_SHARE = 0.10
export const COMPARE_FLAG_SHARE = 0.01
/** The newer month's median dated comments a video ÷ the older month's. */
export const DEPTH_RATIO_MIN = 0.8

export const COMPARABILITY_VIEWS = ['market', 'themes', 'brands', 'lens'] as const
export type ComparabilityView = (typeof COMPARABILITY_VIEWS)[number]
export type ComparabilityMode = 'comparable' | 'flag' | 'refuse'

/** The `config_changes.surface` values that are changes of ours. Three of them
 *  (`segment`, `gate_rule`, `attribution`) join `CONFIG_SURFACES` with MF1
 *  (WP1.4); they are here first so a row carrying one is read correctly the
 *  day it appears. */
export const OUR_CHANGE_SURFACES = [
  'terms', 'platforms', 'knobs', 'subreddits', 'other', 'gate_rule', 'regate', 'prompt_version',
  'rivals', 'handles', 'rival_rename', 'entity_retag', 'attribution', 'segment',
] as const
export type OurChangeSurface = (typeof OUR_CHANGE_SURFACES)[number]

const ALL_VIEWS: readonly ComparabilityView[] = COMPARABILITY_VIEWS
const FILING_VIEWS: readonly ComparabilityView[] = ['themes', 'brands']

/**
 * The views each surface can move, mapped explicitly (plan §4.2):
 *   terms (incl. exclude_terms), platforms, knobs, subreddits, other,
 *   gate_rule, regate, prompt_version → every view. (subreddits only when the
 *   set of ACTIVE communities moved, and other not for an attention-panel
 *   freeze, which moves none; see `changesFromLog`.)
 *   rivals, handles, rival_rename, entity_retag, attribution → themes and
 *   brands: re-filing a video does not move the pooled market (decision E),
 *   and themes are grouped per audience, so they do move.
 *   segment → nothing: lens rows compare only at an equal rule_version.
 */
export const VIEWS_BY_SURFACE: Readonly<Record<OurChangeSurface, readonly ComparabilityView[]>> = {
  terms: ALL_VIEWS,
  platforms: ALL_VIEWS,
  knobs: ALL_VIEWS,
  subreddits: ALL_VIEWS,
  other: ALL_VIEWS,
  gate_rule: ALL_VIEWS,
  regate: ALL_VIEWS,
  prompt_version: ALL_VIEWS,
  rivals: FILING_VIEWS,
  handles: FILING_VIEWS,
  rival_rename: FILING_VIEWS,
  entity_retag: FILING_VIEWS,
  attribution: FILING_VIEWS,
  segment: [],
}

/** Logged surfaces that are not a change of ours at all: which day the report
 *  goes out, whether a schedule is active, which subjects are followed. They
 *  move nothing a month is read from (`TRACKING_SURFACES`, lib/config-log.ts). */
export const NOT_OUR_CHANGES: readonly string[] = ['cadence', 'schedule', 'subjects']

/** The `other` field an attention-panel freeze is logged on (`freezePanel`,
 *  lib/reading/attention.ts). The pipeline's freeze-months step writes one on a
 *  tenant's first freeze (Sealand's: the 4 Oct run, cutoff 1 Jul) and on every
 *  re-freeze after a tracking change. A panel moves only the attention figures,
 *  and those are compared only inside one panel era (`samePanelEra`); it moves
 *  nothing the market, themes, brands or lens views read. So its change is
 *  kept, moving no view, as `segment` is. Every other `other` row stays a
 *  change of every view. (A departure from §4.2's "other → every view", for
 *  Heinrich's ruling: without it the first freeze falls inside October against
 *  November and refuses the first pair read the same way, §2.11.) */
export const PANEL_FREEZE_FIELD = 'attention_panel'

const isPanelFreeze = (r: Pick<ConfigChange, 'surface' | 'field'>): boolean =>
  r.surface === 'other' && r.field === PANEL_FREEZE_FIELD

/** Surfaces that change WHAT WE SEARCH. Their reach is the pair row's
 *  search-outside count ("not surfaced by a search that ran unchanged through
 *  both months"), so they need no per-change measure of their own. Every other
 *  surface does, and without one it counts as 10%. */
export const SEARCH_SURFACES: readonly OurChangeSurface[] = ['terms', 'platforms', 'subreddits']

/** Rows of one change arrive within this of each other: the audit trigger
 *  writes one row per column in one UPDATE (the 17 Sep script: three `terms`
 *  rows at 16:02:56), the reconstruction wrote one row per term (the 9 Sep
 *  swap: fourteen at 18:17:56), and a community edit writes the trigger's row
 *  and its own logged row a few milliseconds apart. */
export const CHANGE_GROUP_WINDOW_MS = 60_000

export interface OurChange {
  /** The change id: the first of its rows, by `changed_at` then id. */
  id: string
  surface: OurChangeSurface
  changedAt: string
  note: string | null
  affects: readonly ComparabilityView[]
  /** Every `config_changes` id grouped under this change, `id` first. A
   *  measure keyed on any of them (`config_change_reach.change_id`) is this
   *  change's. Optional so a hand-built change needs only `id`. */
  rowIds?: readonly string[]
}

/** One row of `month_pair_comparability`; the newest `computedAt` wins. */
export interface PairRow {
  prevMonth: string
  month: string
  /** Videos NOT surfaced in the month by any search that ran unchanged through
   *  both months (a video first found by a removed term that resurfaces under
   *  an unchanged term counts as inside). */
  searchOutside: { prev: Counted; curr: Counted }
  /** Each change's reach in each month. `population` says which n the counts
   *  are over: the market's (the default) or the category's, which is the one
   *  a themes comparison divides by (themes are grouped within the category):
   *  the gate fix's 63 September videos are 9.6% of the market's 655 and 10.1%
   *  of the category's 626 (plan §2.11). */
  codeChanges: { changeId: string; surface: OurChangeSurface; prev: Counted; curr: Counted; population?: 'market' | 'category' }[]
  depth: { prevMedian: number | null; currMedian: number | null }
  /** Run health per month. */
  gather: { month: string; runs: number; partial: number; searchesShort: number }[]
  lateCapture: { month: string; comments: number; of: number } | null
  /** The latest run the row accounts for. */
  readThroughRun: string | null
  methodVersion: string
  computedAt: string
}

export type PairReason = 'incomplete' | 'not_read_to_end' | 'unmeasured' | 'searches' | 'code_change' | 'depth' | 'gather'

export interface PairComparability {
  prevMonth: string
  month: string
  mode: ComparabilityMode
  /** Every reason that flags or refuses, in rule order. `share` is the measured
   *  share for `searches` and `code_change` (null: not measured, which
   *  refuses), and the depth ratio for `depth`. */
  reasons: { kind: PairReason; changeId: string | null; share: number | null }[]
  row: PairRow | null
}

type Reason = PairComparability['reasons'][number]

// ---- The change log, as changes of ours ----------------------------------------------

const msOf = (iso: string): number => Date.parse(iso)

function isOurSurface(s: string): s is OurChangeSurface {
  return (OUR_CHANGE_SURFACES as readonly string[]).includes(s)
}

/** A search surface? */
export const isSearchSurface = (s: string): boolean => (SEARCH_SURFACES as readonly string[]).includes(s)

/** The views a surface can move. A surface this file does not know is read as
 *  `other` (every view): an unclassified change of ours refuses rather than
 *  passes. */
export const viewsForSurface = (s: string): readonly ComparabilityView[] => (isOurSurface(s) ? VIEWS_BY_SURFACE[s] : ALL_VIEWS)

/**
 * The communities one side of a `subreddits` row was searching, or null when
 * the side cannot be read. Three shapes reach the log:
 *   - the audit trigger's: the whole `tracking_configs.subreddits` array of
 *     entries, of which only `status: 'active'` ones are searched;
 *   - the reconstruction's: one `{ name, status }` entry, or null;
 *   - a community edit's logged row: the watched list in words,
 *     "r/backpacks, r/onebag" or "nothing" (`listWords`, lib/settings/save-state.ts),
 *     which drops names past eight ("… and 2 more"), and then cannot be read.
 */
export function activeCommunities(side: unknown): Set<string> | null {
  if (side == null) return new Set()
  const fold = (name: string): string => subredditKey(name) || name.trim().toLowerCase()
  if (Array.isArray(side)) {
    const out = new Set<string>()
    for (const e of side) {
      if (typeof e === 'string') out.add(fold(e))
      else if (e && typeof e === 'object' && typeof (e as { name?: unknown }).name === 'string') {
        if ((e as { status?: unknown }).status === 'active') out.add(fold((e as { name: string }).name))
      }
    }
    return out
  }
  if (typeof side === 'object' && typeof (side as { name?: unknown }).name === 'string') {
    return (side as { status?: unknown }).status === 'active' ? new Set([fold((side as { name: string }).name)]) : new Set()
  }
  if (typeof side === 'string') {
    const text = side.trim()
    if (text === '' || text === 'nothing') return new Set()
    if (/\band \d+ more$/.test(text)) return null
    return new Set(text.split(',').map((s) => fold(s)).filter(Boolean))
  }
  return null
}

/** Did this `subreddits` row change which communities are searched? A strike
 *  count or a discovery probe alone does not (discovery writes such a row
 *  almost weekly: 66 in four weeks, lib/reading/attention.ts). A side that
 *  cannot be read counts as a change: the refusal errs towards not comparing. */
export function movesActiveSet(row: Pick<ConfigChange, 'before' | 'after'>): boolean {
  const before = activeCommunities(row.before)
  const after = activeCommunities(row.after)
  if (before == null || after == null) return true
  if (before.size !== after.size) return true
  for (const name of before) if (!after.has(name)) return true
  return false
}

/**
 * The change log as changes of ours (full rows; `loadChanges` selects '*').
 *
 * `cadence`, `schedule` and `subjects` rows are dropped. Rows of ONE change are
 * grouped under its change id: rows on the same surface within
 * `CHANGE_GROUP_WINDOW_MS` of the group's first row. So the 9 Sep term swap
 * (fourteen reconstructed rows) is one change, as the 13 Sep (two) and 17 Sep
 * (three) term changes are, and a community edit's trigger row and its logged
 * row are one. A `subreddits` group that never moved the active set is
 * dropped. A row whose `changed_at` does not parse cannot be placed in any
 * span and is dropped. An attention-panel freeze (`PANEL_FREEZE_FIELD`) is
 * grouped apart from any other `other` row and moves no view.
 */
export function changesFromLog(rows: readonly ConfigChange[]): OurChange[] {
  const kept = rows
    .filter((r) => !NOT_OUR_CHANGES.includes(r.surface))
    .map((row) => ({ row, ms: msOf(row.changed_at) }))
    .filter((x) => !Number.isNaN(x.ms))
    .sort((a, b) => a.ms - b.ms || a.row.id.localeCompare(b.row.id))

  const groups: { startMs: number; rows: ConfigChange[] }[] = []
  const open = new Map<string, { startMs: number; rows: ConfigChange[] }>()
  for (const { row, ms } of kept) {
    const key = isPanelFreeze(row) ? `other/${PANEL_FREEZE_FIELD}` : row.surface
    const g = open.get(key)
    if (g && ms - g.startMs <= CHANGE_GROUP_WINDOW_MS) {
      g.rows.push(row)
      continue
    }
    const fresh = { startMs: ms, rows: [row] }
    groups.push(fresh)
    open.set(key, fresh)
  }

  const out: OurChange[] = []
  for (const g of groups) {
    const first = g.rows[0]
    const surface: OurChangeSurface = isOurSurface(first.surface) ? first.surface : 'other'
    if (surface === 'subreddits' && !g.rows.some(movesActiveSet)) continue
    out.push({
      id: first.id,
      surface,
      changedAt: first.changed_at,
      note: g.rows.map((r) => r.note?.trim()).find((n): n is string => !!n) ?? null,
      affects: isPanelFreeze(first) ? [] : VIEWS_BY_SURFACE[surface],
      rowIds: g.rows.map((r) => r.id),
    })
  }
  return out
}

// ---- Shares -----------------------------------------------------------------------------

/** k / n, or null when it is not a share: n not positive, anything not finite,
 *  k negative or over n. Null is "not measured", never zero. */
export function shareOf(side: Counted): number | null {
  const { k, n } = side
  if (!Number.isFinite(k) || !Number.isFinite(n) || n <= 0 || k < 0 || k > n) return null
  return k / n
}

/** The larger of a pair's two shares; null when either side is not a share. */
export function pairShare(prev: Counted, curr: Counted): number | null {
  const a = shareOf(prev)
  const b = shareOf(curr)
  return a == null || b == null ? null : Math.max(a, b)
}

/** What a measured share does to a pair. Null or NaN refuses: a change we have
 *  not measured counts as 10%. */
export function modeForShare(share: number | null): ComparabilityMode {
  if (share == null || !Number.isFinite(share) || share >= COMPARE_REFUSE_SHARE) return 'refuse'
  return share >= COMPARE_FLAG_SHARE ? 'flag' : 'comparable'
}

/** Can this change have moved either month of the pair? From the first day of
 *  the earlier month up to the later month's freeze line: after that neither
 *  month's rows are ever rewritten. A date that does not parse is in span. */
export function changeInSpan(change: Pick<OurChange, 'changedAt'>, prevMonth: string, month: string): boolean {
  const t = msOf(change.changedAt)
  if (Number.isNaN(t)) return true
  return t >= msOf(`${monthStartOf(prevMonth)}T00:00:00.000Z`) && t < msOf(freezeBoundary(monthStartOf(month)))
}

const idsOf = (c: OurChange): readonly string[] => c.rowIds && c.rowIds.length > 0 ? c.rowIds : [c.id]

type CodeEntry = PairRow['codeChanges'][number]

/** The entry a view divides by: the category's population for themes, the
 *  market's for the rest; the other one when that is all there is. */
function entryForView(entries: readonly CodeEntry[], view: ComparabilityView): CodeEntry | null {
  const want = view === 'themes' ? 'category' : 'market'
  return entries.find((e) => (e.population ?? 'market') === want) ?? entries[0] ?? null
}

/** A stored month ('YYYY-MM-DD', or an instant) as a month start; null when
 *  it is not a date, so a malformed row matches no pair. */
function safeMonth(s: string | null | undefined): string | null {
  if (typeof s !== 'string') return null
  try {
    return monthStartOf(s)
  } catch {
    return null
  }
}

const validN = (n: number): boolean => Number.isFinite(n) && n > 0

/** The newest version of a pair's row (`computedAt`), or null. */
export function latestPairRow(rows: readonly PairRow[], prevMonth: string, month: string): PairRow | null {
  const pm = monthStartOf(prevMonth)
  const m = monthStartOf(month)
  let best: PairRow | null = null
  for (const r of rows) {
    if (safeMonth(r.prevMonth) !== pm || safeMonth(r.month) !== m) continue
    if (best == null || msOf(r.computedAt) > msOf(best.computedAt)) best = r
  }
  return best
}

// ---- The rule -----------------------------------------------------------------------------

/**
 * May `prevMonth` and `month` be compared, for this view?
 *
 * In order:
 * 1. the later month is so far → refuse `incomplete`: a so-far month is never
 *    compared.
 * 2. it has not been read past its end → refuse `not_read_to_end` (Össur's
 *    September, read to 13 Sep).
 * 3. no row, a row for another pair, a row that does not account for the later
 *    month's latest update, or a month side with n = 0 → refuse `unmeasured`,
 *    ALSO listing every in-span change that can move this view, so the words
 *    can name the real cause.
 * 4. shares: searches = the larger of the two months' search-outside shares;
 *    each in-span change that can move the view = the larger of its two
 *    shares. A change that is not a search change and has no measure counts as
 *    10%. Any ≥ 10% refuses; any ≥ 1% flags.
 * 5. depth: the later month's median dated comments a video under four fifths
 *    of the earlier's → refuse `depth` (August 23, September 15: 0.65).
 * 6. a partial run or a searches shortfall in either month → flag `gather`.
 * 7. else comparable. NaN never passes: a share or a median that is not a
 *    number refuses, and run health that is not a number flags.
 */
export function comparabilityOf(prevMonth: string, month: string, input: {
  row: PairRow | null
  changes: readonly OurChange[]
  view: ComparabilityView
  later: { state: MonthState; readToEnd: boolean; latestUpdateRunId: string | null }
}): PairComparability {
  const pm = monthStartOf(prevMonth)
  const m = monthStartOf(month)
  const answer = (reasons: Reason[]): PairComparability => ({
    prevMonth: pm,
    month: m,
    mode: reasons.some(refuses) ? 'refuse' : reasons.length > 0 ? 'flag' : 'comparable',
    reasons,
    row: input.row,
  })
  const bare = (kind: PairReason): Reason => ({ kind, changeId: null, share: null })

  if (!(pm < m)) return answer([bare('unmeasured')])
  if (input.later.state === 'so_far') return answer([bare('incomplete')])
  if (!input.later.readToEnd) return answer([bare('not_read_to_end')])

  const view = input.view
  const inSpan = input.changes
    .filter((c) => c.affects.includes(view) && changeInSpan(c, pm, m))
    .sort((a, b) => msOf(a.changedAt) - msOf(b.changedAt))

  const row = input.row
  const measured = row != null
    && safeMonth(row.prevMonth) === pm
    && safeMonth(row.month) === m
    && row.readThroughRun != null
    && row.readThroughRun === input.later.latestUpdateRunId
    && validN(row.searchOutside.prev.n)
    && validN(row.searchOutside.curr.n)
  if (!row || !measured) {
    return answer([
      bare('unmeasured'),
      ...inSpan.map((c): Reason => ({ kind: isSearchSurface(c.surface) ? 'searches' : 'code_change', changeId: c.id, share: null })),
    ])
  }

  const reasons: Reason[] = []

  // 4a. What we search.
  const searchShare = pairShare(row.searchOutside.prev, row.searchOutside.curr)
  const latestSearch = inSpan.filter((c) => isSearchSurface(c.surface)).at(-1) ?? null
  if (searchShare == null || !(searchShare < COMPARE_FLAG_SHARE)) {
    reasons.push({ kind: 'searches', changeId: latestSearch?.id ?? null, share: searchShare })
  }

  // 4b. Every other change of ours, each on its own measure.
  const known = new Set(input.changes.flatMap(idsOf))
  const judge = (entry: CodeEntry | null, changeId: string, surface: string): void => {
    const search = isSearchSurface(surface)
    if (!entry) {
      if (!search) reasons.push({ kind: 'code_change', changeId, share: null })
      return
    }
    const share = pairShare(entry.prev, entry.curr)
    if (share == null || !(share < COMPARE_FLAG_SHARE)) {
      reasons.push({ kind: search ? 'searches' : 'code_change', changeId, share })
    }
  }
  for (const c of inSpan) {
    const ids = idsOf(c)
    judge(entryForView(row.codeChanges.filter((e) => ids.includes(e.changeId)), view), c.id, c.surface)
  }
  // A measure for a change the caller did not pass is judged by its own surface.
  const orphans = new Map<string, CodeEntry[]>()
  for (const e of row.codeChanges) {
    if (known.has(e.changeId) || !viewsForSurface(e.surface).includes(view)) continue
    orphans.set(e.changeId, [...(orphans.get(e.changeId) ?? []), e])
  }
  for (const [changeId, entries] of orphans) judge(entryForView(entries, view), changeId, entries[0].surface)

  // 5. Depth.
  const { prevMedian, currMedian } = row.depth
  const ratio = prevMedian != null && currMedian != null && Number.isFinite(prevMedian) && Number.isFinite(currMedian)
    && prevMedian > 0 && currMedian >= 0
    ? currMedian / prevMedian
    : null
  if (ratio == null || !(ratio >= DEPTH_RATIO_MIN)) reasons.push({ kind: 'depth', changeId: null, share: ratio })

  // 6. Run health.
  const sick = row.gather.some((g) => {
    const gm = safeMonth(g.month)
    return (gm === pm || gm === m) && !(g.partial === 0 && g.searchesShort === 0)
  })
  if (sick) reasons.push(bare('gather'))

  return answer(reasons)
}

/** Does this reason refuse the pair (rather than flag it)? */
function refuses(r: Reason): boolean {
  switch (r.kind) {
    case 'incomplete':
    case 'not_read_to_end':
    case 'unmeasured':
    case 'depth':
      return true
    case 'searches':
    case 'code_change':
      return modeForShare(r.share) === 'refuse'
    case 'gather':
      return false
  }
}

// ---- The next pair ------------------------------------------------------------------------

/**
 * The first pair of months that no change of ours (as logged so far) can have
 * moved, for this view: the earlier month starts after the latest change that
 * can move the view, and never before the pair being read (the reading month
 * against the month before it), so the answer is never a pair already behind
 * the page. A pair whose measured row already refuses on a share (searches, or
 * a change) is skipped for the one after it; depth never skips a pair, because
 * depth fills with time.
 *
 * `readingMonth` is the month the page reads (`readingMonthFor`). Without it,
 * the latest ended month (the one before `now`'s) stands in.
 *
 * It ASSUMES NOTHING FURTHER CHANGES, and says so (`assumes`): one edit to the
 * search set moves the answer on by a month.
 *
 * `sameAgeFrom` is when both months can first be read at the same age: the
 * first scheduled update after the later month ends. `inFullExpected` is when
 * the later month settles: the first scheduled update after its freeze line.
 * With no schedule handed in, each is the instant itself. Sealand on 24 Sep:
 * October against November, from the 6 Dec update, in full around the 3 Jan
 * update. On 4 Jan, with nothing changed since: November against December.
 */
export function nextComparablePair(
  now: string,
  changes: readonly OurChange[],
  rows: readonly PairRow[],
  opts: { view?: ComparabilityView; nextUpdateAfter?: (instant: string) => string | null; readingMonth?: string } = {},
): { prevMonth: string; month: string; sameAgeFrom: string; inFullExpected: string; assumes: 'no_further_change' } | null {
  const view = opts.view ?? 'market'
  const reading = opts.readingMonth ? monthStartOf(opts.readingMonth) : prevMonth(monthStartOf(now))
  const floor = prevMonth(reading)
  const times = changes
    .filter((c) => c.affects.includes(view))
    .map((c) => msOf(c.changedAt))
    .filter((t) => Number.isFinite(t))
  const afterChange = times.length > 0 ? nextMonth(monthStartOf(new Date(Math.max(...times)).toISOString())) : null
  let p = afterChange != null && afterChange > floor ? afterChange : floor

  for (let guard = 0; guard < 36; guard++) {
    const m = nextMonth(p)
    const row = latestPairRow(rows, p, m)
    if (row && measuredRefusal(row, view)) {
      p = m
      continue
    }
    const ended = monthEndInstant(m)
    const line = freezeBoundary(m)
    const after = opts.nextUpdateAfter
    return {
      prevMonth: p,
      month: m,
      sameAgeFrom: (after && after(ended)) || ended,
      inFullExpected: (after && after(line)) || line,
      assumes: 'no_further_change',
    }
  }
  return null
}

/** A measured share of 10% or more on the row, for this view. An unmeasured
 *  share does not skip a pair: it will be measured. */
function measuredRefusal(row: PairRow, view: ComparabilityView): boolean {
  const s = pairShare(row.searchOutside.prev, row.searchOutside.curr)
  if (s != null && s >= COMPARE_REFUSE_SHARE) return true
  const byChange = new Map<string, CodeEntry[]>()
  for (const e of row.codeChanges) {
    if (viewsForSurface(e.surface).includes(view)) byChange.set(e.changeId, [...(byChange.get(e.changeId) ?? []), e])
  }
  for (const entries of byChange.values()) {
    const entry = entryForView(entries, view)
    const share = entry ? pairShare(entry.prev, entry.curr) : null
    if (share != null && share >= COMPARE_REFUSE_SHARE) return true
  }
  return false
}
