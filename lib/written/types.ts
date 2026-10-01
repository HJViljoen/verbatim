import type { Direction } from '../reading/bands'
import type { Verdict } from '../reading/verdicts'
import type { FigureTable } from '../reports/types'
import type { QuoteSubstance } from './substance'

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
  /** ADDITIVE (v3). How much the quote says on its own: its form, read from
   *  its words by the pool, and the strict gate's score
   *  (lib/written/substance.ts). Never the words. Absent on a pool saved
   *  before v3: the fit alone decides. */
  substance?: QuoteSubstance
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
  /** ADDITIVE (v3). The comment date of the theme's first citation this month
   *  that counts and the lenient gate passes (`[month start, window end)`, the
   *  same material as `monthVideoIds`), or null. With `isNew` it says whether
   *  the theme was first heard THIS WEEK (`firstHeardThisWeek`). */
  firstHeard?: string | null
  quoteRefs: QuoteRef[]      // strict-gated, one per thread, ≤3, text '', the dominant kind first, never a contradicting kind (the first of quoteOptions)
  /** Every quote the candidate may give a finding, in the same order and under
   *  the same rules as `quoteRefs` (strict-gated, kind-consistent, one per
   *  thread, never the video's own account or a brand insider), up to
   *  `POOL_QUOTE_OPTIONS`. ADDITIVE (T3b): the finding's quote is the one of
   *  these that fits it best (lib/written/fit.ts). */
  quoteOptions: QuoteOption[]
  notes: string[]            // ≤8 member insight descriptions dated in the window, from lenient-gated material (Pass A paraphrases, never comment text)
}

/**
 * The market's size (decision E: the category plus the tracked brands'
 * audiences, the client's own posts out; `pooledDenominators`), the same base
 * as the standing levels ("of 852"): the week is the window read over the
 * run's frozen window, the month the month to date as the run left it. Null
 * where it was not read, never zero. The Dashboard's figures, frozen at the run.
 */
export interface WeekMarketFigures {
  week: { videos: number | null; comments: number | null }
  month: { videos: number | null; comments: number | null }
}

export interface WeekPool {
  clientId: string; runId: string
  window: { from: string; to: string }   // the run's frozen [window_start, window_end)
  month: string                          // reading month (YYYY-MM-01)
  weekVideos: number; weekComments: number; monthVideos: number   // category, read lane
  candidates: PoolCandidate[]            // eligible (T3b) = lenientVideos ≥ 3 AND gatedVideos ≥ 1, maker segments excluded, maker-led themes out (maker share of the window's videos over HEADLINE_MAX_MAKER_SHARE); ranked lenientVideos, then gatedVideos, then weekVideos; cap 12
  thin: boolean                          // < 3 eligible candidates
  /** ADDITIVE (M2, 1 Oct): the week started in the month before the one it
   *  ended in, so `month` is the month it started in and every month figure
   *  is that month IN FULL ("in September", "September in total"), not "so
   *  far" (lib/written/month.ts `readingMonthOf`). Absent is false. */
  monthComplete?: boolean
  /** ADDITIVE (v3): the market's week and month to date. Absent on a pool
   *  saved before v3. */
  market?: WeekMarketFigures | null
}

/** Was this candidate first heard this week: the theme is new this month
 *  (`isNew`) and its first counted citation this month is inside the week's
 *  window? "New this week" lists only these (never invented novelty). */
export function firstHeardThisWeek(c: Pick<PoolCandidate, 'isNew' | 'firstHeard'>, window: { from: string }): boolean {
  if (!c.isNew || !c.firstHeard) return false
  const first = Date.parse(c.firstHeard)
  const from = Date.parse(window.from)
  return Number.isFinite(first) && Number.isFinite(from) && first >= from
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
  level: { k: number; n: number } | null        // pooled market, reading month to date; null unless ready (T0a, ruling U6)
  rank: number                                  // by level among the ready subjects (the Subjects rail's set since T0a); 0 where there is none
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
  /** v1 rows only (week_read_v1, v2): a line per department. Gone from v3
   *  (Heinrich, 30 Sep: the weekly is one general report; department
   *  interpretation lives in the monthly briefs). Optional so a stored v1 row
   *  still reads. */
  for?: Partial<Record<Department, string>>
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
  /** ADDITIVE (pages build, 1 Oct). The videos `videos.month` counts (the
   *  union of the cited candidates' `monthVideoIds`, sorted), so the This week
   *  page's brand line ("In September: Cotopaxi 2 · other bags 12") splits
   *  exactly the count the evidence line prints. Absent on a read stored
   *  before it: the page prints no brand line for it. */
  monthVideoIds?: string[]
}

/** ADDITIVE (pages build, 1 Oct). One conversation also heard this week: an
 *  eligible pool candidate no printed finding rests on, with its week's
 *  lenient-gated videos (the count printed, and the videos its brand line
 *  splits). */
export interface WeekReadAlsoHeard {
  themeId: string
  label: string
  videos: number
  videoIds: string[]
  /** The same theme's lenient-gated videos over the month (`monthVideoIds`'
   *  count), so the week's count can be restated against its month. */
  monthVideos?: number
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

// ---- The report (v3) ---------------------------------------------------------------
//
// Each report line's prose is `body`, never `text`: in a stored read `text`
// is a quote ref's, and it is always '' (the words resolve at render).

/** One paragraph of "What happened": the writer's prose, the candidates it
 *  rests on (theme ids), and the real quote code attached where the writer
 *  pointed to one (at most two in the story). */
export interface WeekReadParagraph {
  body: string
  basedOn: string[]
  quote: QuoteRef | null
}

/** One line of "What it means for {company}": at most two sentences of
 *  intelligence (never an instruction), resting on the week's evidence. */
export interface WeekReadImplication {
  body: string
  basedOn: string[]
}

/** One conversation first heard this week (`firstHeardThisWeek`), with the
 *  writer's words on what it is and code's evidence line (as a finding's). */
export interface WeekReadNewItem {
  themeId: string
  body: string
  videos: { week: number; month: number }
  evidence: string
}

/** One open question "Worth watching next week": grounded in what was seen,
 *  never a forecast and never a direction. */
export interface WeekReadWatchItem {
  body: string
  basedOn: string[]
}

/** Which part of the read a held item came from (the workings view). */
export type HeldSection = 'finding' | 'week_line' | 'story' | 'implication' | 'new' | 'watch'

/** Dropped findings and report lines, for the Studio's workings view only.
 *  `headline` is the finding's headline, or the start of a report line. */
export interface WeekReadHeld {
  reason: string
  headline: string
  /** ADDITIVE (v3). Absent is a finding. */
  section?: HeldSection
}

/** What every stored read has, whatever its version. */
interface WeekReadCommon {
  window: { from: string; to: string }; month: string
  /** The findings, in full (the This week page; the Dashboard tile names
   *  them). */
  findings: WeekReadFinding[]
  standing: WeekReadStanding[]
  figures: FigureTable
  held: WeekReadHeld[]
  model: string; costUsd: number
  /** ADDITIVE (pages build, 1 Oct): "Also heard this week" on the This week
   *  page. Absent on a read stored before it, empty on a thin week. */
  alsoHeard?: WeekReadAlsoHeard[]
}

/** A read stored by week_read_v1 or v2: In short, then the findings with a
 *  line per department. Still reads; nothing writes it now. */
export interface WeekReadDataV1 extends WeekReadCommon {
  version: 1
  inShort: string
  promptVersion: 'week_read_v1' | 'week_read_v2'
}

/**
 * A read stored by week_read_v3 (Heinrich, 30 Sep: "I don't feel like it is
 * really a report"): the report, top to bottom, then the findings.
 *  · headline: the week in one line;
 *  · story: what happened, two or three paragraphs telling the week as one
 *    story, with at most two real quotes;
 *  · implications: what it means for the company, two or three;
 *  · newThisWeek: conversations first heard this week, empty (the section is
 *    omitted) where there are none;
 *  · watch: one or two open questions worth watching next week;
 *  · market: the Dashboard's numbers, on the market base, also in `figures`
 *    under `market_week_videos` and the like.
 * Every section is empty where no finding prints (a thin week): nothing is
 * sent from it.
 */
export interface WeekReadDataV2 extends WeekReadCommon {
  version: 2
  headline: string
  story: WeekReadParagraph[]
  implications: WeekReadImplication[]
  newThisWeek: WeekReadNewItem[]
  watch: WeekReadWatchItem[]
  market: WeekMarketFigures | null
  /** ADDITIVE (M2): the month figures are `month` in full, the week having
   *  carried past its end; absent or false, the month so far. */
  monthComplete?: boolean
  promptVersion: 'week_read_v3'
}

/** The stored read (`week_reads.data`), by version: a renderer reads
 *  `version` and prints what that version has. */
export type WeekReadData = WeekReadDataV1 | WeekReadDataV2

// ---- The long-run read (pages build, 1 Oct: "What holds across {months}") -----------
//
// A `week_reads` row of kind 'month' (no migration: the kind exists). Written
// once a month, at the first run after a month ends, inside the existing
// `write-week-read` step (lib/written/longrun.ts `maybeWriteLongRun`), or by
// `scripts/longrun-read.ts`. Durable patterns over the whole record window,
// never a change: nothing in it compares one month with another.

/** Who a piece of talk is about (the pages build's brand rule): the client's
 *  own posts or a comment naming the client; a tracked rival's filed videos or
 *  a comment naming the rival; else the category ("Other bags in your
 *  market"). One brand per video, so a split adds up. */
export type WhoAbout = 'client' | 'market' | `rival:${string}`

export interface WhoPart {
  about: WhoAbout
  videos: number
}

/** One durable idea, as it prints. */
export interface LongRunIdea {
  headline: string
  /** One or two short paragraphs, the writer's after scrub. */
  body: string[]
  /** The cited themes (`theme_registry.id`). */
  basedOn: string[]
  /** The DISTINCT lenient-gated videos across every cited theme over the
   *  window (a video two themes share counts once): the evidence line's count. */
  videos: number
  /** The same videos by the month their counted comments are dated in, one
   *  entry per window month (a video heard in two months counts in both). */
  months: { month: string; videos: number }[]
  /** Who those videos are about, one brand per video: the client first, then
   *  the rivals by videos, the category last. Sums to `videos`. */
  who: WhoPart[]
  sure: SureWord
}

export interface LongRunReadData {
  version: 1
  kind: 'longrun'
  promptVersion: 'longrun_read_v1'
  /** The read's month, `YYYY-MM-01`: the last month of the window. */
  month: string
  /** The window's months, oldest first ("August and September"). */
  months: string[]
  /** `[first month start, the month after `month`)`. */
  window: { from: string; to: string }
  /** The serif lead, '' where none survived. */
  inShort: string
  ideas: LongRunIdea[]
  held: WeekReadHeld[]
  model: string
  costUsd: number
}
