import type { Direction } from '../reading/bands'
import type { Verdict } from '../reading/verdicts'
import type { FigureTable } from '../reports/types'

// The written read's inputs (plan "Verbatim, writing back", T1 and T2).
//
// CODE OWNS EVERY FACT HERE. A pool candidate and a standing fact are what the
// writer (T3) is handed and what compose checks it against: which themes carry
// a week's finding, how many videos stand behind each, which quotes may print,
// and where each subject stands. Nothing in these shapes is a comment's words:
// a quote travels as a ref with `text: ''` (the ref spine,
// lib/renderables/quotes-freeze.ts) and resolves at render, and `notes` are
// Pass A's insight descriptions, which are paraphrases.
//
// The interfaces below are pinned by the plan. Comments on a field say which
// product rule it mirrors.

/** The departments a report is written for (decision D2). */
export type Department = 'sales' | 'marketing' | 'content' | 'leadership'   // + 'product' if D2 changes

/** A reading lens: a department, or product (not a report yet, D2). */
export type Lens = Department | 'product'

/**
 * A quote as a stored read keeps it: the ref and where it was heard, never
 * the words. `ref` is `e:<insight_evidence.id>` (`quoteRef.evidence`), so
 * `isQuote` recognises it and the render resolves it through the same door
 * (and the same erasure rule) as every other stored quote. `thread` is the
 * gate's thread key (platform and the platform's video id), which is what
 * "one quote per thread" is counted on.
 */
export interface QuoteRef {
  ref: string
  text: ''
  /** The comment's date, `YYYY-MM-DD` (UTC). */
  date: string | null
  platform: string | null
  thread: string | null
}

/**
 * A quote a finding may print, with the insight behind it: Pass A's slug and
 * paraphrase (never the comment), which is what the quote's fit to a written
 * finding is measured on (lib/written/fit.ts), through the insight's stored
 * embedding where it has one.
 */
export interface QuoteOption {
  quote: QuoteRef
  insightId: string
  /** The product's embedding text for the insight (`embedInput`,
   *  lib/pipeline/cluster.ts): its slug and its description. */
  insightText: string
}

export interface PoolCandidate {
  id: string                 // 'C1'…'C12', stable within one read
  themeId: string            // theme_registry.id
  label: string              // Pass B label
  description: string | null // Pass B description
  kinds: string[]            // insight kinds seen in the window's gated (lenient) material, most videos first
  /** The most common insight kind among the theme's window evidence, counted
   *  in videos (T1/T2 fixups, 30 Sep). Its quotes prefer this kind, and never
   *  come from a kind that contradicts it (praise against objection or pain
   *  point). Null where no counted citation carries a kind. */
  dominantKind: string | null
  lenses: Lens[]             // derived from kinds (purchase_intent/objection → sales; pain_point/feature_request → product; question → content; praise/switching/demographic → marketing); leadership = all
  weekVideos: number         // distinct category read-lane videos citing the theme, comment dated in the window
  /** Of those, the videos with ≥1 citation the LENIENT gate passes (T3b: the
   *  product's `quoteGate` without `requireRelevance` or a kind, research C's
   *  "lenient" replay), makers' videos and brand insiders out. What a
   *  candidate's evidence is counted in, and what a finding rests on. */
  lenientVideos: number
  /** Those videos (`videos.id`), sorted: `lenientVideos` is their count.
   *  Compose counts a finding's evidence as the DISTINCT ids across the
   *  candidates it cites (a video two themes share counts once). */
  lenientVideoIds: string[]
  gatedVideos: number        // of those, videos with ≥1 quote passing the STRICT gate (≥1 for every candidate: what prints is strict)
  /** The strict-gated videos themselves (`videos.id`), sorted. */
  gatedVideoIds: string[]
  /** The lenient-gated videos over the reading month to date,
   *  `[month start, window end)`, counted the same way as `lenientVideoIds`
   *  (T3b): the month half of a finding's evidence line is their union. */
  monthVideoIds: string[]
  monthK: number; monthN: number   // category videos in the reading month to date (month_theme_readings / window read)
  subjectId: string | null   // subject holding the most of the theme's member insights (subject_memberships.member), if it holds ≥3 of them and ≥15% (SUBJECT_MIN_MEMBERS, SUBJECT_SHARE_FLOOR); else null
  isNew: boolean             // the existing themeFlags 'new' rule (not minted by a regime-opening run)
  quoteRefs: QuoteRef[]      // strict-gated, one per thread, ≤3, text '', the dominant kind first, never a contradicting kind (the first of quoteOptions)
  /** Every quote the candidate may give a finding, in the same order and under
   *  the same rules as `quoteRefs` (strict-gated, kind-consistent, one per
   *  thread, never the video's own account or a brand insider), up to
   *  `POOL_QUOTE_OPTIONS`. ADDITIVE (T3b): the finding's quote is the one of
   *  these that fits it best (lib/written/fit.ts). */
  quoteOptions: QuoteOption[]
  notes: string[]            // ≤8 member insight descriptions dated in the window, from lenient-gated material (Pass A paraphrases, never comment text)
}

export interface WeekPool {
  clientId: string; runId: string
  window: { from: string; to: string }   // the run's frozen [window_start, window_end)
  month: string                          // reading month (YYYY-MM-01)
  weekVideos: number; weekComments: number; monthVideos: number   // category, read lane
  candidates: PoolCandidate[]            // eligible (T3b) = lenientVideos ≥ 3 AND gatedVideos ≥ 1, maker segments excluded, maker-led themes out (maker share of the window's videos over HEADLINE_MAX_MAKER_SHARE); ranked lenientVideos, then gatedVideos, then weekVideos; cap 12
  thin: boolean                          // < 3 eligible candidates
}

/** The ladder (decision D1): a level now, a change once two comparable months
 *  exist, a direction after three. `none` is a subject that prints no level
 *  at all (T1/T2 fixups, 30 Sep: every tracked subject appears, §0a.2, but a
 *  figure prints only where the subject is ready, §0a's one condition). */
export type StandingRung = 'none' | 'level' | 'changed' | 'direction'

/** A subject's state for the read: decision C's three, plus `unread` (no
 *  reading in the month: named after its rows were written, or nothing read). */
export type StandingCalibration = 'ready' | 'provisional' | 'failed' | 'unread'

/**
 * EVERY TRACKED SUBJECT (every active subject; retired ones are gone and a
 * proposed one is not tracked yet) has a fact, whatever it can print:
 *  · ready: its level and the rung its data earns (`standingLine`);
 *  · provisional, unread: no level prints (`rung: 'none'`), but its gated
 *    quote, contents and notes stay where it has them, so it still appears
 *    with what people say about it;
 *  · failed: its membership cannot be trusted, so it is the NAME ONLY (no
 *    level, trail, contents, notes or quote). Renderers list name-only
 *    subjects in one quiet "Also following" line and never say why.
 */
export interface StandingFact {
  subjectId: string; name: string
  calibration: StandingCalibration
  level: { k: number; n: number } | null        // pooled market, reading month to date; null where unread or failed (kept for a provisional subject, never printed)
  rank: number                                  // by level among the subjects that have one (ready and provisional, the Subjects rail's set); 0 where there is none
  trail: { month: string; k: number | null; n: number | null }[]   // up to 12 months; [] where failed
  verdict: Verdict | null                       // monthChange on the market pair view (null = no comparable pair, or not ready)
  direction: Direction | null                   // directionWord only, ready only
  rung: StandingRung                            // highest rung the data earns; 'none' unless ready
  contents: string[]                            // ≤5 theme labels inside the subject this month (insight overlap)
  notes: string[]                               // ≤8 member insight descriptions this month
  quoteRef: QuoteRef | null                     // strict-gated, this week if any, else this month
}

/**
 * A sentence code writes: figures as `[[key]]` tokens, their printed values in
 * the table beside it (the PRINTED shape, lib/reports/types.ts, so the level
 * reads exactly as `levelText` prints it and no second conversion decides
 * "7%" against "7.0%"). `substituteFigures` (lib/reports/cover.ts) renders it.
 * An empty `body` is no sentence: nothing prints.
 */
export interface TokenSentence {
  body: string
  figures: FigureTable
}

// ---- The stored read (plan T3) -------------------------------------------------

/** The departments a read speaks to, in the order they print. */
export const DEPARTMENTS: readonly Department[] = ['sales', 'marketing', 'content', 'leadership']

/**
 * What prints about how sure a finding is (plan T3: "no confidence words").
 * A finding that is not at least `reasonable` on the document engine's rule
 * (`calibrateSure`, counted in distinct gated videos) does not print at all;
 * of those that do, only `strong` shows anything: the product's existing
 * "Strong evidence" marker, at `CURATION_GATE.confirmedMinVideos` videos.
 */
export type SureWord = 'strong' | 'reasonable'

export interface WeekReadFinding {
  headline: string
  saw: string
  means: string
  for: Partial<Record<Department, string>>
  /** The cited candidates' theme ids (`theme_registry.id`): a candidate's
   *  `C#` is stable only inside one read, the registry id across reads. */
  basedOn: string[]
  quote: QuoteRef | null
  /** What the finding rests on (T3b): the DISTINCT lenient-gated videos across
   *  every cited candidate this week, and the same union over the month to
   *  date. One measure read twice (AGENTS.md's week-against-month rule),
   *  never a sum. */
  videos: { week: number; month: number }
  /** The subject the cited candidates name, where they name exactly one;
   *  null where none does or where they name two (a price finding resting on
   *  a comfort theme too is part of neither). */
  subjectId: string | null
  /** Every cited candidate was first heard this month (themeFlags 'new'). */
  isNew: boolean
  sure: SureWord
  /** ADDITIVE. The evidence line, a code sentence with `[[keys]]` in
   *  `figures`: "[[f1_week]] videos this week · [[f1_month]] in September so
   *  far", the two halves of `videos`. Frozen here so no renderer re-derives
   *  it. */
  evidence: string
  /** ADDITIVE. The context line (T2 plus isNew): "Part of Comfort: [[…]] of
   *  [[…]] videos in your market in September, the fourth biggest subject."
   *  and/or "First heard in September.", or '' where neither is true. Printed
   *  in a verdict node: a direction word here is code's, earned. */
  context: string
}

/**
 * One tracked subject in "Where your market stands". The pinned shape is
 * `{ subjectId, sentence }`; the rest is ADDITIVE, because a renderer must not
 * re-read a live figure to print a stored read (numbers freeze with it).
 * `line` is `standingLine`'s body ('' unless ready), `sentence` the writer's
 * ('' where it wrote none), `quote` the subject's gated ref. A subject with no
 * line, no sentence and no quote is name only: renderers list those in one
 * quiet "Also following" line and never say why.
 */
export interface WeekReadStanding {
  subjectId: string
  sentence: string
  name: string
  calibration: StandingCalibration
  rung: StandingRung
  line: string
  quote: QuoteRef | null
}

export interface WeekReadData {
  version: 1
  window: { from: string; to: string }; month: string
  inShort: string
  findings: WeekReadFinding[]
  standing: WeekReadStanding[]
  figures: FigureTable
  /** Dropped findings, for the Studio's workings view only. */
  held: { reason: string; headline: string }[]
  model: string; promptVersion: 'week_read_v1' | 'week_read_v2'; costUsd: number
}
