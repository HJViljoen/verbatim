import { proportionDelta, SHARE_BAND, type BandOptions, type DeltaVerdict } from '../report-bands'

// The verdict contract — one shape for "did this move?", produced by
// everything and read by everything (Phase 1 WP3, design items 5 and 9).
//
// WHY A CONTRACT AND NOT A CONVENTION. Before this file the codebase held
// FIVE incompatible direction vocabularies, each with its own threshold and its
// own idea of what a denominator is: the band's
// moved/no_clear_change/too_little_data (lib/report-bands.ts, has an n),
// emerging/gaining/fading/steady (±1 on a 0–10 model score that is never shown,
// lib/voice-tiles.ts:119), moving_up/moving_down/flat/too_early (±1.0 share
// points and no n anywhere, lib/initiatives/measure.ts:156), "new this update /
// rising / fading / seen N updates running" (lib/reports/documents/merge.ts:164)
// and the anomaly check's flagged/…/baseline_forming. Two of them printed
// "Holding steady" for a theme that had vanished and "Up 5.3 points" on a single
// comment. A reader cannot calibrate five ladders, and a model handed any of
// them cannot be held to the one the product means.
//
// SO: every surface that says anything about movement produces a `Verdict`, and
// a `Verdict` carries the four things that make the claim checkable — the two
// sides' k and n, the change, the band it was compared against — beside the
// word. A tile that wants only the word still has to compute the rest.
//
// WHAT IS DELIBERATELY NOT IN HERE. The words themselves. `state` is a token,
// not copy: the sentence a reader sees is assigned in lib/calibration.ts and by
// the surface, because the same verdict reads differently on a chart, in an
// email and inside a model's prompt. And `direction` is NOT derived from
// `state` — a single banded comparison can never earn a direction word. It is
// filled in only by `directionWord` (lib/reading/bands.ts), which needs three
// consecutive readings inside one clustering regime and one name.

/**
 * What a comparison concluded.
 *
 * `moved` / `no_clear_change` / `too_little_data` are `DeltaState`, unchanged,
 * so the band's own three answers pass through untranslated. Two are new:
 *
 * `baseline_forming` — there is no comparison yet, because the side to compare
 *   against has not accumulated enough months to be one. Different from
 *   `too_little_data`, which is about THIS reading's thinness and can resolve
 *   next week; a forming baseline resolves on the calendar.
 *
 * `refused` — the comparison could be drawn and must not be. A rival was
 *   renamed, the clustering changed under it, the tenant re-tagged its corpus,
 *   or the window reaches back before anything was written down. The number
 *   exists; saying it moved would be a claim about the conversation that is
 *   really a claim about our own bookkeeping. `refusedReason` says which.
 */
export type VerdictState = 'moved' | 'no_clear_change' | 'too_little_data' | 'baseline_forming' | 'refused'

/** What a verdict can be about. A superset of `AnomalyObjectKind`, which is the
 *  four the pre-registered weekly set can hold; `audience` (a rival's or the
 *  category's share of the whole) and `mood` (a sentiment share) are read on the
 *  monthly series and are never pre-registered. */
export type ObjectKind = 'subject' | 'theme' | 'kind' | 'rival' | 'audience' | 'mood'

/** Why a comparison that could be drawn is not being drawn. Each one is a break
 *  in the record rather than a property of the conversation:
 *  `unlogged_era`       the window reaches back before the change log begins
 *  `tracking_change`    terms, rivals, handles or platforms moved inside it
 *  `clustering_changed` the two sides were grouped by different clusterings
 *  `rename`             the two sides are two names for one rival */
export type RefusedReason = 'unlogged_era' | 'tracking_change' | 'clustering_changed' | 'rename'

/** What a reader has to be told about a reading beside its verdict. `thin`,
 *  `new` and `gone_quiet` are about the object; `re_read`,
 *  `clustering_changed`, `clustering_unknown` and `renamed` are about what we
 *  did to the corpus underneath it. A flag never changes the verdict —
 *  `refusedReason` does that — it is printed alongside.
 *
 *  `clustering_changed` and `clustering_unknown` are two different facts and
 *  the vocabulary carries both, because on today's corpus the second one is on
 *  nearly every comparison there is: every month frozen before the fingerprint
 *  shipped has no key, two unknowns are deliberately not one regime
 *  (`sameRegime`), and saying "themes were re-grouped" about a pair nobody
 *  recorded a grouping for is a claim the record does not support. The series
 *  already keeps them apart (`ClusteringBoundary.kind`); a verdict now can
 *  too.
 *
 *  `measurement_changed` is the third of that second group and the widest: the
 *  two sides were produced by two different measurements of the same thing, so
 *  the number moved partly because we changed what it means. The one instance
 *  in production is `videos.sentiment`, which had two writers with two meanings
 *  until 20260820110000_sentiment_split.sql; when classify-meta moved before
 *  Pass A on 2026-08-16 the reorder ALONE read as "sentiment up 6.2 pts" in a
 *  subject line that was sent. Like the other flags it does not refuse the
 *  comparison — the counts are real on both sides — it tells the reader what
 *  else changed between them. */
export type VerdictFlag =
  | 'new'
  | 'gone_quiet'
  | 're_read'
  | 'clustering_changed'
  | 'clustering_unknown'
  | 'renamed'
  | 'thin'
  | 'measurement_changed'

/** The period a verdict is about. `since` is the tenant's whole readable
 *  history (lib/reading/horizon.ts `sinceStart`). Both bounds are half-open
 *  `[from, to)` instants or `YYYY-MM-DD` month starts, the same shape the SQL
 *  windows take. */
export interface VerdictWindow {
  kind: 'month' | 'quarter' | 'week' | 'since'
  from: string
  to: string
}

/** One counted side: k of n. Always DISTINCT videos over the same population as
 *  its denominator — the unit the bands were calibrated on and the only unit in
 *  which k/n is a proportion. */
export interface Counted {
  k: number
  n: number
}

/**
 * What a verdict's two sides actually count, where that is NOT the default the
 * line above states — distinct videos, over the audience the verdict names.
 *
 * TWO READINGS OF ONE OBJECT ARE TWO STATEMENTS. A rival is read twice in one
 * block: its cut of the panel's videos, and its cut of the panel's comments
 * (lib/reading/standings.ts — the attention verdict's proportion and its band
 * take their n from two different counts). Both carry the same objectKind, the
 * same objectId and the same audience and differ only in what they measure, so
 * anything keyed by the object alone keeps one of them and files it under the
 * other's denominator. `measure` is what makes them two rows.
 *
 * AND THE AUDIENCE IS NOT ALWAYS THE POPULATION. On a theme's verdict the
 * audience IS what n counts — the category's videos this month. On a standings
 * row the audience NAMES THE OBJECT (`competitor:Freitag`) while n is the whole
 * panel's, so a denominator derived from the audience string says "Freitag's
 * videos" about a share of everybody's. A verdict that knows better says so, in
 * the reader's own words, and a record stores what it says rather than deriving
 * it a second time.
 */
export interface CountedOver {
  /** The noun `value.k` and `value.n` are counted in. */
  measure: 'videos' | 'comments'
  /** What `value.n` is, in the reader's words — 'the panel’s comments this
   *  month'. */
  population: string
}

export interface Verdict {
  objectKind: ObjectKind
  /** Stable identity: `theme_registry.id`, a subject id, the kind's enum value,
   *  the rival's audience key. Never a label — labels churn ~88% run to run. */
  objectId: string
  /** What a reader is shown. Never used as a key. */
  objectLabel: string
  /** The audience the proportion is a proportion OF, as the literal bucket
   *  string (`client`, `competitor:<name>`, `industry-other`), or whatever
   *  pooled slice the caller named. */
  audience: string
  window: VerdictWindow
  /** The window this one was compared WITH — last month, the equal window
   *  before, the trailing three months. Absent when nothing was compared. */
  basis?: { from: string; to: string }
  value: Counted
  baseline?: Counted
  /** What the two sides count, where it is not distinct videos over `audience`.
   *  Absent is the default and means exactly that. */
  countedOver?: CountedOver
  /** Percentage points, one decimal; null when no comparison was drawn. */
  changePts: number | null
  /** Half-width of the no-change band, same units; null when none was drawn. */
  bandPts: number | null
  state: VerdictState
  /** Earned over three consecutive readings, never from one comparison. Absent
   *  or null means "no direction word is owed here", which is not the same as
   *  `flat` — flat is a reading, absent is a silence. */
  direction?: 'growing' | 'fading' | 'flat' | null
  flags: VerdictFlag[]
  refusedReason?: RefusedReason
}

/**
 * The figures a model may name, by token.
 *
 * The rule this type exists for (design item 9): a model explains, code rates.
 * Prose generated about a reading is handed figure KEYS — `{share_now}`,
 * `{videos_this_month}` — and never the numbers, so a model cannot round, drift
 * or invent one; the surface substitutes the value at render. `label` is what
 * the token prints as when it is substituted, so the unit and the noun are
 * decided here rather than in the sentence.
 */
export interface FigureTable {
  [token: string]: { value: number; unit: 'videos' | 'comments' | 'pts' | 'pct'; label: string }
}

const pct = (side: Counted): number => (side.n > 0 ? (side.k / side.n) * 100 : 0)

/** Does this verdict answer the question it was asked? `moved` and
 *  `no_clear_change` are answers; the other three are the product declining to
 *  give one, for three different reasons. */
export function isAnswer(state: VerdictState): boolean {
  return state === 'moved' || state === 'no_clear_change'
}

export interface BandVerdictInput {
  objectKind: ObjectKind
  objectId: string
  objectLabel: string
  audience: string
  window: VerdictWindow
  basis?: { from: string; to: string }
  value: Counted
  baseline?: Counted
  /** What the two sides count, where it is not distinct videos over `audience`
   *  — forwarded to the verdict unchanged. */
  countedOver?: CountedOver
  flags?: VerdictFlag[]
  /** The floor and band. `SHARE_BAND` — 100 videos a side, 10 of the object's
   *  own a side, never narrower than 2 points — unless a caller has a measured
   *  reason for another. */
  floor?: BandOptions
  /** Draw no comparison and say why. The band is not run: a refused verdict
   *  carries its counts so the levels can still be printed, and no change. */
  refused?: RefusedReason
}

/**
 * The one place a `Verdict` is built from two counted sides.
 *
 * It runs `proportionDelta` — the product's band since 2026-08-18, unpooled
 * 2×SE floored at 2 points — rather than re-deriving it, so a month-over-month
 * reading, a quarter and the anomaly check's week all answer with one rule and
 * a difference between two surfaces is a difference in their data.
 *
 * With no `baseline` there is nothing to compare and the verdict is the level
 * alone: `too_little_data` with a null change, which is the honest reading of a
 * first month and reads on screen as "what it is running at", not as "flat".
 */
export function bandVerdict(input: BandVerdictInput): Verdict {
  const flags = input.flags ?? []
  const base: Verdict = {
    objectKind: input.objectKind,
    objectId: input.objectId,
    objectLabel: input.objectLabel,
    audience: input.audience,
    window: input.window,
    ...(input.basis ? { basis: input.basis } : {}),
    value: input.value,
    ...(input.baseline ? { baseline: input.baseline } : {}),
    ...(input.countedOver ? { countedOver: input.countedOver } : {}),
    changePts: null,
    bandPts: null,
    state: 'too_little_data',
    flags,
  }
  if (input.refused) return { ...base, state: 'refused', refusedReason: input.refused }
  if (!input.baseline) return base

  const verdict: DeltaVerdict = proportionDelta(
    {
      nowPct: pct(input.value),
      prevPct: pct(input.baseline),
      nowN: input.value.n,
      prevN: input.baseline.n,
      nowK: input.value.k,
      prevK: input.baseline.k,
    },
    input.floor ?? SHARE_BAND,
  )
  return { ...base, changePts: verdict.change, bandPts: verdict.band, state: verdict.state }
}
