import type { SupabaseClient } from '@supabase/supabase-js'

import type { ForSalesData, SalesGroup, SalesGrouping, SalesQuote } from '../blocks/for-sales'
import { chunk, mapWithLimit, READ_CONCURRENCY, UUID_IN_CHUNK } from '../chunk'
import { SALES_GROUPS_SHOWN, SALES_PRAISE_SHOWN, SALES_QUOTES_PER_GROUP, SALES_SWITCHING_SHOWN } from '../blocks/for-sales'
import {
  handleKey, intentCounts, perfVsMedian, pretty, roleByAccount, shapeInbox,
  type InboxRow, type InboxSource, type Intent, type PerfMultiple,
} from '../content-tiles'
import { engageDeepLink, engageVocab, loadEngageCandidates, rankEngageCandidates, type EngageCandidate } from '../engage'
import { citationLink } from '../evidence-cite'
import { cap, fmtInt, longMonth, platformLabel, shortDate } from '../format'
import { rowWindow } from '../pipeline/run-bookkeeping'
import { cleanQuote, fetchQuoteCitationsByAudience, readableQuote, readingOf, readsAsHeroQuote, readTranslations, type QuoteCitation } from '../quotes'
import { pickEligible, quoteGate, type GateOptions } from '../quote-gate'
import { engageContextWant, gateEngage, gateFor, readQuoteContext } from '../quote-context'
import { audienceLabel } from '../readiness/types'
import {
  BASELINE_MONTHS,
  baselineStateOf,
  baselineStepOf,
  comparableBaseline,
  type BaselineState,
  type DenominatorMonth,
} from '../reading/anomaly'
import { freezeStateFor, isMissingMonthlyReading, isMissingMonthTable } from '../reading/monthly'
import { monthStartOf, nextMonth } from '../reading/month-key'
import { loadChanges, loadMonthSeries, loadPairRows, loadWindowReading, type ReadingHandle } from '../reading/read'
import { loadAppPairOn } from '../reading/gather-flags'
import { marketAudiences, pooledDenominators, type MarketCount } from '../reading/market'
import { pairedVerdict } from '../reading/bands'
import { nextComparablePair, pairOnVerdict } from '../reading/comparability'
import type { PairOn } from '../reading/pairs'
import { pairChipWords, pairSentence } from '../calibration'
import type { MethodLines } from '../reading/method'
import { platformMixLine } from '../reading/record'
import { mergeSeriesNotes, type MonthLabel, type MonthSeries } from '../reading/series'
import { loadUpdateSeries, type UpdateSeries } from '../reading/updates'
import { loadCadenceRuns, loadDeliveredRuns, loadReadingSchedule, marketRivalAudiences, updateClock, updateInstant } from '../reading/reading-view'
import type { MonthStatus, PlatformMix } from '../reading/types'
import type { FigureTable, Verdict } from '../reading/verdicts'
import { parseRef, quoteRef } from '../renderables/quotes-freeze'
import type { Quote, Scope } from '../renderables/types'
import { CLIENT_AUDIENCE, INDUSTRY_AUDIENCE, isMissingCompetitors, loadCompetitors, rivalKey, rivalNameOf } from '../rivals'
import { isMissingSubjects, TABLE_SUBJECTS, type Subject } from '../subjects/types'
import { subjectCalibration, type SubjectCalibration } from '../subjects/calibration-state'
import { monthsWrittenAt, subjectCountedFrom, subjectReadIn, unreadWords, type CountedSubject } from '../subjects/read-in'
import { selectAll } from '../supabase-admin'
import { row, rows } from './read'
import { fetchRunningRunIds } from './latest-video-run'
import { fetchThemedRunId, pickThemedRunId, type ThemedRunRow } from './themed-run'
import { citationsUntranslated } from './evidence-untranslated'
import { loadOwnPublishedVideos, ownSides, type PlaybookVideo } from './playbook'
import type { FormatMatrix } from '../reading/formats'
import { addedSearchesRead, loadThemeSegmentRows, loadThemesProvenance, makerRuleEnabled, themeSegmentsOf, type SideReading } from './overview'
import { searchInflated, segmentOf } from './overview-market/board'
import { segmentRulesEnabled } from '../segments/rules'
import { brandCountState, noiseWords, OTHER_MEANING } from '../brands/precision'
import { trackedSince } from '../settings/search-set'
import type { BrandLayer } from './overview-brands'
import { loadUpdateBrandLayer, updateBrandCounts } from './week-brands'
import { loadMarketMakers, makerKOf } from './subjects'
import { marketSubjectSide } from './overview-market/subjects'
import { noiseCommentsOf, noiseVideos, RPC_SEGMENTS_FOR_VIDEOS, skipNoise } from './noise'
import type { ConfigChange } from '../config-log'
import type { ScheduleConfig } from '../pipeline/schedule-due'
import { scheduledUpdateAfter, type ReadingMonth } from '../reading/reading-month'
import { ourChangesWithoutGatherFlags } from '../reading/gather-flags'
import { addDays, marketWeekRowOf, weekAxis, type MarketWeekRowRaw, type WeekVolumesBlock } from '../reading/weeks'
import { weekLineConfigFor } from '../week-line-config'
import { passedBeforeOf } from '../reading/week-line'
import { loadKeptWeekLine, weekVolumesBlock } from './overview-market/weeks'

// This week — "what needs attention this week?" (Phase 1 WP15, decision P,
// the mock's ThisWeek.dc.html).
//
// THE ONE PAGE DATED BY THE UPDATE AND NOT BY THE MONTH. Every other reading
// surface in Phase 1 answers a question about a calendar month, because the
// month is the record's key and a comment's own date is the only clock this
// product keeps (AGENTS.md). This page answers a question about the last
// DELIVERY, which is a different thing and has to say so on every figure it
// prints: its window is the run's own frozen `[window_start, window_end)`, read
// off the row and never recomputed from the clock, and every count it states
// against that window is stated again as a contribution to the month it falls
// in ("this update's contribution to September so far: 205 of 449"). That
// second half is what stops a reader treating a week as a period.
//
// WHY THE WINDOW COMES OFF THE ROW. Three steps once recomputed it from
// `Date.now()` and two multi-day runs gathered and synthesised against windows
// 18 and 9 days apart (AGENTS.md). A page is not exempt: read from the clock,
// This week would draw a seven-day window over a run that actually covered
// thirty, and Sealand's newest update covers exactly thirty. So `rowWindow`
// reads it, a run with no window says so, and the window's own days are printed
// on the page.
//
// NINE SECTIONS NOW, AND THE TWO THAT ARRIVED LAST ARE THE WORK QUEUE. The mock
// draws nine; two of them — Worth a reply and Flagged for awareness — were the
// Content page's reply inbox, and the design is explicit that the inbox moves
// "never a phase later, because it is the content person's only work queue".
// Block D wave 2 moved the READING here (`buildReplies` below) and the Content
// page keeps its own copy until it retires: two readers of one digest for as
// long as both pages exist, which is why both anchor on the same run and the
// same candidates rather than each picking their own. `LATER_LINE` still names
// what stays on Content, and it is now about the page rather than about these
// two sections.
//
// AND THE ONE THING THIS COPY DOES DIFFERENTLY: it is dated by the RUN'S OWN
// FROZEN WINDOW, not by `Date.now() - report_period`. Content computes its
// freshness window off the clock at page load, so a comment is "in this week"
// depending on when you open the page; this page's every other figure is of
// `[window_start, window_end)` off the row, and a reply row dated any other way
// would be the one count on the page a reader cannot check against the rest.
//
// WHAT DEGRADES, AND HOW. Five of this page's reads are on migrations applied
// by hand in one window before R1 (§2's `month_subject_readings` and the
// subjects table, §1's `anomaly_checks` / `anomaly_flags`, the windowed
// denominators). Every one of them answers `null` — never `[]` and never `0` —
// when its table is absent, and every block prints a sentence saying the
// instrument is not installed rather than a zero that reads as a measurement.
// That is the `isMissing*` precedent, and it is the difference between "nothing
// was unusual" and "nobody has looked yet", which this page exists to keep
// apart.

// ---- the constants -----------------------------------------------------------

/**
 * How many distinct numbers the first screen may put in front of a reader.
 *
 * TWELVE, over the page bar and §1. The mock's first 900px is the bar's "312
 * videos this week" and the whole of Unusual this week — its stat, the
 * multiple, the typical week, the two ends of the band, the n, and the two
 * figures its interpretation cites. Counted the way WP11 counts Overview's
 * thirty: over figure TABLES rather than rendered digits, because the same
 * figure named twice is one number to a reader (lib/blocks/types.ts
 * `figureCount`).
 */
export const FIRST_SCREEN_BUDGET = 12

/** Risers shown. Three, per the design ("the three themes that moved most in
 *  the current month's reading") and the mock. */
export const RISERS_SHOWN = 3

/** How many themes the risers are chosen from — ranked on the month's own
 *  reading before the band is drawn, so the three shown are the three largest
 *  movements and not the first three that happened to clear a floor. */
export const RISER_POOL = 30

/** The floor a newly-heard theme has to clear before it is worth a name.
 *
 * TEN VIDEOS IN THE MONTH, which is `SHARE_BAND.minK` — the same floor every
 * other object on a reading surface clears. It exists because "new themes first
 * heard this update" is a three-digit number: the clustering is re-made over
 * the whole cumulative corpus every run and labels churn about 88% run to run
 * (AGENTS.md), so production writes 303 first-seen themes on Össur and 592 on
 * Sealand in ONE update. Two of Össur's 303 carry ten videos this month and
 * none of Sealand's 592 do. Printing 303 would be printing the churn; printing
 * the two that clear the floor is printing the week.
 */
export const NEW_THEME_FLOOR = 10

/** Formats and hooks shown in "What worked". */
export const WORKED_SHOWN = 4

/** Quotes the weekly's "new quotes on your subjects" prints (the weekly
 *  stays on deploy 3's template: reports paused, 27 Sep). */
export const NEW_QUOTES_SHOWN = 4

/**
 * Rival posts named per rival in §5.
 *
 * THREE, the mock's own row count, and a cap that is load-bearing rather than
 * cosmetic: each named post costs one HEAD count of the comments dated under it
 * inside the window, so "every post" would be a hundred round trips on a live
 * tenant to print a column. `RivalPosts.postsTotal` carries how many there were
 * in all, so three of ninety-four never reads as ninety-four.
 */
export const RIVAL_POSTS_SHOWN = 3

/**
 * How many of a rival's posts are WEIGHED before three are shown.
 *
 * SIX, AND THE TWO STAGES ARE DIFFERENT QUESTIONS. Nothing on `videos` says
 * which post mattered, so the first cut is reach — `views`, the platform's own
 * number — and reach is not the column the reader is looking at. Measured on
 * production 2026-09-18: Freitag's two widest-reaching posts this update carry
 * 2.2M and 2.16M views and ZERO comments dated in the window, while Cotopaxi's
 * second-widest carries five. A table picked on reach alone would have printed
 * a comments column of zeroes on the trial tenant's largest rival.
 *
 * So six are weighed on reach, their window comments are counted, and the three
 * with the most are shown — and the block SAYS that is the rule, because "three
 * of ninety-four" picked two ways is two different claims.
 */
export const RIVAL_POSTS_CONSIDERED = 6

/** How much of a caption stands in for the title `videos` does not have. */
export const RIVAL_CAPTION_CHARS = 90

/**
 * Rows the reply block shows before the footer takes over.
 *
 * THREE, the approved preview's row count (market-first WP3.7; the weekly's
 * WR5 shows the same three). The digest itself picks at most twelve
 * (`rankEngageCandidates`' total cap, three per category), and `RepliesBlock.
 * total` carries that number so "3 shown" never reads as "3 found".
 */
export const REPLIES_SHOWN = 3

/** Awareness rows shown. Three, which is also the digest's own cap on the
 *  misinformation category, so this is a display limit that never bites. */
export const FLAGGED_SHOWN = 3

// ---- the shapes --------------------------------------------------------------

/** The run this page is a reading of. */
export interface WeekUpdate {
  id: string
  /** When the update was delivered. */
  date: string
  /** The previous delivered update's date, or null where this is the first. */
  previous: string | null
  status: string
}

/** The run's own frozen window, half-open `[from, to)`. */
export interface WeekWindow {
  from: string
  to: string
  /** How the start was decided (`previous_run`, `reconstructed`, …). Printed
   *  nowhere; carried so the record can say it. */
  basis: string
}

/** One flag, in full — the design's own requirement for WK1 ("every flag in
 *  full: object, week figure, baseline, band, n"). */
export interface UnusualFlag {
  objectKind: string
  objectId: string
  label: string
  /** The population the share is a share of, by name. */
  denominator: string
  week: { k: number; n: number }
  baseline: { k: number; n: number }
  /** The months pooled into the baseline, and which of them were still
   *  filling when the flag was raised. */
  baselineMonths: string[]
  baselineFilling: string[]
  /**
   * Whether those months were read under ONE clustering — `one`, `mixed`,
   * `unknown`, or `not_grouped` for an object that has no grouping to be
   * like-for-like about (a kind is a kind).
   *
   * M7 stores it precisely so a surface can MARK a baseline that was not read
   * under one grouping, and its comment says so at length; a reader that never
   * selected the column printed the filling-months caveat and not the
   * like-for-like one. `null` where the column is absent, which is a fourth
   * thing again and is not marked.
   */
  baselineRegime: string | null
  changePts: number
  bandPts: number
  /** The model's explanation, labelled as interpretation. Empty where the
   *  check wrote none. */
  sentences: string[]
  /** Who wrote it — the model, or the product itself. */
  explanationModel: string | null
  quotes: { quote: Quote; cite: string; href: string | null }[]
  rank: number
}

export type UnusualState =
  /** Flags were raised and are printed below. */
  | 'flagged'
  /** The check ran and nothing cleared. The one answer most weeks give. */
  | 'nothing_unusual'
  /** The check ran and refused to read the week. `note` says why. */
  | 'refused'
  /** The baseline is not three complete months yet. */
  | 'baseline_forming'
  /** No check has ever run for this update — the table is not installed, or
   *  the step has not reached this tenant. */
  | 'not_checked'
  /** The check's own row says flags were raised and the flags themselves could
   *  not be read. NOT `nothing_unusual`: "nothing fired" and "we could not
   *  look" are the two answers this whole table exists to keep apart, and a
   *  failed read that renders as a reading puts the second in the first's
   *  words. */
  | 'unreadable'

export interface UnusualBlock {
  state: UnusualState
  /** The calibrated sentence the check itself wrote, where it wrote one. */
  note: string | null
  flags: UnusualFlag[]
  /** How many cleared both gates before the cap of three. */
  flaggedCount: number
  /** The pre-registered set's size and how many got as far as a p-value —
   *  a p means nothing without the number of questions asked to get it. */
  setSize: number | null
  tested: number | null
  /** The baseline's own state, for the forming sentence. */
  baseline: BaselineState | null
  /** "the check starts with the October reading" — the month the baseline
   *  completes in, or null when it is already ready. */
  startsWith: string | null
  /** This update's videos against the median of the updates behind it, when
   *  the check recorded them. */
  updateVideos: number | null
  medianVideos: number | null
  /**
   * The last thirteen UPDATES, with what each one brought in — the mock's
   * thirteen-point chart, built at the one cadence that is real (D5).
   *
   * NOT THE SAME NUMBERS AS `updateVideos` / `medianVideos` ABOVE, and the two
   * must never be printed as if they were. Those are what the anomaly CHECK
   * recorded for this update at the moment it ran, off its own read
   * (`anomaly_checks.update_videos` / `.median_videos`); this is a reading
   * taken now, over the runs that exist now. They agree on a quiet tenant and
   * drift the moment a run is resumed or a check is re-run, and a block
   * printing one beside the other without saying which is which is the page
   * disagreeing with itself.
   *
   * Null where the series could not be read at all. `lib/reading/updates.ts`
   * has the four rules the shape enforces — chief among them that its band is
   * a COUNT band in videos, where this block's other band (`UnusualFlag.
   * bandPts`) is in percentage points.
   */
  series: UpdateSeries | null
  /**
   * The baseline on comparable months only (market-first WP3.7; decision D:
   * "the unusual-week check uses comparable months only"), the rule the run's
   * check reads since WP3.4 (`comparableBaseline`, `baselineStepOf`): how many
   * of the three months behind the week's month are kept, and the first month
   * whose weeks can be flagged if nothing we search changes. OPTIONAL: a copy
   * stored before WP3.7 has none, and a page that could not read the pair rows
   * prints the forming sentence alone.
   */
  comparable?: { kept: number; required: number; flagsFrom: string | null } | null
}

/** One subject, month-to-date, with what this update put into it. */
export interface SubjectWeekRow {
  id: string
  label: string
  /** Always `'ready'` on a row the loader builds (decision C): the others are
   *  `WeekSubjectsBlock.withheld`. Optional: a stored row has none. */
  calibration?: SubjectCalibration
  /** Videos carrying the subject this month so far, in the client's audience. */
  monthVideos: number
  /** The month's denominator for that audience. */
  monthOf: number
  /** What THIS update added — the videos of its window carrying the subject. */
  addedVideos: number | null
  /**
   * What an update that gave this subject its ordinary share of the month
   * would have added — the subject's month-to-date videos scaled by this
   * update's own share of the month.
   *
   * MEASURED ON BOTH SIDES AND NOT A HISTORY. `typical = monthVideos ×
   * (this update's client-audience videos in the month ÷ the month's own
   * client-audience denominator)`. Every one of those four numbers is read: two
   * off the stored month rows, two off the windowed read clipped to the month.
   * So the comparison is a ratio of ratios — did this subject take a larger
   * share of this update than it holds of the month so far — and neither side
   * is a modelled or averaged history.
   *
   * WHY NOT "THE MEDIAN OF ITS LAST THIRTEEN CONTRIBUTIONS", which is what the
   * words "a typical week" suggest: that is one `window_subject_readings` call
   * per update per subject, and it would be a thirteen-point series per subject
   * keyed on the delivery — the thing this page is allowed exactly one of
   * (`UnusualBlock.series`). Null where the window read or the month
   * denominator cannot answer.
   */
  typical: number | null
  /** `above typical` · `about typical` · `below typical` — `typicalTag`'s own
   *  words, which are a LEVEL against a level and never a direction. */
  tag: string | null
  verdict: Verdict | null
  /**
   * THE MARKET'S SIDE (market-first WP2.7, plan §2.7 and §4.2; decision E):
   * the subject's videos in the month so far over the category and the
   * tracked brands, of the market's videos (`monthSoFar`, pooled as the front
   * page pools it), and the videos this update's own days put into that month
   * (`thisUpdate`, `window_subject_readings` over the window clipped to the
   * month, pooled the same way; null where the windowed read cannot answer).
   * Two counts that add to the month, never a share of a week.
   *
   * Set on every row the loader builds since WP2.7; OPTIONAL, so a copy stored
   * before it (the client's own side, "0 of 0 videos" on Sealand, GR F41)
   * renders as it was sent.
   */
  market?: { monthSoFar: SideReading; thisUpdate: number | null }
  /** The share of its market videos in the month that are makers' (the
   *  Subjects rail's and the front page's rule, `loadMarketMakers`), for the
   *  preview's "over a third makers" tag (WP3.7). Null where it was not
   *  measured; absent on a stored copy. */
  makerShare?: number | null
}

export interface WeekSubjectsBlock {
  /** The READY subjects (decision C, WP1.1): these rows are your own side of
   *  each subject, which only a ready subject shows. */
  rows: SubjectWeekRow[]
  /**
   * The confirmed subjects whose own side is not shown: provisional (not
   * checked yet, or not clearly under the floor) or failed (being
   * re-described). Named, with their word, and no figure. Optional: a stored
   * snapshot from before WP1.1 has none.
   *
   * AND A SUBJECT THE MONTH WAS NOT READ FOR (default M-a), whatever its
   * calibration, unless it failed: its `unread` holds `unreadWords` ("no
   * reading yet"), which prints in place of the calibration word, since
   * "provisional" is the calibration word alone and its zero is no reading.
   */
  withheld?: { id: string; label: string; calibration: SubjectCalibration; unread?: string | null }[]
  /** Null when subjects are recorded here; a sentence when they are not. */
  unread: string | null
  /** The month the figures are of. */
  month: string
  /**
   * "Two of your three subjects ran above typical in this update" — the mock's
   * §2 lead (`weekly.s2.lead`), as a k of n over the rows that carry the tag.
   *
   * The mock's own sentence is "Three of the six ran above a typical week", and
   * the half that is refused is "a typical week": there is no weekly series to
   * be typical of. What is kept is the count, its denominator, and the names —
   * with the basis said in the same breath, because a tag without its basis is
   * the score this product does not print. Null where no row carries a tag.
   */
  lead: string | null
  /**
   * Set when the block was built on the market (WP2.7): the month and the
   * market's videos in it, the "of N" the share column is a share of. A block
   * without it is a copy stored before WP2.7 and renders as it was sent.
   */
  market?: { month: string; n: number | null }
  /**
   * "six subjects named 19 Aug" — the mock's §3 footer note, off
   * `subjects.named_at`.
   *
   * ONE DATE ONLY WHERE THERE IS ONE DATE. Six subjects named in one sitting is
   * the common case and the mock's; subjects named on different days have no
   * single naming date, and the line then says the first rather than picking
   * one. Null where nothing is named, because a footer counting zero subjects
   * on a block that has already said none are recorded says it twice.
   */
  namedLine: string | null
}

/** One theme rising in the month's reading. */
export interface Riser {
  id: string
  label: string
  /** The month-to-date reading. */
  month: { k: number; n: number }
  /** The trailing months it is read against. */
  baseline: { k: number; n: number }
  verdict: Verdict
  /** What this update put into it, where the windowed read is available. */
  addedVideos: number | null
  quotes: { quote: Quote; cite: string; href: string | null }[]
}

export interface RisingBlock {
  rows: Riser[]
  /** The audience the shares are shares of. */
  audience: string
  month: string
  monthOf: number
  /**
   * How many of the pool cleared their band WITH A LARGER SHARE, and how many
   * were banded at all.
   *
   * `moved` is filled only where the verdict is `moved` and the change is
   * positive — the same test that decides whether a row is printed — so it is
   * a count of risers and not of band-clearers. The note beside it says so.
   *
   * THE BLOCK CLAIMS "NOTHING ELSE MOVED CLEARLY", which is a statement about
   * the themes it did NOT print — so every one of them has to have been tested.
   * The loader used to stop the moment it had three, leaving the rest of the
   * pool unbanded and the sentence an assertion about comparisons nobody drew.
   * §1 gets this right ("N cleared the band this update; the 3 largest are
   * printed") and these two numbers are what let §3 say the same thing.
   */
  moved: number
  pooled: number
  /**
   * Whether the baseline is a SUM of three month rows rather than a window
   * read.
   *
   * True while `window_denominators` / `window_theme_readings` (M3) are not
   * applied: the n the band is drawn on is then video-months, a video talked
   * about in two of the three counts in both, and the block prints the note
   * that says so. False once the window read answers, and the note is not
   * printed, because it is not true of that reading.
   */
  pooledBaseline: boolean
  unread: string | null
  /** The refused month pair as the "not read as a change" chip's words
   *  (`pairChipWords`), where the rule refused the comparison: "Checks on this
   *  update" prints it (WP3.7). Optional, so a stored copy carries none. */
  chip?: string | null
}

/** One audience's share of what came in. */
export interface AudienceRow {
  audience: string
  label: string
  /** Videos this update GATHERED for that audience. */
  gathered: number
  /** Videos this update ANALYSED — the population every reading is drawn
   *  from, and never the same number as the one above. */
  analysed: number
  platformMix: PlatformMix
  /**
   * What THIS audience's window put into the month, and the month's own
   * denominator for it.
   *
   * THE PLAN ASKS FOR IT PER ROW and the page printed one line for the whole
   * update. It costs nothing to do properly — the windowed read already comes
   * back per audience (`WindowDenominator.audience`) and so do the stored month
   * rows — and a per-audience line is the one that makes the block's own point:
   * a window is not a period, whoever's conversation it was. Null where the
   * windowed read is not available.
   */
  contribution: { videos: number; of: number } | null
  /**
   * When this rival's line STARTS — the mock's "Poler since 3 Sep".
   *
   * `competitors.first_seen_at` (M1), and printed only where it falls inside
   * the months this page compares against: a rival tracked since April has the
   * same history as everybody else on this table and saying so is noise, while
   * a rival added three weeks ago has a shorter line than the rows above it and
   * a reader comparing the two needs to know. Null on the client's own row, on
   * the category, on a rival whose identity row is not there (M1 unapplied),
   * and on one tracked from before the window this page reads.
   */
  trackedSince: string | null
  /**
   * This row's analysed videos over the update's own analysed total — the
   * mock's share bar (`week.camein.col.share`).
   *
   * BOTH SIDES CARRIED, never a bare percentage: a level without its "of N" is
   * a score, and the block prints "360 of 508". It is a share of the UPDATE,
   * not of the month and not of the category — the one denominator on this
   * block that every row genuinely divides, which is why the bar is drawn on
   * `analysed` and not on `gathered` (gathered and analysed are two sets, not a
   * part and a whole).
   */
  share: { k: number; n: number }
  /**
   * Comments dated INSIDE the window under this audience's videos
   * (`week.camein.col.comments`).
   *
   * `WindowDenominator.comments` per audience — the figure the loader already
   * fetched and summed away into `CameInBlock.windowComments`. Null where the
   * windowed read is not installed here; 0 where it is and this audience drew
   * no comment in these days, which is a measurement and not a silence.
   */
  comments: number | null
}

/** The identities an update minted when it opened a new clustering regime. */
export interface Regrouped {
  /** The update's date (`WeekUpdate.date`). */
  update: string
  /** Theme identities it minted, every one of them a re-grouping. */
  themes: number
}

/** A theme first heard in this update that cleared the floor. */
export interface NewTheme {
  id: string
  label: string
  /** Videos carrying it in the month so far. */
  videos: number
}

/**
 * ONE rival post, by the only identity a post in this product has.
 *
 * THERE IS NO TITLE COLUMN. `videos` carries no title, so the mock's "Post"
 * column has nothing to print; identity here is what the row actually holds —
 * the platform, the account that posted it, the day it was uploaded, the
 * caption trimmed to a line, and the link. Four of those five are facts about
 * the POST and are dated by `videos.upload_date`, which is the video's own
 * clock and not a comment's; only `comments` is window-dated, and it says so.
 */
export interface RivalPost {
  platform: string
  /** The account that posted it, as the platform reports it. */
  account: string
  /** `videos.upload_date` — the POST's own date, never the update's and never
   *  a comment's. Null where the platform did not report one. */
  postedOn: string | null
  /** The caption, trimmed to one line. Empty where the post carries none. */
  caption: string
  href: string | null
  /**
   * Comments under THIS post dated inside the update's window
   * (`week.rivalposts.col.comments`), counted in `comments` rows we hold.
   *
   * NOT `videos.comments_count`, which is the platform's own current report and
   * is documented twice in this codebase as the opposite of a count of stored
   * comments — the weekly report's WR3 prints 106 / 1 / 0 where we hold
   * 95 / 0 / 0. This page's window is the days the update covered, so the count
   * is of comments written in those days, which is also what makes it
   * comparable with `AudienceRow.comments` beside it.
   */
  comments: number
  /** Posted on the brand's own account (`videos.source = 'competitor_owned'`):
   *  "their most-commented post" is picked from these. Optional, so a stored
   *  copy carries none. */
  own?: boolean
}

/** A rival's posts this update, with the distinction the design leaves unsaid
 *  said out loud: posts the rival MADE, and posts ABOUT the rival. */
export interface RivalPosts {
  audience: string
  label: string
  /** Posts on the rival's own tracked accounts. */
  byThem: number
  /** Videos this update read that NAME the brand unprompted, counted as the
   *  Brands page counts "Named unprompted" (lib/pages/week-brands.ts): the
   *  mention layer, in the month's market, the brand's own posts out, and every
   *  video any of our rival searches found out. 0 where `aboutNote` says why no
   *  figure prints. It was every video the rival searches gathered, before the
   *  relevance and brand checks (Freitag 149 against 7 on Brands). Never
   *  printed: the update's count measures our gathering (WK-42). */
  aboutThem: number
  /** Why "Named unprompted" prints no figure: "not counted yet", or the name's
   *  other meaning. Optional, so a stored copy carries none. */
  aboutNote?: string | null
  /**
   * The month's "Named unprompted" count over its one base, as Brands prints
   * it (T0 ruling U10; T0a review, finding 2): `k` videos naming the brand,
   * leaving out every video any of our rival searches found, of `n`, the
   * market's videos this month leaving those out. This week states an update
   * again against its month, so the month's figure is the one printed. Null
   * where no figure prints; optional, so a stored copy carries none.
   */
  namedMonth?: { k: number; n: number } | null
  /** The month's count "in all", which a copy stored before the U10 fix
   *  carries. NEVER PRINTED: it counted the videos our own per-brand searches
   *  fetched, so a brand we search harder read bigger. */
  aboutMonth?: number | null
  /** The videos our rival searches gathered under the brand's name this
   *  update, before any check: the "matched the name" note's count only.
   *  Optional, so a stored copy carries none. */
  foundByName?: number
  /**
   * Comments dated inside the window under THE POSTS NAMED BELOW, and under no
   * others.
   *
   * IT IS NOT THIS RIVAL'S TOTAL and must never be printed as one. It was
   * hard-coded to `0` from the day the field was written, which is the other
   * way to be wrong about it. Counting every comment under every one of a
   * rival's videos this update is a head count per video — a hundred round
   * trips on a live tenant to print one integer — so what is counted is what is
   * SHOWN: the sum over `posts`, which a reader can check by adding the column
   * up. `postsTotal` beside it says how many posts there were in all, so the
   * figure is never mistaken for the whole.
   */
  comments: number
  /**
   * The posts themselves — the mock's per-post table
   * (`week.rivalposts.col.post` / `.col.comments`), capped at
   * `RIVAL_POSTS_SHOWN` and ranked by the comments the window carried under
   * them.
   */
  posts: RivalPost[]
  /** How many posts this update found for this rival in all, of which `posts`
   *  are the shown few. `byThem + foundByName` (not `aboutThem`, which counts
   *  on the Brands page's basis), carried so the block never has to add two
   *  numbers to say "3 of 94". */
  postsTotal: number
  /** How many of those were WEIGHED — the widest-reaching `RIVAL_POSTS_CONSIDERED`,
   *  whose window comments were counted so the three with the most could be
   *  shown. The block prints it because a two-stage pick that says only "3 of
   *  94" is describing a rule it did not follow. */
  postsConsidered: number
  /** Present when the tenant has no handle for this rival, so `byThem` is 0
   *  because nothing is read and not because nothing was posted. */
  ownPostsUnread: boolean
  /** When we started tracking the brand (`competitors.first_seen_at`, M1), for
   *  the preview's "tracked since 6 Jul". Optional, so a stored copy carries
   *  none; null where the identity row is not there. */
  trackedSince?: string | null
  /** Settings' "Tracked since", word for word ("17 Sep", or "by 28 Jun"): the
   *  day the list last took the brand in, from the change log
   *  (lib/settings/search-set.ts `trackedSince`), so the two pages print one
   *  date. Optional, so a stored copy carries none and prints `trackedSince`. */
  since?: string | null
  /** "mostly the German word for Friday · not counted" where the brand's name
   *  has another meaning and production's hand check MEASURED it as noise
   *  (lib/brands/precision.ts, the front page's rule): its "about them" count
   *  is not printed. Never on an unmeasured name (the lead's R2 of 26 Sep:
   *  Freitag's note is gone everywhere; the Brands page prints its filed
   *  count plainly). Optional, so a stored copy carries none. */
  nameNote?: string | null
}

export interface CameInBlock {
  /** The window's own days, dated. */
  window: WeekWindow | null
  rows: AudienceRow[]
  gathered: number
  analysed: number
  /** Comments dated INSIDE the window. Never the same as comments gathered —
   *  a newly discovered YouTube video brings its whole back-thread. */
  windowComments: number | null
  /** Videos of the window that fall inside the month, and the month's total. */
  contribution: { videos: number; of: number } | null
  /** Set when the window reaches back into an earlier month. */
  crossesInto: string | null
  newThemes: NewTheme[]
  /** How many themes were first heard at all, before the floor. */
  newThemesSeen: number
  /**
   * Set when this update opened a new clustering regime: its
   * `pipeline_runs.clustering_key` differs from the previous themed update's
   * (market-first WP1.9). Every identity it minted is then a re-grouping, not
   * a theme heard for the first time, so `newThemes` is empty, `newThemesSeen`
   * is 0 and the minted identities are counted here. OPTIONAL, so a copy
   * stored before the field existed renders as it was.
   */
  regrouped?: Regrouped | null
  rivals: RivalPosts[]
  /** New quotes on the client's subjects, where subjects are recorded. */
  quotes: { subject: string; quote: Quote; cite: string; href: string | null }[]
  /** How many there were in all, of which the above are the shown few. */
  quotesTotal: number | null
  /** Why there are none, when the reason is the instrument and not the week. */
  quotesUnread: string | null
  playbookHref: string
  /** "With this update" on the market (WP3.7). Optional: a copy stored before
   *  WP3.7 has none, and prints its Phase 1 rows. */
  market?: MarketCameIn | null
}

/**
 * "With this update" on the market (market-first WP3.7; the approved
 * preview's This week and the weekly's WR1): what this update's days brought
 * into the month, by part of the market.
 *
 * THE MARKET IS THE CATEGORY AND THE BRANDS YOU TRACK (decision E): your own
 * posts are not in it. Each part is the window's reading clipped to `month`
 * (`window_denominators` per audience): videos with a comment dated in the
 * update's days in the month, and those comments. Counts that add to the
 * month, never a week alone (§9.1 #5): the lead line hands them back to the
 * month ("436 of the 654 videos September holds so far").
 *
 * ONE BUILDER, TWO SURFACES: This week and the weekly both call
 * `marketCameIn`, so the page and the email print the same counts for the same
 * update (WP3.7's done-when).
 */
export interface MarketCameIn {
  /** The month the counts are into: the one the update's window ends in. */
  month: string
  /** The update's date. */
  update: string
  category: { videos: number; comments: number }
  /** Null where the tenant tracks no brand. */
  brands: { videos: number; comments: number } | null
  /** The two together. */
  market: { videos: number; comments: number }
  /** The month's market so far (category and tracked brands pooled), or null
   *  where the month rows could not be read. */
  monthVideos: number | null
  /** Updates that have read the month so far, this one included. */
  updates: number | null
  /** Has the month ended at the reading? "holds so far" or "holds". */
  ended: boolean
}

/** One theme heard for the first time, as "Heard for the first time" prints it. */
export interface HeardTheme {
  registryId: string
  label: string
  /** Videos in the month, in the category, where themes are grouped (decision
   *  E). A theme heard for the first time has no earlier month by definition
   *  (Conversation's New, WP2.4), so it carries no month before. */
  k: number
  /** `theme_maker_shares`' maker share; null where not measured. */
  makerShare: number | null
  noiseShare: number | null
  /** Videos found only by searches first run in the month, of the theme's
   *  videos; null where not measured (never a zero). */
  provenance: { fromNewSearches: number; of: number } | null
}

/**
 * "Heard for the first time" (market-first WP3.7, `week.heard`; the weekly's
 * "New with this update"): the themes this update first heard that reached
 * the floor in the month, with where their videos came from and their maker
 * share, and the ones led by makers or set aside grouped (decision F).
 */
export interface HeardBlock {
  month: string
  prevMonth: string
  /** Themes first heard with the update, before the floor. */
  seen: number
  /** At the floor, not led by makers or set aside, largest first. */
  rows: HeardTheme[]
  makers: { count: number; lead: HeardTheme[] } | null
  setAside: { count: number; lead: HeardTheme[] } | null
  /** Set where the update opened a new clustering regime (WP1.9). */
  regrouped: Regrouped | null
  /** 'no_rule' for a tenant with no maker rule (Össur), 'unknown' where the
   *  shares could not be read. */
  segments: 'measured' | 'unknown' | 'no_rule'
}

/** One format or hook, with its n. */
export interface WorkedRow {
  /** The reader's label, already humanised by `workedLabel` — not the slug.
   *  Done in the loader so the email arm, which has no stylesheet to
   *  capitalise with, and the report get the same words as the page. */
  label: string
  videos: number
  /** Average engagement rate of that group, AS THE COLUMN STORES IT — a
   *  percentage, not a share. `videos.engagement_rate` is 3.8 for 3.8%, which
   *  is what every other surface prints straight through `fmtPct`. */
  engagement: number
  /** That average against the update's median video. */
  multiple: number
}

export interface WorkedBlock {
  formats: WorkedRow[]
  hooks: WorkedRow[]
  /** Videos with an engagement rate that this update analysed — the n behind
   *  the median everything above is read against. */
  rated: number
  /** Platforms excluded from the reading, by name. */
  excluded: string[]
  /**
   * YOUR OWN SIDE, MONTH TO DATE (Phase 1 Block D, D6 — `week.worked.yourhooks`).
   *
   * Everything above is the update's videos with no audience split at all —
   * yours, your rivals' and the category's pooled — so a client cannot see
   * their own hooks separately from the field's. This is the client half of
   * CO7 over the month the rest of this page is stated against, on the
   * PUBLISHED clock (`videos.upload_date`), which is why it carries its own
   * basis line: "5 of the 9 you published in September" is a different figure
   * from anything dated by a gather, and printing the two under one heading
   * without saying so is decision D9's defect.
   *
   * Null where the month's own posts were not read.
   */
  sides: { formats: FormatMatrix; hooks: FormatMatrix; coverageLine: string; basisLine: string } | null
  unread: string | null
}

/**
 * One comment worth answering — the mock's §2 row.
 *
 * A DATE, NEVER AN AGE. The Content page prints "3d", which is a distance from
 * the clock at page load; every other figure on this page is dated by the days
 * the update covered, and two clocks on one page is how "3d" comes to sit
 * beside "6–13 Sep" meaning something else. `shortDate(date)` is the same form
 * the quotes below it carry.
 *
 * THE REASON IS ON THE ROW. "Why it surfaced" was a link into a drawer on the
 * Content page, so the tile showed a quote with no account of why this quote;
 * the insight's own theme is one short string and it belongs beside the words
 * it explains.
 */
export interface ReplyRow {
  id: string
  intent: Intent
  /** The day the comment was written, ISO — the renderer prints it short. */
  date: string | null
  /** "under your post · 41 likes" / "under @handle’s post" — `contextLine`. */
  context: string
  /** The insight this comment was cited under, humanised: why it surfaced. */
  reason: string
  platform: string
  /** The comment, as a ref-carrying quote: the freeze/resolve walk drops an
   *  erased comment's whole row rather than leaving a citation over a gap. */
  quote: Quote
  /** Where a reply lands. Null on an awareness row by construction — a reply
   *  under someone else's post is an argument, not an answer. */
  href: string | null
  insightId: string
  /** The comment sits under a maker's own post (decision F, the segments_v1
   *  reader precedence): the preview's "a maker's own post" tag. Optional, so
   *  a stored copy carries none. */
  maker?: boolean
}

/** §2 and §8: the work queue, and the claims that are not one. */
export interface RepliesBlock {
  /** The rows worth answering, intent-ordered — buying, question, objection. */
  rows: ReplyRow[]
  /** Chip counts over `rows`, in intent order, zero counts dropped. */
  counts: { intent: Intent; count: number }[]
  /** How many the digest picked in all. A CAP, not a level: the digest takes
   *  at most three of a category and twelve in all, so this is never a share
   *  of anything and is never printed with an "of N". */
  total: number
  /** The awareness tail — misinformation, no reply link, counted apart. */
  flagged: ReplyRow[]
  /** The days the rows are dated in — the run's own window, printed as the
   *  block's basis. Null where the update carries no window. */
  window: WeekWindow | null
  /** Null where the digest was read; a sentence where it could not be. */
  unread: string | null
}

export interface CoverageBlock {
  /** The one line at the foot of the page. */
  line: string
  /** The privacy sentence the mock prints under it. */
  privacy: string
}

export interface WeekData {
  brand: string
  update: WeekUpdate
  window: WeekWindow | null
  /** The month the window ends in. */
  month: string
  monthStatus: MonthStatus
  readingAt: string
  /** "312 videos this week" — the page bar's own figure. Null when the
   *  windowed read is not available here. */
  windowVideos: number | null
  /** The next update the tenant's schedule promises, for the bar's one line
   *  ("comments written 10 to 20 Sep · next update Sun 27 Sep", 25 Sep
   *  rulings). Null where none is promised. Optional: a stored snapshot taken
   *  before market-first WP1.2 has none. */
  nextUpdate?: string | null
  /** No update for more than fourteen days: the line says "updates paused". */
  paused?: boolean
  unusual: UnusualBlock
  subjects: WeekSubjectsBlock
  /** Week by week (market-first decision M, part 1; WP2.9, `week.weeks`): the
   *  front page's bars on This week's clock. Absent on a copy stored before it,
   *  and where MF4 cannot be read. */
  weeks?: WeekVolumesBlock
  rising: RisingBlock
  cameIn: CameInBlock
  /** Heard for the first time (WP3.7, `week.heard`). Absent on a copy stored
   *  before it. */
  heard?: HeardBlock
  /** The reply inbox and the awareness flag — the mock's §2 and §8, read here
   *  since Block D wave 2 and still read on Content until that page retires. */
  replies: RepliesBlock
  sales: ForSalesData
  worked: WorkedBlock
  coverage: CoverageBlock
  /**
   * The method footnote every other surface carries (block D, D9) — NULL here,
   * always, and that is the finding rather than a gap.
   *
   * This week is the one surface dated by the DELIVERY rather than by the
   * month, and it already composes its own footer from the same facts:
   * `coverageLine` names who it was prepared for, which update, how long the
   * window was and the platform mix, and `coverage.privacy` is the identical
   * privacy sentence `methodLines` prints. A second footnote beside it would
   * state the coverage of a MONTH under a page whose every count is an
   * update's, which is the one confusion this page exists to prevent.
   *
   * The field is here so the seventeen artboard ports bind ONE name on every
   * page and This week's port falls through to `coverage`, and so that loading
   * `RecordInputs` — eight reads — is not added to a page that needs none of
   * it. See lib/reading/method.ts.
   */
  method: MethodLines | null
  /**
   * The reading layer's own caveats about the months this page compares, said
   * ONCE for the page.
   *
   * `MonthSeriesSet.notes` — the change-log boundary and the stretches of
   * months whose clustering was never recorded — merged across every series
   * read here. The Block A convention is one collapsed sentence for a run of
   * months and never one per bar, so these are printed at the foot of the page
   * exactly as Overview prints its own, and not inside §3.
   */
  notes: MonthLabel[]
}

// ---- the pure half -----------------------------------------------------------

const round1 = (n: number): number => Math.round(n * 10) / 10

/** "6–13 Sep 2026" — the window's own days, inclusive at the reader's end.
 *
 *  The window is half-open `[from, to)` everywhere it is arithmetic, and a
 *  reader does not read half-open intervals: "6–13 Sep" names the days the
 *  update covered. The end instant is printed as the day it falls ON, because
 *  a run that closed at 04:06 on the 13th covered comments written up to that
 *  moment and saying "6–12" would lose them. */
export function windowDays(w: WeekWindow | null): string | null {
  if (!w) return null
  return `${shortDate(w.from)} – ${shortDate(w.to)}`
}

/**
 * "this update's contribution to September so far: 205 of 449"
 *
 * THE SENTENCE THIS PAGE TURNS ON. Every other figure here is of a window, and
 * a window is not a period — so each count is handed back to the month it
 * belongs to, where the product's one clock can hold it. `of` is the month's
 * own denominator (a distinct-video count over the whole month, read from the
 * stored month rows) and `videos` is the part of it this update's window
 * carried, counted the same way over a narrower window. Neither is a sum of the
 * other, and that is why both come from a read rather than from arithmetic.
 */
export function contributionLine(month: string, videos: number, of: number): string {
  return `this update’s contribution to ${longMonth(month)} so far: ${fmtInt(videos)} of ${fmtInt(of)}`
}

/**
 * Every audience's contribution to the month, on ONE line.
 *
 * "this update's contribution to September so far, by audience: Your brand
 * 14 of 96 · Ottobock 47 of 118"
 *
 * THE RULE ON EVERY ROW, WITHOUT A LINE UNDER EVERY BAR (Block D wave 2,
 * design review F11). Each row of §4's table states counts of a WINDOW, and a
 * window is not a period, whoever's conversation it was — so each one is handed
 * back to the month it fell in. That was printed under each bar, which made a
 * row three lines, stopped the bars reading as a comparable column and wrapped
 * mid-phrase in a 236px cell. Said once, in a line the whole table shares,
 * every row is still restated and the column is a column again.
 *
 * Null where no row has a contribution — production today on both tenants,
 * where the windowed reading is not installed and the block says so in full
 * above the table.
 */
export function audienceContributionLine(
  month: string,
  rows: readonly { label: string; contribution: { videos: number; of: number } | null }[],
): string | null {
  const parts = rows
    .filter((r) => r.contribution != null)
    .map((r) => `${r.label} ${fmtInt(r.contribution!.videos)} of ${fmtInt(r.contribution!.of)}`)
  if (parts.length === 0) return null
  return `this update’s contribution to ${longMonth(month)} so far, by audience: ${parts.join(' · ')}`
}

/** "This update also covered 21 days of August." — printed only when the
 *  window reaches back past the month start, which a monthly cadence does
 *  every time (Sealand's newest update covers 11 Aug – 10 Sep). Without it the
 *  contribution line above silently drops two thirds of what was read. */
export function crossingLine(month: string, crossesInto: string): string {
  // Short form (copy de-clutter C29): the contribution line above already
  // names its month, so "counts only its September days" restated it.
  void month
  return crossedIntoLine(crossesInto)
}

/** The same fact where NO contribution was printed above it — production today,
 *  with the windowed reading unapplied.
 *
 *  `crossingLine` exists to qualify a contribution, and a sentence saying "the
 *  contribution above counts only its September days" printed under "this
 *  update's contribution to it cannot be stated" points a reader at a figure
 *  that is not on the page and contradicts the line before it. The crossing is
 *  still a fact about the window, so it is still said — alone. */
export function crossedIntoLine(crossesInto: string): string {
  return `This update also covered days of ${longMonth(crossesInto)}.`
}

/** "baseline forming: 1 of 3 months; the check starts with the November
 *  reading." — the design's wording, plus the one thing it leaves out: WHEN.
 *
 *  The month named is the month in which the third complete month will have
 *  been read, which is `monthsClearing` short of `required` counted forward
 *  from the month after the one being read. A reader told "forming" and nothing
 *  else has no way to know whether that is next month or next year. */
export function baselineFormingLine(baseline: BaselineState, month: string): string {
  const missing = Math.max(0, baseline.required - baseline.monthsClearing)
  let starts = month
  for (let i = 0; i < missing; i += 1) starts = nextMonth(starts)
  return `${baseline.label}; the check starts with the ${longMonth(starts)} reading.`
}

/** The month the check can first speak, or null when it already can. */
export function baselineStartsWith(baseline: BaselineState, month: string): string | null {
  if (baseline.ready) return null
  let starts = month
  for (let i = 0; i < Math.max(0, baseline.required - baseline.monthsClearing); i += 1) starts = nextMonth(starts)
  return starts
}

/**
 * "this month" while `month` is the month `asOf` falls in, and "in September"
 * once it has ended (deploy 1 review). From 1 to 15 Oct every reading page
 * reads an ended September, so "this month" would name October's. The weekly,
 * pinned to the calendar month until WP3.7, keeps "this month" by this rule,
 * so its preview stays byte for byte (the parity gate).
 */
export function monthPhrase(month: string, asOf: string): string {
  const m = monthStartOf(month)
  return monthStartOf(asOf) === m ? 'this month' : `in ${longMonth(m)}`
}

/**
 * What §4 says about themes first heard this update.
 *
 * Two sentences, and which one is printed is the whole point. Above the floor
 * it names what cleared; below it, it says the number it is NOT printing and
 * why — because "no new themes" would be false (303 were first heard) and "303
 * new themes" would be the clustering's churn dressed as a finding.
 */
export function newThemesLine(
  seen: number,
  shown: number,
  floor: number = NEW_THEME_FLOOR,
  regrouped: Regrouped | null = null,
  when = 'this month',
): string {
  if (regrouped) return regroupedLine(regrouped)
  if (seen === 0) return 'Nothing was heard for the first time in this update.'
  if (shown > 0) {
    return `${fmtInt(shown)} of the ${fmtInt(seen)} themes first heard in this update carried ${fmtInt(floor)} videos or more ${when}.`
  }
  return `${fmtInt(seen)} themes were heard for the first time in this update and none carried ${fmtInt(floor)} videos ${when}.`
}

/**
 * What §4 says when the update opened a new clustering regime (market-first
 * WP1.9): "Re-grouped with the 20 Sep update: 468 themes."
 *
 * The first update under a new regime re-groups the whole corpus, so the
 * registry matcher mints hundreds of identities that are not new
 * conversations (staging's 20 Sep update minted 468). Listing them as heard
 * for the first time would print the regrouping as news, so they are counted
 * here and named nowhere.
 */
// ---- "With this update" and "Heard for the first time" (WP3.7) ----------------

/** One audience's row of a window read, as `window_denominators` answers it. */
export interface AudienceCount {
  audience: string
  videos: number
  comments?: number | null
}

/**
 * "With this update" on the market, from the window read clipped to the month
 * (`MarketCameIn`). Null where the windowed read is not there: no count is
 * printed that nothing counted.
 *
 * YOUR OWN POSTS ARE NOT THE MARKET (decision E): the client's row is dropped,
 * and a brand is in only while it is tracked (`rivalAudiences`, the retired
 * left out), so the parts add up to the market row.
 */
export function marketCameIn(input: {
  month: string
  update: string
  read: readonly AudienceCount[] | null
  rivalAudiences: readonly string[]
  monthVideos: number | null
  updates: number | null
  now: string
}): MarketCameIn | null {
  if (!input.read) return null
  const rivals = new Set(input.rivalAudiences)
  const part = (keep: (audience: string) => boolean) => input.read!
    .filter((r) => keep(r.audience))
    .reduce((t, r) => ({ videos: t.videos + (r.videos ?? 0), comments: t.comments + (r.comments ?? 0) }), { videos: 0, comments: 0 })
  const category = part((a) => a === INDUSTRY_AUDIENCE)
  const brands = rivals.size > 0 ? part((a) => rivals.has(a)) : null
  const month = monthStartOf(input.month)
  return {
    month,
    update: input.update,
    category,
    brands,
    market: { videos: category.videos + (brands?.videos ?? 0), comments: category.comments + (brands?.comments ?? 0) },
    monthVideos: input.monthVideos,
    updates: input.updates,
    ended: monthStartOf(input.now) > month,
  }
}

/** How many updates have read `month` so far: those that finished in it, up to
 *  and including `upTo` (the update the page is about). */
export function updatesInto(month: string, instants: readonly string[], upTo: string): number {
  const from = Date.parse(`${monthStartOf(month)}T00:00:00.000Z`)
  const to = Date.parse(upTo)
  return instants.filter((i) => {
    const t = Date.parse(i)
    return Number.isFinite(t) && t >= from && t <= to
  }).length
}

/** How many grouped themes a group line names before it counts the rest. */
export const HEARD_GROUP_LEAD = 2

/**
 * "Heard for the first time", from the themes an update first heard at the
 * floor: the market's own conversations listed largest first, the ones half or
 * more makers' (or set aside as off-topic) grouped and counted (decision F, the
 * board's rule, `segmentOf`), each listed row with its maker share and how many
 * of its videos came from searches first run in the month. Pure.
 */
export function heardBlockOf(input: {
  month: string
  fresh: { seen: number; shown: readonly NewTheme[]; regrouped: Regrouped | null }
  segments: { maker: ReadonlyMap<string, number | null>; noise: ReadonlyMap<string, number | null> } | null
  segmentsState: HeardBlock['segments']
  provenance: ReadonlyMap<string, { fromNewSearches: number; of: number } | null>
}): HeardBlock {
  const month = monthStartOf(input.month)
  const base: HeardBlock = {
    month,
    prevMonth: previousMonthOf(month),
    seen: input.fresh.seen,
    rows: [],
    makers: null,
    setAside: null,
    regrouped: input.fresh.regrouped,
    segments: input.segmentsState,
  }
  if (input.fresh.regrouped) return { ...base, seen: 0 }
  const rows: HeardTheme[] = []
  const makers: HeardTheme[] = []
  const setAside: HeardTheme[] = []
  const ordered = [...input.fresh.shown].sort((a, b) => b.videos - a.videos || a.id.localeCompare(b.id))
  for (const t of ordered) {
    const theme: HeardTheme = {
      registryId: t.id,
      label: t.label,
      k: t.videos,
      makerShare: input.segments?.maker.get(t.id) ?? null,
      noiseShare: input.segments?.noise.get(t.id) ?? null,
      provenance: input.provenance.get(t.id) ?? null,
    }
    const seg = input.segments ? segmentOf(theme) : null
    if (seg === 'makers') makers.push(theme)
    else if (seg === 'noise') setAside.push(theme)
    else rows.push(theme)
  }
  const group = (list: HeardTheme[]) => (list.length > 0 ? { count: list.length, lead: list.slice(0, HEARD_GROUP_LEAD) } : null)
  return { ...base, rows, makers: group(makers), setAside: group(setAside) }
}

/**
 * THE ROWS THE BLOCK MAY CALL HEARD FOR THE FIRST TIME (T0a, mechanism 4;
 * WK-8/20/21): not a theme a third or more of whose month's videos came from
 * searches first run that month (`searchInflated`). That is our new search,
 * not new talk, so it is not listed, counted, flagged or anchored at all.
 * Read at render too, so a stored copy obeys it.
 */
export const heardRows = (h: Pick<HeardBlock, 'rows'>): HeardTheme[] => h.rows.filter((t) => !searchInflated(t.provenance))

/** Were any rows left out as our new searches' (`heardRows`)? Then "nothing
 *  was heard for the first time" is never said in their place. */
export const heardWithheld = (h: Pick<HeardBlock, 'rows'>): boolean => heardRows(h).length < h.rows.length

/** Every theme the block names or groups: the floor's whole count. */
export const heardAtFloor = (h: HeardBlock): number => heardRows(h).length + (h.makers?.count ?? 0) + (h.setAside?.count ?? 0)

/**
 * A reply row's context in the market's words (WP3.7; the approved preview):
 * a Reddit community is named as itself ("r/onebag"), not as an account's
 * post, and a video filed under a tracked brand says so ("filed under a brand
 * you track"), never "competitor".
 */
export function replyContextWords(context: string): string {
  return context
    .replace(/under @(r\/[^’']+)[’']s post/, '$1')
    .replace(/ · competitor\b/, ' · filed under a brand you track')
}

/** The month three months after `month`: where a baseline of three months
 *  that starts at `month` first answers. */
export function monthsAfter(month: string, n: number): string {
  let m = monthStartOf(month)
  for (let i = 0; i < n; i += 1) m = nextMonth(m)
  return m
}

export function regroupedLine(r: Regrouped): string {
  return `Re-grouped with the ${shortDate(r.update)} update: ${fmtInt(r.themes)} ${r.themes === 1 ? 'theme' : 'themes'}.`
}

/**
 * Did this update open a new clustering regime (market-first WP1.9)?
 *
 * YES WHEN ITS `clustering_key` DIFFERS FROM THE PREVIOUS THEMED UPDATE'S,
 * the complement of plan §4.2's `identityNewThisRun` ("that run's
 * clustering_key equals the previous themed run's"). A missing or empty key
 * reads as null: two null keys are equal (every run before the key existed,
 * and every run where the column is not applied), and a keyed update after a
 * null-keyed one differs, because nothing says the regime held. No previous
 * themed update (a tenant's first) opens nothing: there was no regime to
 * leave.
 *
 * THIS DEPARTS FROM `sameRegime`'S NULL RULE ON PURPOSE (lib/pipeline/
 * clustering.ts). There two nulls are never one regime and null then a key is
 * `unknown`, "not a break", which is right for a reading series that must not
 * compare across a regime it cannot see. It is wrong here: under it every
 * update of a null-keyed tenant (staging's, and the paused Össur's) would
 * re-group, and "heard for the first time" would never print for them. And
 * the key's first appearance IS a new regime: the 27 Sep run is the first
 * with `ownPostAudience` in the key (24 Sep), so "Re-grouped with the 27 Sep
 * update" is the intended outcome, not a false positive.
 *
 * ONE LINE ON TWO PAGES ONLY IF BOTH CALL THIS. The front page and this page
 * draw the same line between a re-grouping and a new theme only while WP1.6's
 * `identityNewThisRun` and WP2.7's arrivals block call `opensClusteringRegime`
 * rather than `sameRegime`; with `sameRegime`, staging's null-keyed updates
 * would count as re-grouped on the front page and not here.
 */
export function opensClusteringRegime(
  current: string | null | undefined,
  previous: { key: string | null | undefined } | null,
): boolean {
  if (previous == null) return false
  const norm = (k: string | null | undefined): string | null => (k == null || k === '' ? null : k)
  return norm(current) !== norm(previous.key)
}

/**
 * What §4 does with the identities an update minted (market-first WP1.9): the
 * re-grouped count when the update opened a new clustering regime, else null,
 * which keeps "heard for the first time".
 *
 * THE LOADER'S WHOLE DECISION, PURE. `loadNewThemes` reads the minted ids and
 * the previous themed update's regime (`previousThemedRegime`) and hands both
 * here, so the branch a staging render never reaches (every staging update so
 * far carries a null key, and null equals null) is tested on its own. Nothing
 * minted is nothing re-grouped.
 */
export function regroupedFor(
  ids: readonly string[],
  regime: { clusteringKey: string | null | undefined; date: string },
  previous: { key: string | null | undefined } | null,
): Regrouped | null {
  if (ids.length === 0) return null
  return opensClusteringRegime(regime.clusteringKey, previous) ? { update: regime.date, themes: ids.length } : null
}

/** "above typical" / "about typical" — the mock's tag on a subject row.
 *
 *  NOT A DIRECTION WORD. It compares this update's contribution with what an
 *  update of this workspace usually contributes, which is a level against a
 *  level, and it is printed inside a verdict node with its band. "Above" and
 *  "below" are not in the direction vocabulary for exactly this reason: they
 *  say where a number sits, not which way it is going. */
export function typicalTag(added: number | null, typical: number | null): string | null {
  if (added == null || typical == null || typical <= 0) return null
  const ratio = added / typical
  if (ratio >= 1.25) return 'above typical'
  if (ratio <= 0.75) return 'below typical'
  return 'about typical'
}

/**
 * What an update that treated this subject like everything else would have
 * added to it.
 *
 * `monthVideos × (updateVideos ÷ monthOf)` — the subject's size in the month
 * so far, scaled by how much of the month this update carried. Every input is
 * read: two off the stored month rows, two off the windowed read clipped to the
 * month, all four in the CLIENT's audience, which is the audience the subject
 * rows are of. Null wherever one of them cannot answer, because a typical
 * computed off a missing denominator is an invention.
 */
export function typicalContribution(input: {
  /** The subject's videos in the month so far, in the client's audience. */
  monthVideos: number
  /** The month's own client-audience denominator. */
  monthOf: number
  /** This update's client-audience videos, clipped to the month. */
  updateVideos: number | null
}): number | null {
  if (input.updateVideos == null) return null
  if (input.monthOf <= 0) return null
  return input.monthVideos * (input.updateVideos / input.monthOf)
}

/**
 * "2 of your 3 subjects ran above typical in this update" — the mock's §2 lead
 * (`weekly.s2.lead`).
 *
 * THE MOCK'S SENTENCE IS "Three of the six ran above a typical week" AND HALF
 * OF IT IS REFUSED. "A typical week" would need a weekly series per subject,
 * which is a period series at a cadence this product does not key on; what
 * survives is the count, its denominator, the names, and — in the same breath —
 * the basis the tag was earned on, because a tag printed without it is the
 * score this product does not show.
 *
 * ROWS WITH NO TAG ARE NOT IN THE DENOMINATOR AND THE SENTENCE SAYS SO. A
 * subject the window read cannot answer for has not been compared, and folding
 * it into "of 6" would count a silence as a comparison that came back "not
 * above".
 */
/**
 * Subject videos summed over the market's audiences (the category and the
 * tracked brands; decision E), by subject id: the client's own posts and any
 * audience not tracked are left out, and an audience named twice for one
 * subject is counted once. Audiences are disjoint, so their counts add.
 */
export function pooledSubjectCounts(
  rows: readonly { audience: string; subject_id: string; videos: number }[],
  rivalAudiences: readonly string[],
): Map<string, number> {
  const audiences = new Set(marketAudiences(rivalAudiences))
  const seen = new Set<string>()
  const out = new Map<string, number>()
  for (const r of rows) {
    const key = `${r.subject_id}\u0000${r.audience}`
    if (!audiences.has(r.audience) || seen.has(key)) continue
    seen.add(key)
    out.set(r.subject_id, (out.get(r.subject_id) ?? 0) + (Number.isFinite(r.videos) && r.videos > 0 ? r.videos : 0))
  }
  return out
}

/**
 * What an update's own days put into each subject in the month, on the market
 * (market-first WP2.7, C7): `window_subject_readings` over the window clipped
 * to the month, pooled (`pooledSubjectCounts`). The weekly's WR2 prints it as
 * "+N videos since the last update"; This week's rows read the same days
 * (`clipToMonth`) and pool the same way (`pooledSubjectCounts`). Null where the windowed read cannot answer (M4 not
 * applied, or no window), never zeros.
 *
 * AND NULL WHERE NO DAY OF THE WINDOW FALLS IN THE MONTH (the deploy-3
 * review; both ends since the WP3.7 check): the weekly reads the reading
 * month, so from 1 to 15 Oct it reads September while the 11 Oct update's days
 * are all October's, and "+N" there would print October's arrivals beside
 * September's rows (a "+0" on every row, the other way round, would say the
 * market was silent). The row then prints "·".
 */
export async function marketSubjectArrivals(
  reading: ReadingHandle,
  clientId: string,
  window: { from: string; to: string } | null,
  month: string,
  rivalAudiences: readonly string[],
): Promise<Map<string, number> | null> {
  if (!window) return null
  const days = clipToMonth(window, month)
  if (!days) return null
  const rowsIn = await readSubjectWindow(reading, clientId, days)
  return rowsIn ? pooledSubjectCounts(rowsIn, rivalAudiences) : null
}

/** An update's days inside a month, or null when none fall there: the window
 *  from the month's first day to the next month's, so a count read over it
 *  adds to that month. BOTH ENDS (WP3.7 check): the weekly reads the reading
 *  month, which on 1 to 15 of a month is the month BEFORE the update's days,
 *  and an unclipped end printed October's arrivals beside September's rows. */
export function clipToMonth(window: { from: string; to: string }, month: string): { from: string; to: string } | null {
  const m = monthStartOf(month)
  const next = nextMonth(m)
  if (window.to <= m || window.from >= next) return null
  return { from: window.from < m ? m : window.from, to: window.to > next ? next : window.to }
}

/** What `marketSubjectsOf` takes: the month's stored subject rows and this
 *  update's windowed rows (every audience; it pools), the market's
 *  denominators, and the loader's answers about each subject. */
export interface MarketSubjectsInput {
  /** The confirmed subjects (`status = 'active'` are read; others are left out). */
  subjects: readonly { id: string; name: string; status: string }[]
  /** Decision C's state per subject (`subjectCalibration`). */
  calibrationOf: ReadonlyMap<string, SubjectCalibration>
  /** Subjects the month was not read for (default M-a), and their words. */
  unread: ReadonlySet<string>
  unreadWords: string
  month: string
  /** `month_subject_readings` for the month, every audience. */
  stored: readonly { audience: string; subject_id: string; videos: number }[]
  /** `window_subject_readings` over the update's days inside the month, every
   *  audience; null where the windowed read cannot answer. */
  added: readonly { audience: string; subject_id: string; videos: number }[] | null
  /** The market by month (`pooledDenominators`). */
  counts: ReadonlyMap<string, MarketCount>
  /** The tracked rivals' audience keys (`marketRivalAudiences`). */
  rivalAudiences: readonly string[]
}

/**
 * This week's subjects on the market (market-first WP2.7, plan §2.7: "Looks &
 * style: {k} in September, +{j} with this update").
 *
 * EVERY CONFIRMED SUBJECT THAT CAN PRINT A FIGURE IS A ROW (decision C): a
 * ready subject as read, a provisional one with its market figure marked
 * "provisional" and no verdict. A subject being re-described, and one the
 * month was not read for, is named with its words and no figure (`withheld`).
 * No "you" side: the client's own nine videos a month cannot carry a subject,
 * and on Sealand they printed "0 of 0 videos" on seven rows (GR F41).
 *
 * POOLED AS THE FRONT PAGE POOLS (decision E, `marketSubjectSide`): the
 * category plus the tracked brands, over the market's videos in the month. The
 * update's own count is pooled over the same audiences, so the two numbers on
 * a row are of one market. Ranked by the market's videos, largest first.
 *
 * PURE: the loader reads, this decides.
 */
export function marketSubjectsOf(input: MarketSubjectsInput): Pick<WeekSubjectsBlock, 'rows' | 'withheld' | 'market'> {
  const month = monthStartOf(input.month)
  const added = input.added ? pooledSubjectCounts(input.added, input.rivalAudiences) : null
  const stored = input.stored.map((r) => ({ month, audience: r.audience, subject_id: r.subject_id, videos: r.videos }))
  const active = input.subjects.filter((s) => s.status === 'active')
  // ONLY A READY SUBJECT IS A ROW WITH FIGURES (T0a, WK-26; ruling U6): a
  // provisional one is named among the withheld, with no figure and no word,
  // as a failed one is.
  const withheldOf = (id: string): boolean => input.calibrationOf.get(id) !== 'ready' || input.unread.has(id)
  const rows: SubjectWeekRow[] = active
    .filter((s) => !withheldOf(s.id))
    .map((s) => {
      // READ, SO ABSENCE IS ZERO: the loader's read-in test has already put
      // every subject the month was not read for among the withheld.
      const side = marketSubjectSide(stored, input.counts, s.id, month, input.rivalAudiences, { read: true })
      const thisUpdate = added ? added.get(s.id) ?? 0 : null
      const calibration: SubjectCalibration = input.calibrationOf.get(s.id) === 'ready' ? 'ready' : 'provisional'
      return {
        id: s.id,
        label: s.name,
        calibration,
        // THE LEGACY FIELDS CARRY THE MARKET'S NUMBERS, so a reader of the
        // shape that predates WP2.7 (a figure table, a slide) reads the same
        // counts the row prints, never the client's.
        monthVideos: side.k ?? 0,
        monthOf: side.n ?? 0,
        addedVideos: thisUpdate,
        typical: null,
        tag: null,
        verdict: null,
        market: {
          monthSoFar: { k: side.k, n: side.n, pct: side.pct, verdict: null, observed: side.k != null },
          thisUpdate,
        },
      }
    })
    .sort((a, b) => (b.market?.monthSoFar.k ?? -1) - (a.market?.monthSoFar.k ?? -1) || a.label.localeCompare(b.label))
  const withheld = active
    .filter((s) => withheldOf(s.id))
    .map((s) => {
      const calibration = input.calibrationOf.get(s.id) ?? 'provisional'
      // A FAILED SUBJECT SAYS "being re-described" whether or not the month
      // was read for it; one the month missed says when it will be.
      return calibration === 'ready' && input.unread.has(s.id)
        ? { id: s.id, label: s.name, calibration, unread: input.unreadWords }
        : { id: s.id, label: s.name, calibration }
    })
  return { rows, withheld, market: { month, n: input.counts.get(month)?.videos ?? null } }
}

export function subjectLead(rows: readonly SubjectWeekRow[], _month: string, named: number = rows.length): string | null {
  const tagged = rows.filter((r) => r.tag != null)
  if (tagged.length === 0) return null
  const above = tagged.filter((r) => r.tag === 'above typical')
  // `named` counts every confirmed subject, the withheld ones too (decision C):
  // "your 5 subjects" is false of a workspace that named 8.
  const of = tagged.length === named
    ? `your ${fmtInt(tagged.length)} ${tagged.length === 1 ? 'subject' : 'subjects'}`
    : `the ${fmtInt(tagged.length)} of your ${fmtInt(named)} subjects this update could be read against`
  // The definition of "above typical" is the legend's, beside the bars
  // (copy de-clutter C54); the lead keeps the count, the denominator, the names.
  if (above.length === 0) return `None of ${of} ran above typical in this update.`
  return `${fmtInt(above.length)} of ${of} ran above typical in this update: ${namesOf(above.map((r) => r.label))}.`
}

/** Up to three names, then "and N more" — never a list that runs off the line. */
function namesOf(labels: readonly string[]): string {
  const shown = labels.slice(0, 3)
  const rest = labels.length - shown.length
  const joined = shown.length === 1
    ? shown[0]
    : `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`
  return rest > 0 ? `${joined} and ${fmtInt(rest)} more` : joined
}

/** A caption standing in for the title `videos` has no column for. One line,
 *  whitespace collapsed, cut on a word. */
/**
 * "six subjects named 19 Aug" — how long this page's subject rows have been
 * measured at all.
 *
 * IT IS A NAMING DATE, NOT A START OF EVIDENCE (D14). `subjects.named_at` is
 * the day somebody typed the subject into Settings, which is exactly what the
 * mock claims; what it is NOT is the day the conversation about it started, and
 * the line says "named" rather than "since" so the two cannot be read as one.
 */
export function subjectsNamedLine(namedAt: readonly (string | null)[]): string | null {
  const dates = namedAt.filter((d): d is string => typeof d === 'string' && d.length > 0).sort()
  if (dates.length === 0) return null
  const noun = dates.length === 1 ? 'subject' : 'subjects'
  const day = (iso: string) => iso.slice(0, 10)
  return day(dates[0]) === day(dates[dates.length - 1])
    ? `${fmtInt(dates.length)} ${noun} named ${shortDate(dates[0])}`
    : `${fmtInt(dates.length)} ${noun}, the first named ${shortDate(dates[0])}`
}

export function postCaption(caption: string | null, chars: number = RIVAL_CAPTION_CHARS): string {
  const flat = (caption ?? '').replace(/\s+/g, ' ').trim()
  if (flat.length <= chars) return flat
  const cut = flat.slice(0, chars)
  const space = cut.lastIndexOf(' ')
  return `${(space > chars * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`
}

/** The foot of the page: who it is for, which update, what it covered.
 *
 *  Composed here rather than in the block so the weekly report's own coverage
 *  line (WR6) is the same sentence and not a second one. */
export function coverageLine(input: {
  brand: string
  update: string
  previous: string | null
  window: WeekWindow | null
  platformMix: PlatformMix
  videos: number | null
  comments: number | null
}): string {
  const parts = [`Prepared for ${input.brand} with Verbatim`, `update of ${shortDate(input.update)}`]
  parts.push(input.previous ? `previous ${shortDate(input.previous)}` : 'no previous update')
  const days = windowDays(input.window)
  if (days) parts.push(days)
  const mix = platformMixLine(input.platformMix)
  if (mix) parts.push(mix)
  if (input.videos != null) parts.push(`${fmtInt(input.videos)} videos`)
  if (input.comments != null) parts.push(`${fmtInt(input.comments)} comments`)
  return parts.join(' · ')
}

export const PRIVACY_LINE =
  'Commenters are never identified; quotes carry platform and date only.'

/**
 * The figures a block declares for one flag, by token. Exported so the
 * first-screen budget is counted over the same table the block prints.
 *
 * AND SO THE MODEL'S OWN KEYS RESOLVE. The explainer is told to cite every
 * figure as a `[[placeholder]]` and is handed the check's table
 * (`lib/pipeline/anomaly-check.ts anomalyFigures`), which is where
 * `flag_N_week_share` and `flag_N_baseline_share` come from — the two keys the
 * paragraph is most likely to cite, because the shares are what the flag IS.
 * A key this table lacks drops its sentence whole at render
 * (`substituteFigures`), so the two tables have to name the same things: these
 * are computed from the same k and n the check divided, not stored twice.
 */
export function flagFigures(flag: UnusualFlag, n: number): FigureTable {
  const k = `flag_${n}`
  // em-dash-ok: FigureTable labels below are record keys, never printed
  return {
    [`${k}_week_share`]: { value: round1(share(flag.week.k, flag.week.n)), unit: 'pct', label: `${flag.label} — share of this update` }, // em-dash-ok: FigureTable label
    [`${k}_baseline_share`]: { value: round1(share(flag.baseline.k, flag.baseline.n)), unit: 'pct', label: `${flag.label} — share across the three months behind it` }, // em-dash-ok: FigureTable label
    [`${k}_week_videos`]: { value: flag.week.k, unit: 'videos', label: `${flag.label} — videos this update` }, // em-dash-ok: FigureTable label
    [`${k}_week_of`]: { value: flag.week.n, unit: 'videos', label: `${flag.label} — videos this update covered` }, // em-dash-ok: FigureTable label
    [`${k}_baseline_videos`]: { value: flag.baseline.k, unit: 'videos', label: `${flag.label} — videos across the three months behind it` }, // em-dash-ok: FigureTable label
    [`${k}_baseline_of`]: { value: flag.baseline.n, unit: 'videos', label: `${flag.label} — videos in those months` }, // em-dash-ok: FigureTable label
    [`${k}_change`]: { value: round1(flag.changePts), unit: 'pts', label: `${flag.label} — the difference` }, // em-dash-ok: FigureTable label
    [`${k}_band`]: { value: round1(flag.bandPts), unit: 'pts', label: `${flag.label} — the band it cleared` }, // em-dash-ok: FigureTable label
  }
}

// ---- the loader --------------------------------------------------------------

interface RunRow {
  id: string
  status: string
  started_at: string | null
  completed_at: string | null
  /** The regime the update clustered under (M2). Absent where the column is
   *  not applied, which `select('*')` returns as a missing key. */
  clustering_key?: string | null
  window_start?: string | null
  window_end?: string | null
  window_basis?: string | null
}

interface CheckRow {
  run_id: string
  week_start: string | null
  week_end: string | null
  outcome: string
  reason: string | null
  note: string
  set_size: number | null
  tested: number | null
  flagged_count: number | null
  update_videos: number | null
  median_videos: number | null
}

interface FlagRow {
  run_id: string
  object_kind: string
  object_id: string
  label: string
  denominator: string
  week_k: number
  week_n: number
  baseline_k: number
  baseline_n: number
  baseline_months: string[] | null
  baseline_filling_months: string[] | null
  baseline_regime: string | null
  change_pts: number
  band_pts: number
  rank: number
  flagged_count: number
  explanation: { sentences?: string[] } | null
  explanation_model: string | null
  quote_refs: unknown
}

interface VideoRow {
  id: string
  platform: string
  video_id: string
  run_id: string | null
  analyzed_run_id: string | null
  is_client: boolean | null
  is_competitor: boolean | null
  competitor_name: string | null
  source: string | null
  engagement_rate: number | string | null
  hook_style: string | null
  classified_type: string | null
  // The post's own identity, for §5's rival table. `videos` has no title
  // column, so this is what a post IS here. Its caption and link are not on
  // this row: they are read for the posts the table weighs (`loadPostText`).
  account_name: string | null
  upload_date: string | null
  views: number | null
}

/** The two columns of a rival post that only the posts §4 weighs need. */
interface PostText {
  caption: string | null
  video_url: string | null
}

/**
 * This week, for one tenant.
 *
 * Null is the first-run empty state: a workspace with no delivered update has
 * no week to read, and the page says so rather than drawing seven refusals.
 */
export async function loadWeek(scope: Scope): Promise<WeekData | null> {
  const supabase = scope.supabase as SupabaseClient
  const { clientId } = scope
  const reading: ReadingHandle = scope.reading
  const readingAt = new Date().toISOString()

  // ── wave 1: who this is, and which update this is a reading of ─────────
  const [clientRes, runsRes, runningIds, rivals, schedule] = await Promise.all([
    supabase.from('clients').select('company_name').eq('id', clientId).maybeSingle(),
    // `select('*')` for the window columns, not a column list: they are applied
    // by hand and a deploy can reach a database that has not had them yet, in
    // which case an absent column arrives as an absent key rather than a 42703
    // that takes the page down (lib/reading/read.ts keeps the same rule). Two
    // rows and a plain `limit`, never `selectAll`: this page reads the newest
    // update and the one before it, and paging a query that already knows how
    // many rows it wants is a second round trip for nothing.
    supabase.from('pipeline_runs').select('*')
      .eq('client_id', clientId).in('status', ['completed', 'partial'])
      .order('started_at', { ascending: false }).limit(2),
    fetchRunningRunIds(supabase, clientId, 'week'),
    loadRivals(supabase, clientId),
    // For the bar's "next update" (market-first WP1.2). One small row.
    loadReadingSchedule(supabase, clientId),
  ])
  const runsRaw = rows<RunRow>(runsRes, 'week.runs')
  const client = row<{ company_name: string | null }>(clientRes, 'week.client')
  const brand = client?.company_name ?? 'Your brand'
  const anchor = runsRaw[0]
  if (!anchor) return null

  const update: WeekUpdate = {
    id: anchor.id,
    date: anchor.completed_at ?? anchor.started_at ?? readingAt,
    previous: runsRaw[1]?.completed_at ?? runsRaw[1]?.started_at ?? null,
    status: anchor.status,
  }
  const stored = rowWindow(anchor)
  const window: WeekWindow | null = stored?.start && stored.end
    ? { from: stored.start, to: stored.end, basis: stored.basis }
    : null

  // THE MONTH IS THE ONE THE WINDOW ENDS IN, not the one it starts in. A
  // thirty-day window crosses a boundary every time, and the month a reader is
  // being told about is the one still filling.
  const month = monthStartOf(window?.to ?? update.date)
  const monthStatus = freezeStateFor(month, readingAt)
  const audiences = [CLIENT_AUDIENCE, ...rivals.map((r) => rivalKey(r.name)), INDUSTRY_AUDIENCE]

  // ── two sections' reads, started beside wave 2 ─────────────────────────
  // §2's reply queue and §5's citations are the two longest chains on the
  // page (the corpus's current insights, their evidence, the comments behind
  // it, the videos those sit under: four reads deep, three seconds each on
  // staging), and neither needs wave 2 to start. The reply queue wants this
  // update's videos only for the posters' roles, at its last step, so it takes
  // them as a promise; §5 wants the window's video count and the subjects only
  // to label its block, so its citations start here and the block is built in
  // the sections' wave below. Waiting for wave 2 made the page as long as wave
  // 2 plus the longer of the two (Sealand on staging, 27 Sep: 4.4 s; started
  // here, 3.8 s).
  const videosAhead = loadUpdateVideos(supabase, clientId, anchor.id)
  // THE QUOTE GATE (walkthrough, 29 Sep; lib/quote-gate.ts) on This week's
  // quotes: the reply queue, the flagged-for-awareness rows and For Sales.
  // The weekly report's own calls (`loadWeekParts`) do not pass it.
  const repliesAhead = buildReplies({ supabase, clientId, runId: anchor.id, window, videos: videosAhead, gate: true })
  const salesCitationsAhead = window ? loadSalesCitations(supabase, clientId, window) : undefined
  // Awaited in the sections' wave; this only keeps a failure that lands before
  // then from being an unhandled rejection. That wave still rejects with it.
  salesCitationsAhead?.catch(() => {})

  // ── wave 2: the readings ───────────────────────────────────────────────
  const [check, flags, monthSet, windowRead, monthWindowRead, videos, themedRunId, subjects, series, judge] =
    await Promise.all([
      loadCheck(supabase, clientId, anchor.id),
      loadFlags(supabase, clientId, anchor.id),
      // The month being read plus the three complete months behind it — the
      // baseline the anomaly check pools, and the baseline §3 reads a riser
      // against. Four months of stored rows is a cheap indexed read.
      loadMonthSeries(reading.client, clientId, { from: backMonths(month, BASELINE_MONTHS), to: month, audiences }),
      window ? loadWindowReading(reading.client, clientId, { from: window.from, to: window.to }) : null,
      // The window clipped to the month, which is what the contribution line
      // counts. Identical to the call above whenever the window sits inside one
      // month, and the only honest answer when it does not.
      window && window.from < month ? loadWindowReading(reading.client, clientId, { from: month, to: window.to }) : null,
      videosAhead,
      fetchThemedRunId(supabase, clientId, runningIds, 'week'),
      loadSubjects(supabase, clientId),
      // THE ONE SERIES THIS PAGE IS ALLOWED, and it is a series of UPDATES —
      // our own cadence — never of weeks (lib/reading/updates.ts). It reads its
      // own runs rather than taking `runsRaw` above: that read asks for two
      // rows and this one asks for thirteen, and a loader that quietly widened
      // the first to serve the second would make the page's anchor depend on
      // the chart's point count.
      loadUpdateSeries(scope).catch((error) => {
        console.error(`[pages] week.series: ${(error as { message?: string })?.message ?? String(error)}`)
        return null
      }),
      // THE MONTH-PAIR JUDGE (decision D, WP1.3): §3 compares this month with
      // the months behind it only where they were read the same way. It fails
      // closed (every pair refused) and never rejects, so a read error here
      // cannot take the page down.
      loadAppPairOn(reading, readingAt),
    ])

  const denominators = monthSet.denominators
  const monthVideos = sumMonth(denominators, month)
  const windowVideos = totalVideos(windowRead?.denominators ?? null)
  const contributionVideos = monthWindowRead
    ? totalVideos(monthWindowRead.denominators)
    : windowVideos

  // ── §§1-5, TOGETHER ────────────────────────────────────────────────────
  // Five sections, each of which reads. They were awaited one after another,
  // and not one of them takes another's output — every input below comes off
  // wave 2 or off the arithmetic between. Measured against production, §5's
  // cited comments alone are nine seconds of waiting; done in sequence behind
  // four other sections that also wait, This week took 13-20 s while its
  // database was idle most of it. (The reads they share are read once: the
  // reading layer's memo is keyed on the client, so two sections asking for the
  // same labels or the same change log ask once.)
  const baseline = pooledBaseline(denominators, month, windowVideos ?? 0)
  const contributionRead = (monthWindowRead ?? windowRead)?.denominators ?? null
  // THE BAR'S CLOCK, off the two runs already read: "as at" is the last
  // update, never the wall clock, and a paused tenant is promised nothing.
  // Read before the sections, because §2's words for a subject the month was
  // not read for depend on whether an update will read it (`unreadWords`).
  const clock = updateClock({
    now: readingAt,
    runs: runsRaw.filter((r): r is RunRow & { started_at: string } => r.started_at != null),
    schedule,
  })
  // WEEK BY WEEK (WP2.9, `week.weeks`): the front page's bars on This week's
  // clock, the weeks of the update's month and the month before through the
  // current week. One read of MF4 beside the sections; the runs and the change
  // log are the memoised reads the page's readers already made.
  const deliveredAhead = loadDeliveredRuns(supabase, clientId)
  const weeksAhead = Promise.all([deliveredAhead, loadChanges(reading.client, clientId)])
    .then(([delivered, changeRows]) => loadWeekVolumes({
      client: reading.client,
      clientId,
      reading: { month },
      now: readingAt,
      updates: delivered.map(updateInstant),
      rivalAudiences: marketRivalAudiences(rivals),
      changeRows,
      schedule,
    }))
    .catch((error: unknown) => {
      console.error(`[pages] week.weeks: ${(error as { message?: string })?.message ?? String(error)}; not drawn`)
      return null
    })
  // HEARD FOR THE FIRST TIME (WP3.7, `week.heard`), beside the sections: §4's
  // lead line counts its themes, so it is started here and taken there.
  const heardAhead = loadHeard({
    supabase, client: reading.client, clientId, runId: anchor.id, month, themedRunId,
    regime: { clusteringKey: anchor.clustering_key, startedAt: anchor.started_at, date: update.date },
  })
  // "WITH THIS UPDATE" ON THE MARKET (WP3.7): the window read clipped to the
  // month, pooled over the market's audiences (decision E), handed back to the
  // month's market so far and the updates that have read it. No new read: the
  // window read, the month rows and the delivered runs are the page's own.
  const rivalAudiences = marketRivalAudiences(rivals)
  const marketCount = pooledDenominators(denominators, rivalAudiences).get(month) ?? null
  const delivered = await deliveredAhead.catch(() => null)
  const market = marketCameIn({
    month,
    update: update.date,
    read: contributionRead,
    rivalAudiences,
    monthVideos: marketCount?.videos ?? null,
    updates: delivered ? updatesInto(month, delivered.map(updateInstant), update.date) : null,
    now: readingAt,
  })
  // The unusual-week check's baseline on comparable months (WP3.7): the
  // memoised pair rows and change log the judge read.
  const comparableAhead = comparableBaselineOf(reading, clientId, month, readingAt)
  const [unusual, subjectsBlock, risingRead, cameIn, replies, sales, ownPublished] = await Promise.all([
    // ── §1 · unusual this week ───────────────────────────────────────────
    buildUnusual({
      supabase, clientId, check, flags, baseline, month, series,
    }),
    // ── §2 · this week in your subjects ──────────────────────────────────
    buildSubjects({
      reading, clientId, subjects, month, window,
      // The market's denominators (decision E), off the month rows this page
      // already read: no new read.
      denominators,
      rivalAudiences: marketRivalAudiences(rivals),
      readIn: {
        writtenAt: monthsWrittenAt(denominators, new Set(marketAudiences(marketRivalAudiences(rivals)))).get(month) ?? null,
        unreadWords: unreadWords({ month, filling: monthStatus === 'filling', nextUpdate: clock.nextUpdate }),
      },
    }),
    // ── §3 · rising now ──────────────────────────────────────────────────
    buildRising({
      supabase, reading, clientId, month, window, themedRunId,
      monthOf: sumAudienceMonth(denominators, month, INDUSTRY_AUDIENCE),
      denominators,
      pair: judge,
    }),
    // ── §4 · what came in ────────────────────────────────────────────────
    buildCameIn({
      supabase, clientId, runId: anchor.id, window, month, videos, rivals,
      windowRead,
      // The window clipped to the month where it crosses one, and the window
      // itself where it does not — per audience, which is what the plan's
      // per-row contribution line needs and what the RPC already returns.
      contributionRead,
      contributionVideos, denominators, monthVideos, subjects, themedRunId,
      heard: heardAhead,
      market,
      // On the reading client, as Your market and Brands read it: the market
      // RPC is not granted to a tenant's own session (lib/pages/week-brands.ts).
      brandLayer: loadUpdateBrandLayer(reading.client, clientId, month, marketAudiences(rivalAudiences)),
      changes: loadChanges(reading.client, clientId),
    }),
    // ── §2 · worth a reply, and §8 · flagged for awareness ───────────────
    // Started beside wave 2 (above): it reads the corpus's current insights,
    // their evidence and the comments behind them, and it takes no output of
    // any section above it.
    repliesAhead,
    // ── §5 · for sales ───────────────────────────────────────────────────
    buildSales({ supabase, clientId, window, windowVideos, subjects, citations: salesCitationsAhead, gate: true }),
    // ── §6's own side ────────────────────────────────────────────────────
    // ONE NARROW READ, IN THE WAVE. The client's own posts in the month are
    // tens of rows on every tenant we have, and §6 is the only section that
    // wants them; a failure here leaves the pooled reading intact and the
    // split absent, which is the honest degradation. It needs the month and
    // nothing else, so it no longer waits for the sections to finish before
    // it starts (one round trip at the end of every load).
    loadOwnPublishedVideos(supabase, clientId, month).catch(() => null),
  ])

  // ── §6 · what worked ───────────────────────────────────────────────────
  const worked = buildWorked(videos, ownPublished ? { month, brand, videos: ownPublished } : null)

  const coverage: CoverageBlock = {
    line: coverageLine({
      brand,
      update: update.date,
      previous: update.previous,
      window,
      platformMix: mergeMix(cameIn.rows.map((r) => r.platformMix)),
      videos: windowVideos,
      comments: cameIn.windowComments,
    }),
    privacy: PRIVACY_LINE,
  }

  const [weeks, heard, comparable] = await Promise.all([weeksAhead, heardAhead, comparableAhead])
  // THE SUBJECTS' MAKER SHARES (WP3.7; the preview's row tag), as the Subjects
  // rail and the front page read them: the month's market videos, their
  // segments and the lens over the makers' (three reads), only where a market
  // row prints and the tenant has a maker rule.
  if (subjectsBlock.market && subjectsBlock.rows.some((r) => (r.market?.monthSoFar.k ?? 0) > 0) && segmentRulesEnabled(clientId)) {
    const makers = await loadMarketMakers(reading.client, clientId, subjectsBlock.market.month).catch(() => null)
    for (const r of subjectsBlock.rows) {
      const k = r.market?.monthSoFar.k ?? 0
      const makerK = makers?.lens && k > 0 ? makerKOf(makers.lens, r.id, rivalAudiences) : null
      r.makerShare = makerK != null ? makerK / k : null
    }
  }

  return {
    brand,
    update,
    window,
    month,
    monthStatus,
    readingAt,
    windowVideos,
    nextUpdate: clock.nextUpdate,
    paused: clock.paused,
    unusual: { ...unusual, comparable },
    subjects: subjectsBlock,
    ...(weeks ? { weeks } : {}),
    rising: risingRead.block,
    cameIn,
    heard,
    replies,
    sales,
    worked,
    coverage,
    method: null,
    // EVERY SERIES READ HERE, SAID ONCE. `monthSet` is the denominator-only
    // set behind §1's baseline and §4's contribution; `risingRead.notes` are
    // §3's per-theme ones. `mergeSeriesNotes` collapses a run of months into
    // ONE sentence rather than repeating it per object, which is the whole
    // point of merging them here rather than printing each set's own.
    // The month's state is the page bar's ("still filling"), and where the
    // change record begins is the record's (Settings › The record): neither
    // is a This week fact (copy de-clutter C20, C63).
    notes: mergeSeriesNotes([...monthSet.series, ...risingRead.series])
      .filter((n) => n.kind !== 'still_filling' && n.kind !== 'no_change_record_before'),
  }
}

// ---- the weekly's share of this page (WP3.7) ------------------------------------

/** What the weekly report prints of This week: the same builders over the
 *  same update, so the email and the page print one set of counts. */
export interface WeekParts {
  update: WeekUpdate
  window: WeekWindow | null
  /** The month the window ends in: This week's month. */
  month: string
  cameIn: MarketCameIn | null
  heard: HeardBlock
  sales: ForSalesData
  replies: RepliesBlock
}

/**
 * This week's "With this update", "Heard for the first time", "For sales" and
 * "Worth a reply", for the weekly report (market-first WP3.7): the page's own
 * builders and reads, without the sections the weekly does not print (the
 * update series, the risers, the rivals' posts, what worked, week by week). The
 * weekly's done-when: it and This week print the same counts for one update.
 * Null for a tenant nothing has been delivered to.
 */
export async function loadWeekParts(scope: Scope): Promise<WeekParts | null> {
  const supabase = scope.supabase as SupabaseClient
  const { clientId } = scope
  const reading: ReadingHandle = scope.reading
  const readingAt = new Date().toISOString()
  const [runsRes, runningIds, rivals, delivered] = await Promise.all([
    supabase.from('pipeline_runs').select('*')
      .eq('client_id', clientId).in('status', ['completed', 'partial'])
      .order('started_at', { ascending: false }).limit(2),
    fetchRunningRunIds(supabase, clientId, 'week'),
    loadRivals(supabase, clientId),
    loadDeliveredRuns(supabase, clientId).catch(() => null),
  ])
  const runsRaw = rows<RunRow>(runsRes, 'week.parts.runs')
  const anchor = runsRaw[0]
  if (!anchor) return null
  const update: WeekUpdate = {
    id: anchor.id,
    date: anchor.completed_at ?? anchor.started_at ?? readingAt,
    previous: runsRaw[1]?.completed_at ?? runsRaw[1]?.started_at ?? null,
    status: anchor.status,
  }
  const stored = rowWindow(anchor)
  const window: WeekWindow | null = stored?.start && stored.end ? { from: stored.start, to: stored.end, basis: stored.basis } : null
  const month = monthStartOf(window?.to ?? update.date)
  const rivalAudiences = marketRivalAudiences(rivals)
  const audiences = [CLIENT_AUDIENCE, ...rivals.map((r) => rivalKey(r.name)), INDUSTRY_AUDIENCE]

  const [monthSet, windowRead, monthWindowRead, videos, themedRunId, subjects] = await Promise.all([
    loadMonthSeries(reading.client, clientId, { from: month, to: month, audiences }),
    window ? loadWindowReading(reading.client, clientId, { from: window.from, to: window.to }) : null,
    window && window.from < month ? loadWindowReading(reading.client, clientId, { from: month, to: window.to }) : null,
    loadUpdateVideos(supabase, clientId, anchor.id),
    fetchThemedRunId(supabase, clientId, runningIds, 'week'),
    loadSubjects(supabase, clientId),
  ])
  const contributionRead = (monthWindowRead ?? windowRead)?.denominators ?? null
  const cameIn = marketCameIn({
    month,
    update: update.date,
    read: contributionRead,
    rivalAudiences,
    monthVideos: pooledDenominators(monthSet.denominators, rivalAudiences).get(month)?.videos ?? null,
    updates: delivered ? updatesInto(month, delivered.map(updateInstant), update.date) : null,
    now: readingAt,
  })
  const [heard, sales, replies] = await Promise.all([
    loadHeard({
      supabase, client: reading.client, clientId, runId: anchor.id, month, themedRunId,
      regime: { clusteringKey: anchor.clustering_key, startedAt: anchor.started_at, date: update.date },
    }),
    buildSales({ supabase, clientId, window, windowVideos: totalVideos(windowRead?.denominators ?? null), subjects }),
    buildReplies({ supabase, clientId, runId: anchor.id, window, videos: Promise.resolve(videos) }),
  ])
  return { update, window, month, cameIn, heard, sales, replies }
}

// ---- §2 · worth a reply, and §8 · flagged for awareness -----------------------

const REPLIES_UNREAD =
  'The comments this update read could not be sorted into a reply queue just now.'

const REPLIES_NO_WINDOW =
  'This update covered no window.'

/**
 * The work queue, from the SAME digest the Content page reads.
 *
 * ONE PICK, TWO PAGES. `loadEngageCandidates` → `rankEngageCandidates` is
 * exactly what `lib/pages/content.ts` calls, and both pages call it rather than
 * one of them re-implementing "worth a reply". Until Content retires the digest
 * is loaded twice per reader, which is a cost and not a risk: the pick is pure
 * given its inputs, so two loads of one update cannot disagree.
 *
 * DATED BY THE RUN'S OWN WINDOW. Content's freshness cut is `Date.now() -
 * report_period`, which moves while nobody does anything; this page hands
 * `window.from` in, so a row is in the queue exactly when its comment was
 * written inside the days this update covered — the same test §4's comment
 * count and §1's series use. A run with no window has no such days and the
 * block says so instead of falling back to the clock.
 *
 * THE AWARENESS ROWS ARE RANKED SEPARATELY AND CARRY NO LINK. Recommending a
 * reply under someone else's post is an invitation to argue in public;
 * `engageDeepLink` is not called for them, so the absence is structural and not
 * a rendering choice.
 */
async function buildReplies(input: {
  supabase: SupabaseClient
  clientId: string
  runId: string
  window: WeekWindow | null
  /** This update's videos, for the posters' roles — a promise, because the
   *  queue starts reading before wave 2 has them and needs them only at the
   *  end (`loadWeek`). */
  videos: PromiseLike<readonly VideoRow[]>
  /** The quote gate (walkthrough, 29 Sep; lib/quote-gate.ts): a row is a
   *  comment the market wrote that the client could answer — readable, not
   *  under a maker's or a seller's post, not under another brand's own post
   *  (the Wotancraft line under Think Tank's), on the market — and one comment
   *  thread gives the queue one row. Comments under the client's own posts
   *  stay: those are the ones most worth answering. */
  gate?: boolean
}): Promise<RepliesBlock> {
  const { supabase, clientId, runId, window } = input
  const empty: RepliesBlock = { rows: [], counts: [], total: 0, flagged: [], window, unread: null }
  if (!window) return { ...empty, unread: REPLIES_NO_WINDOW }

  try {
    const [candidates, configRes] = await Promise.all([
      // BOUNDED BY THE RUN'S OWN WINDOW, which is the same cut
      // `rankEngageCandidates` applies below — so the read returns the same
      // digest off the comments of these days rather than off the corpus.
      // This page is a second reader of a digest the Content page already
      // loads whole, and until Content retires both run on every page view.
      loadEngageCandidates(supabase, clientId, runId, { commentsSince: window.from }),
      supabase.from('tracking_configs')
        .select('own_handles, brand_keywords, competitor_keywords, industry_keywords')
        .eq('client_id', clientId).maybeSingle(),
    ])
    const config = row<{
      own_handles: Record<string, string> | null
      brand_keywords: string[] | null
      competitor_keywords: string[] | null
      industry_keywords: string[] | null
    }>(configRes, 'week.replyConfig')
    // NO QUOTE FROM UNDER A VIDEO MARKED NOISE (market-first WP2.7): the
    // queue is picked from the rest, so a skipped row is replaced, not a gap.
    // AND A COMMENT UNDER A MAKER'S OWN POST IS TAGGED SO (WP3.7; decision F):
    // the same two reads answer both.
    // THE TRANSLATION CACHE, read once for the whole pool (the gate reads the
    // English, and the rows print it), and the gate's videos: both beside the
    // segments' read rather than after it.
    //
    // ONLY FOR WHAT THE QUEUE COULD PRINT. The ranking keeps a comment only
    // where it reads as English on its own words and runs to twelve
    // characters (`rankEngageCandidates`), so nothing else is worth a read:
    // on staging's 27 Sep window that is the difference between 1,456
    // comments' English and videos and the few hundred the queue can take.
    const printable = candidates.filter((c) => {
      const text = cleanQuote(c.comment.text ?? '')
      return text.length >= 12 && readableQuote({ text })
    })
    const translationsAhead = readTranslations(supabase, (input.gate ? printable : candidates).map((c) => c.comment.text ?? ''))
    const contextAhead = input.gate
      ? readQuoteContext(supabase, clientId, engageContextWant(printable)).catch(() => null)
      : Promise.resolve(null)
    const segments = await replySegments(supabase, clientId, candidates.map((c) => c.comment.id))
    const unGated = skipNoise(candidates, (c) => c.comment.id, segments.noise)
    const [translations] = await Promise.all([translationsAhead, contextAhead])
    // The context read above is memoised on the client, so the gate's own read
    // of the same comments is answered from it.
    const printableIds = new Set(printable.map((c) => c.comment.id))
    const pool = input.gate ? await gateEngage(supabase, clientId, unGated.filter((c) => printableIds.has(c.comment.id)), translations, segments.maker) : unGated
    const vocab = engageVocab([config?.brand_keywords, config?.competitor_keywords, config?.industry_keywords])
    const ownHandles = new Set(
      Object.values(config?.own_handles ?? {})
        .filter((h): h is string => typeof h === 'string' && h.length > 0)
        .map(handleKey),
    )
    const roles = roleByAccount((await input.videos).map((v) => ({
      // `VoiceVideo` takes the columns non-null; a video with no account is a
      // video no role can be read off, and `roleByAccount` drops it itself.
      account_name: v.account_name ?? '',
      is_client: v.is_client === true,
      is_competitor: v.is_competitor === true,
      competitor_name: v.competitor_name,
      views: v.views,
    })))

    // BOUNDED AT BOTH ENDS, because this block STATES a closed window as the
    // rows' basis (code review C3). The rank has been bounded below only since
    // the digest was written, which is right for Content — its cut is a moving
    // clock and it claims no upper end. This page's footer says "written 6 Sep
    // – 13 Sep" and the loader's own doc above says a row is in the queue
    // exactly when its comment was written inside the days this update covered.
    // A window is frozen at `open-run` and gather runs after it, so without the
    // upper bound a comment written after `window_end` and gathered by this
    // very run would be cited here carrying a date the footer does not cover.
    const worthReplying = rankEngageCandidates(
      pool.filter((c) => c.category !== 'misinformation'),
      { windowStart: window.from, windowEnd: window.to, vocab },
    )
    const awareness = rankEngageCandidates(
      pool.filter((c) => c.category === 'misinformation'),
      { windowStart: window.from, windowEnd: window.to, perCategoryCap: FLAGGED_SHOWN, totalCap: FLAGGED_SHOWN, vocab },
    )
    // `now` is the window's END, not the clock: `shapeInbox` computes an age
    // from it and this page prints a date instead, but a shape whose unused
    // field is nonsense is a shape the next reader will trust.
    const shaped = shapeInbox([...worthReplying, ...awareness], { now: window.to, ownHandles, roleByAccount: roles })
    // THE TRANSLATION CACHE, like every other quote path (sweep 2026-09-24):
    // the reply queue printed a comment's raw words, so a Korean question read
    // untranslated where the same words elsewhere carried their English.
    const all = shaped.map((r) => toReplyRow(r, translations, segments.maker))
    const rowsOut = all.filter((r) => r.intent !== 'misinformation')
    return {
      rows: rowsOut,
      counts: intentCounts(rowsOut),
      total: rowsOut.length,
      flagged: all.filter((r) => r.intent === 'misinformation').slice(0, FLAGGED_SHOWN),
      window,
      unread: null,
    }
  } catch (error) {
    console.error(`[pages] week.replies: ${(error as { message?: string })?.message ?? String(error)}`)
    return { ...empty, unread: REPLIES_UNREAD }
  }
}

/** One shaped candidate as this page's row: a date where Content has an age,
 *  and the insight's own theme as the reason, humanised here so the page, the
 *  slide and the email print one string. */
function toReplyRow(
  shaped: InboxRow<EngageCandidate & InboxSource>,
  translations: Map<string, { lang: string; english: string | null }> = new Map(),
  makers: ReadonlySet<string> = new Set(),
): ReplyRow {
  const c = shaped.src
  const link = c.category === 'misinformation' ? { href: null } : engageDeepLink(c.comment)
  return {
    id: c.comment.id,
    intent: shaped.intent,
    date: c.comment.commentDate,
    context: replyContextWords(shaped.context),
    reason: cap(pretty(c.theme)),
    platform: c.comment.platform,
    quote: { ref: quoteRef.message(c.comment.id), text: cleanQuote(c.comment.text), ...readingOf(translations, c.comment.text) },
    href: link.href,
    insightId: c.insightId,
    ...(makers.has(c.comment.id) ? { maker: true } : {}),
  }
}

// ---- §1 ----------------------------------------------------------------------

async function buildUnusual(input: {
  supabase: SupabaseClient
  clientId: string
  check: CheckRow | null | undefined
  flags: FlagRow[] | null
  baseline: BaselineState
  month: string
  /** The last thirteen updates, or null where the series could not be read. */
  series: UpdateSeries | null
}): Promise<UnusualBlock> {
  const { check, flags, baseline, month, series } = input
  const base: UnusualBlock = {
    state: 'not_checked',
    note: null,
    flags: [],
    flaggedCount: 0,
    setSize: null,
    tested: null,
    baseline,
    startsWith: baselineStartsWith(baseline, month),
    updateVideos: null,
    medianVideos: null,
    // THE SERIES IS DRAWN IN EVERY STATE, including the four that say the check
    // could not speak. It is a reading of our own cadence and not of the
    // check's, so a workspace whose baseline is one month of three still has
    // thirteen updates to show — and showing them is the honest half of
    // "baseline forming": here is what we have read, and here is why we cannot
    // yet say whether it was unusual.
    series,
  }

  // THE BASELINE SENTENCE WINS OVER SILENCE, AND ONLY OVER SILENCE. A tenant
  // whose baseline is one month of three cannot be flagged and will not be for
  // months; saying "no check has run" there would be true and useless, and
  // saying "nothing was unusual" would be false. So when nothing has been
  // recorded, the page answers with the state of the instrument.
  if (check === undefined || check === null) {
    return { ...base, state: baseline.ready ? 'not_checked' : 'baseline_forming' }
  }

  const common = {
    ...base,
    note: check.note,
    setSize: check.set_size,
    tested: check.tested,
    updateVideos: check.update_videos,
    medianVideos: check.median_videos != null ? Number(check.median_videos) : null,
  }

  if (check.outcome === 'suppressed' || check.outcome === 'no_window' || check.outcome === 'missing_migration') {
    return { ...common, state: 'refused' }
  }
  if (check.outcome === 'nothing_unusual') {
    return { ...common, state: baseline.ready ? 'nothing_unusual' : 'baseline_forming' }
  }

  // THE CHECK'S ROW SAYS SOMETHING FIRED. If the flags cannot be read — an RLS
  // refusal, a network blip, a renamed column, a missing table — the honest
  // answer is that we could not look, and `nothing_unusual` would tell a paying
  // client their week was quiet on the strength of a failed read. That is the
  // exact conflation `anomaly_checks` exists to prevent, and one ternary is all
  // it takes to reintroduce it.
  if (flags == null || flags.length === 0) {
    return { ...common, state: 'unreadable', flaggedCount: check.flagged_count ?? 0 }
  }

  const rowsIn = [...flags].sort((a, b) => a.rank - b.rank)
  const built = await Promise.all(rowsIn.map((f) => buildFlag(input.supabase, input.clientId, f)))
  return {
    ...common,
    state: 'flagged',
    flags: built,
    flaggedCount: rowsIn[0]?.flagged_count ?? built.length,
  }
}

async function buildFlag(supabase: SupabaseClient, clientId: string, f: FlagRow): Promise<UnusualFlag> {
  const refs = refsOf(f.quote_refs)
  const quotes = await resolveRefs(supabase, clientId, refs.slice(0, 2))
  return {
    objectKind: f.object_kind,
    objectId: f.object_id,
    label: f.label,
    denominator: f.denominator,
    week: { k: f.week_k, n: f.week_n },
    baseline: { k: f.baseline_k, n: f.baseline_n },
    baselineMonths: f.baseline_months ?? [],
    baselineFilling: f.baseline_filling_months ?? [],
    baselineRegime: f.baseline_regime ?? null,
    changePts: Number(f.change_pts),
    bandPts: Number(f.band_pts),
    sentences: f.explanation?.sentences ?? [],
    explanationModel: f.explanation_model,
    quotes,
    rank: f.rank,
  }
}

/**
 * The refs inside `anomaly_flags.quote_refs`.
 *
 * THE COLUMN IS `[{ref, context}]`, NOT A STRING LIST. M7's own comment says
 * so — "comment ids and their context, never the text" — and a row written and
 * read back on a local PostgreSQL 17 cluster comes out
 * `[{"ref": "c:<comments.id>", "context": "tiktok"}]`, which is what
 * `lib/pipeline/anomaly-check.ts` writes. A reader that filtered for
 * `typeof r === 'string'` would therefore drop every ref there is and print a
 * flag with no evidence under it, silently, the day M7 lands. Both shapes are
 * accepted here because nothing has written the column in production yet and
 * the string form is the cheaper thing for a future writer to reach for;
 * anything else is dropped rather than rendered as `[object Object]`.
 */
export function refsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const item of value) {
    if (typeof item === 'string') out.push(item)
    else if (item && typeof item === 'object' && typeof (item as { ref?: unknown }).ref === 'string') {
      out.push((item as { ref: string }).ref)
    }
  }
  return out
}

// ---- §2 ----------------------------------------------------------------------

const SUBJECTS_UNREAD =
  'No subjects are recorded for this workspace yet. Name what you care about on Subjects and this update’s videos are counted against them from the next reading.'

async function buildSubjects(input: {
  reading: ReadingHandle
  clientId: string
  subjects: Subject[] | null
  month: string
  window: WeekWindow | null
  /** Every stored month row the page read (all audiences), for the market's
   *  denominators (decision E). */
  denominators: readonly { month: string; audience: string; videos: number; comments: number }[]
  /** The tracked rivals' audience keys (`marketRivalAudiences`). */
  rivalAudiences: readonly string[]
  /** When the month's market rows were last written (`monthsWrittenAt`), and
   *  the words a subject the month was not read for prints (`unreadWords`). */
  readIn: { writtenAt: number | null; unreadWords: string }
}): Promise<WeekSubjectsBlock> {
  const { reading, clientId, subjects, month, window } = input
  // Built on the market even when there is nothing to read (WP2.7): the
  // market block says so under its own title, never the Phase 1 strip's meta.
  const nothing = { rows: [], unread: SUBJECTS_UNREAD, month, lead: null, namedLine: null, market: { month, n: null } }
  if (subjects == null) return nothing
  if (subjects.length === 0) return nothing

  const stored = await readSubjectMonths(reading, clientId, month)
  if (stored == null) return nothing

  // THIS UPDATE'S DAYS INSIDE THE MONTH (WP2.7): the window clipped to the
  // month, so "+j with this update" is a count that adds to the month the row
  // is of, the same clip the contribution line uses. A window wholly before
  // the month (none today) contributes nothing to it.
  const clipped = window ? clipToMonth(window, month) : null
  const added = clipped ? await readSubjectWindow(reading, clientId, clipped) : window ? [] : null
  // WAS THE SUBJECT READ IN THE MONTH AT ALL? (WP1.1 review, finding 1, on
  // This week: default M-a.) One named after the month's last update has no
  // row, and its 0 there is no reading: it says "no reading yet", as Your
  // market and the Subjects rail do, and never "provisional". The change log
  // is the one the month-pair judge already read (memoised): no new read.
  const changes = await loadChanges(reading.client, clientId)
  const unread = new Set(subjects
    .filter((s) => subjectReadIn({
      countedFrom: subjectCountedFrom(s as CountedSubject, changes),
      writtenAt: input.readIn.writtenAt,
      cited: stored.some((r) => r.subject_id === s.id),
    }) === 'unread')
    .map((s) => s.id))

  // DECISION C (WP1.1) ON THE MARKET (WP2.7): a ready subject prints as read,
  // a provisional one prints its market figure marked "provisional", and a
  // failed one is named "being re-described" with no figure.
  const calibrationOf = new Map(subjects.map((s) => [s.id, subjectCalibration(s)]))
  const market = marketSubjectsOf({
    subjects,
    calibrationOf,
    unread,
    unreadWords: input.readIn.unreadWords,
    month,
    stored,
    added,
    counts: pooledDenominators(input.denominators, input.rivalAudiences),
    rivalAudiences: input.rivalAudiences,
  })

  const active = subjects.filter((s) => s.status === 'active')
  return {
    ...market,
    unread: market.rows.length > 0 || (market.withheld?.length ?? 0) > 0 ? null : SUBJECTS_UNREAD,
    month,
    // The client-side lead ("two of your three subjects ran above typical")
    // is not a market reading; the market's rows carry their own counts.
    lead: null,
    // The rows are the ACTIVE subjects — a proposed subject measures nothing
    // (`loadActiveSubjects`' own filter). Kept as data; the market block's
    // footer holds links only (25 Sep rulings).
    namedLine: subjectsNamedLine(active.map((s) => s.named_at)),
  }
}

// ---- §3 ----------------------------------------------------------------------

const RISING_UNREAD =
  'The month’s themes have not been read for this workspace yet, so nothing can be said to be rising.'

/** No denominator row for the month means there is nothing for a theme to be a
 *  share OF — and the block used to print "of 0 category videos" beside
 *  "Nothing moved clearly", which reads as a measurement of an empty month
 *  rather than as an absent reading. */
const RISING_NO_DENOMINATOR =
  'This month’s category conversation has not been counted for this workspace yet, so there is nothing for a theme to be a share of.'

/**
 * §3 · the themes that moved in this month's reading.
 *
 * TWO READS, AND THE SECOND ONE IS THROUGH `lib/reading`. The first is a
 * DISCOVERY scan: which themes have a stored row in these four months at all,
 * and which thirty of them moved most. It is a raw `selectAll` because ranking
 * by difference is the one thing `loadTopObjects` cannot do — it ranks by
 * weight, and a small theme that moved most would never reach the pool.
 *
 * The second read is `loadMonthSeries` over those thirty ids, and every number
 * printed comes off it. That is not tidiness: the set is where the reading
 * layer puts its NOTES — the change-log boundary and the stretches of months
 * whose grouping was never recorded — and `MonthSeriesSet.notes` says in its
 * own contract that "a surface reading the set prints THESE". This block pools
 * three months into one comparison, which is exactly where a reader needs to be
 * told the three were not read under one clustering. It also brings each
 * theme's label, so there is no third read for those.
 */
async function buildRising(input: {
  supabase: SupabaseClient
  reading: ReadingHandle
  clientId: string
  month: string
  window: WeekWindow | null
  themedRunId: string | null
  monthOf: number
  denominators: readonly { month: string; audience: string; videos: number }[]
  /** The page's month-pair judge (decision D, WP1.3). */
  pair: PairOn
}): Promise<{ block: RisingBlock; series: MonthSeries[] }> {
  const { reading, clientId, month, monthOf } = input
  const base: RisingBlock = { rows: [], audience: INDUSTRY_AUDIENCE, month, monthOf, moved: 0, pooled: 0, pooledBaseline: true, unread: null }
  const nothing = (unread: string | null) => ({ block: { ...base, unread }, series: [] as MonthSeries[] })

  // NO DENOMINATOR, NO SHARE. `monthOf` is 0 when the month has no
  // `month_denominators` row for the category, and every figure this block
  // prints is a share of it — including the block's own meta, which read "of 0
  // category videos".
  if (monthOf <= 0) return nothing(RISING_NO_DENOMINATOR)

  const baselineMonths = trailingMonths(month, BASELINE_MONTHS)
  // THE MONTH-PAIR RULE (decision D, WP1.3). This block compares the month so
  // far with the months behind it, which is a pair the rule never compares
  // (a so-far month), and one that spans our own search changes. Where the
  // pair is refused nothing is banded, and the block says why in the rule's
  // own words rather than "nothing moved clearly", which would claim a
  // comparison that was not drawn.
  const monthPair = input.pair(baselineMonths[0] ?? month, month, INDUSTRY_AUDIENCE)
  const pairNote = pairOnVerdict(monthPair).note
  if (pairNote?.mode === 'refuse') return { ...nothing(pairSentence(pairNote)), block: { ...base, unread: pairSentence(pairNote), chip: pairChipWords(pairNote) } }
  const summedBaselineOf = baselineMonths.reduce((t, m) => t + sumAudienceMonth(input.denominators, m, INDUSTRY_AUDIENCE), 0)

  // THE BASELINE IS READ OVER ITS WINDOW WHERE THE WINDOW CAN BE READ.
  //
  // `QuarterChangeInput` states the rule in the strongest terms the reading
  // layer has — "never from summing month rows: a video whose thread spans two
  // months is one member of a window and two of a sum, and the surplus runs to
  // +38.7% over twelve months on live data" — and this block summed three month
  // rows for the n its band is drawn on. It was fully disclosed (in the loader,
  // in the printed note, in a test and in f8e4895, which measured 449
  // video-months against 446 distinct videos on Sealand), so the digits were
  // fine; the defect was that the product held one banded comparison that sums
  // month rows and one that forbids it, ~600 lines apart, each arguing its own
  // case. Reconciled here, in the one that was summing.
  //
  // `window_denominators` / `window_theme_readings` are M3's and are NOT
  // applied on production, so this is the isMissing* guard shape: the read
  // comes back null, the sum stays, and the block prints the note that says so.
  // Where the read answers, the note is not printed, because it is not true.
  const baselineWindow = {
    from: `${baselineMonths[0] ?? month}T00:00:00.000Z`,
    to: `${month}T00:00:00.000Z`,
  }
  const windowRead = await loadWindowReading(reading.client, clientId, {
    ...baselineWindow,
    audiences: [INDUSTRY_AUDIENCE],
    runId: input.themedRunId,
  })
  const windowOf = windowRead.denominators?.find((d) => d.audience === INDUSTRY_AUDIENCE)?.videos ?? null
  const windowThemes = windowRead.themes
    ? new Map(windowRead.themes.filter((t) => t.audience === INDUSTRY_AUDIENCE).map((t) => [t.theme_id, t.videos]))
    : null
  // BOTH SIDES OR NEITHER. A distinct-video numerator over a summed denominator
  // is a third number that is neither reading, so the window baseline is used
  // only when the window answered for the denominator AND for the theme.
  const pooledBaseline = windowOf == null || windowOf <= 0 || windowThemes == null
  const baselineOf = pooledBaseline ? summedBaselineOf : windowOf

  let stored: { month: string; audience: string; theme_id: string; videos: number }[]
  try {
    stored = await selectAll<{ month: string; audience: string; theme_id: string; videos: number }>(() =>
      reading.client
        .from('month_theme_readings')
        .select('month, audience, theme_id, videos')
        .eq('client_id', clientId)
        .eq('audience', INDUSTRY_AUDIENCE)
        .gte('month', baselineMonths[0] ?? month)
        .lte('month', month)
        .order('month', { ascending: true })
        .order('theme_id', { ascending: true }),
    )
  } catch (error) {
    if (!isMissingMonthTable(error)) throw error
    return nothing(RISING_UNREAD)
  }
  if (stored.length === 0) return nothing(RISING_UNREAD)

  const within = new Set(baselineMonths)
  const byTheme = new Map<string, { now: number; before: number }>()
  for (const r of stored) {
    const held = byTheme.get(r.theme_id) ?? { now: 0, before: 0 }
    if (r.month === month) held.now += r.videos ?? 0
    else if (within.has(r.month)) held.before += r.videos ?? 0
    byTheme.set(r.theme_id, held)
  }

  // RANKED BEFORE THE BAND IS DRAWN, so the three shown are the three largest
  // movements of the month rather than the first three that cleared a floor.
  const ranked = [...byTheme.entries()]
    .map(([id, v]) => ({
      id,
      now: v.now,
      before: v.before,
      delta: share(v.now, monthOf) - share(v.before, baselineOf),
    }))
    .sort((a, b) => b.delta - a.delta || b.now - a.now)
    .slice(0, RISER_POOL)

  const themeSet = await loadMonthSeries(reading.client, clientId, {
    from: baselineMonths[0] ?? month,
    to: month,
    audiences: [INDUSTRY_AUDIENCE],
    objectKind: 'theme',
    objectIds: ranked.map((r) => r.id),
  })
  const seriesOf = new Map(
    themeSet.series.filter((s) => s.objectId).map((s) => [s.objectId as string, s]),
  )

  // EVERY ONE OF THE POOL IS BANDED, not just enough of them to fill three
  // rows: the note under the rows is a claim about the ones that are not
  // printed, and a loop that breaks at three has never tested them.
  const moved: Riser[] = []
  for (const r of ranked) {
    const series = seriesOf.get(r.id)
    const points = series?.points ?? []
    const now = points.find((p) => p.month === month)
    const nowK = now?.k ?? r.now
    const nowN = now?.videos ?? monthOf
    let beforeK = 0
    let beforeN = 0
    if (!pooledBaseline) {
      beforeK = windowThemes.get(r.id) ?? 0
      beforeN = windowOf
    } else {
      for (const p of points) {
        if (p.month === month || !within.has(p.month)) continue
        beforeK += p.k ?? 0
        beforeN += p.videos ?? 0
      }
      if (beforeN === 0) { beforeK = r.before; beforeN = baselineOf }
    }
    const label = series?.objectLabel ?? 'An unnamed theme'
    const verdict = pairedVerdict({
      objectKind: 'theme',
      objectId: r.id,
      objectLabel: label,
      audience: INDUSTRY_AUDIENCE,
      window: { kind: 'month', from: month, to: nextMonth(month) },
      basis: { from: baselineMonths[0] ?? month, to: month },
      value: { k: nowK, n: nowN },
      baseline: { k: beforeK, n: beforeN },
    }, monthPair)
    // A RISER IS A COMPARISON THAT WAS DRAWN AND CAME BACK LARGER. `moved` is
    // the only state that says so; `no_clear_change` is an answer and not a
    // rise, and the other three are the product declining to give one. The
    // design's "nothing moved clearly" is what an empty list means here.
    if (verdict.state !== 'moved' || (verdict.changePts ?? 0) <= 0) continue
    moved.push({
      id: r.id,
      label,
      month: { k: nowK, n: nowN },
      baseline: { k: beforeK, n: beforeN },
      verdict,
      addedVideos: null,
      quotes: [],
    })
  }

  // Quotes only for the rows a reader will see — the rest were banded to make
  // the sentence true, not to be printed.
  const risers = moved.slice(0, RISERS_SHOWN)
  if (risers.length > 0 && input.themedRunId) {
    const quoted = await Promise.all(
      risers.map((r) => loadThemeQuotes(input.supabase, clientId, input.themedRunId as string, r.id, 2, r.label)),
    )
    risers.forEach((r, i) => { r.quotes = quoted[i] })
  }

  return {
    block: { ...base, rows: risers, moved: moved.length, pooled: ranked.length, pooledBaseline },
    series: themeSet.series,
  }
}

// ---- §4 ----------------------------------------------------------------------

async function buildCameIn(input: {
  supabase: SupabaseClient
  clientId: string
  runId: string
  window: WeekWindow | null
  month: string
  videos: VideoRow[]
  rivals: { name: string; retiredAt: string | null; firstSeenAt: string | null }[]
  windowRead: Awaited<ReturnType<typeof loadWindowReading>> | null
  /** The window clipped to the month, per audience — the contribution's
   *  numerator, and never a sum of month rows. */
  contributionRead: AudienceCount[] | null
  contributionVideos: number | null
  /** Every stored month row, for the contribution's per-audience denominator. */
  denominators: readonly { month: string; audience: string; videos: number }[]
  monthVideos: number
  subjects: Subject[] | null
  themedRunId: string | null
  /** "Heard for the first time" (WP3.7), read beside this block: the
   *  first-heard count and names here are its own, on the category. */
  heard: Promise<HeardBlock>
  /** "With this update" on the market (WP3.7). */
  market: MarketCameIn | null
  /** The month's brand mention layer (lib/pages/week-brands.ts), for "Named
   *  unprompted"; null where it cannot be read. */
  brandLayer: Promise<BrandLayer | null>
  /** The change log, for Settings' "Tracked since" (memoised read). */
  changes: Promise<readonly ConfigChange[]>
}): Promise<CameInBlock> {
  const { supabase, clientId, runId, window, month, videos, rivals, windowRead } = input

  const byAudience = new Map<string, AudienceRow>()
  const take = (audience: string): AudienceRow => {
    const held = byAudience.get(audience)
    if (held) return held
    const made: AudienceRow = { audience, label: audienceLabel(audience), gathered: 0, analysed: 0, platformMix: {}, contribution: null, trackedSince: null, share: { k: 0, n: 0 }, comments: null }
    byAudience.set(audience, made)
    return made
  }
  const addedBy = new Map((input.contributionRead ?? []).map((d) => [d.audience, d.videos]))
  for (const v of videos) {
    const audience = v.is_client ? CLIENT_AUDIENCE : v.is_competitor ? rivalKey(v.competitor_name) : INDUSTRY_AUDIENCE
    const rowOut = take(audience)
    if (v.run_id === runId) rowOut.gathered += 1
    if (v.analyzed_run_id === runId) {
      rowOut.analysed += 1
      rowOut.platformMix[v.platform] = (rowOut.platformMix[v.platform] ?? 0) + 1
    }
  }
  // PER-AUDIENCE COMMENTS, WHICH THE LOADER ALREADY HAD AND SUMMED AWAY.
  // `WindowDenominator.comments` comes back per audience and went straight into
  // `totalComments`; the mock's row carries it, and it costs no read to keep.
  // Null when the windowed read is not installed (M3) and 0 when it is and this
  // audience drew no comment in these days — a measurement, not a silence.
  const commentsBy = new Map((windowRead?.denominators ?? []).map((d) => [d.audience, d.comments ?? 0]))
  // WHOSE LINE STARTS LATE, AND ONLY THOSE. A rival first seen before the
  // months this page compares has the same history as every row above it.
  const trackedFrom = backMonths(month, BASELINE_MONTHS)
  const sinceBy = new Map(
    rivals
      .filter((r) => r.firstSeenAt != null && r.firstSeenAt.slice(0, 10) >= trackedFrom)
      .map((r) => [rivalKey(r.name), r.firstSeenAt as string]),
  )
  for (const rowOut of byAudience.values()) {
    rowOut.trackedSince = sinceBy.get(rowOut.audience) ?? null
    if (windowRead?.denominators != null) rowOut.comments = commentsBy.get(rowOut.audience) ?? 0
    if (input.contributionRead == null) continue
    rowOut.contribution = {
      videos: addedBy.get(rowOut.audience) ?? 0,
      of: sumAudienceMonth(input.denominators, month, rowOut.audience),
    }
  }
  const audienceRows = [...byAudience.values()].sort((a, b) => b.analysed - a.analysed || b.gathered - a.gathered)
  // THE SHARE BAR'S BOTH SIDES, set once the total exists. `analysed` over the
  // update's analysed total: the one denominator on this block every row
  // genuinely divides. Never `gathered`, which is a different set and not a
  // whole this is a part of.
  const analysedTotal = audienceRows.reduce((t, r) => t + r.analysed, 0)
  for (const rowOut of audienceRows) rowOut.share = { k: rowOut.analysed, n: analysedTotal }

  // THE POSTS THEMSELVES, ACROSS EVERY RIVAL, COUNTED IN ONE PASS. Each named
  // post costs one HEAD count of the comments dated under it inside the window,
  // so the candidates are picked first (by reach, which is the only "notable"
  // the row holds) and counted once, together — never a count per rival per
  // post in sequence.
  //
  // THEIR OWN POSTS ONLY (WP3.7; the approved preview's "What brands you track
  // posted"): the block names each brand's most-commented post of its own,
  // and a post about the brand by somebody else is counted, never named.
  const candidates = window
    ? rivals.flatMap((r) => {
      const audience = rivalKey(r.name)
      return videos
        .filter((v) => v.run_id === runId && v.is_competitor && rivalKey(v.competitor_name) === audience && v.source === 'competitor_owned')
        .sort((a, b) => (b.views ?? -1) - (a.views ?? -1) || (b.upload_date ?? '').localeCompare(a.upload_date ?? ''))
        .slice(0, RIVAL_POSTS_CONSIDERED)
        .map((v) => ({ audience, video: v }))
    })
    : []
  // THIS SECTION'S READS, TOGETHER. None of the five takes another's answer —
  // the candidates above are arithmetic on wave 2's rows — and they were
  // awaited one after another, which made §4 the page's long pole: on staging
  // (27 Sep) the owned-rival read, the comment counts, the new themes and the
  // subject quotes ran end to end for 4.6 s behind a wave that had already
  // finished everything else.
  // (The first-heard themes are "Heard for the first time"'s one read now, and
  // the subject quotes are no longer printed: WP3.7.)
  const [everOwned, postComments, postText, brandLayer, changes] = await Promise.all([
    // POSTS BY A RIVAL AND POSTS ABOUT ONE ARE DIFFERENT FACTS, and the design's
    // "notable rival posts" does not say which. Both are printed, named: Össur
    // has zero competitor-owned videos in production, so the first is empty on
    // the paying tenant and would have read as "the rivals posted nothing".
    loadOwnedRivalAudiences(supabase, clientId),
    windowCommentsPerVideo(supabase, clientId, candidates.map((c) => c.video), window),
    loadPostText(supabase, clientId, candidates.map((c) => c.video.id)),
    input.brandLayer,
    input.changes.catch(() => [] as readonly ConfigChange[]),
  ])
  // "VIDEOS NAMING THEM" ON THE BRANDS PAGE'S BASIS (finish-list item 7): the
  // update's videos in the month's market that name the brand, off the mention
  // layer, gated by production's hand check; never every video the rival
  // searches gathered, before the relevance and brand checks.
  const named = updateBrandCounts({
    clientId,
    layer: brandLayer,
    updateVideos: videos.map((v) => v.id),
    brands: rivals.map((r) => r.name),
  })
  const weighedBy = new Map<string, number>()
  const postsBy = new Map<string, RivalPost[]>()
  for (const c of candidates) {
    weighedBy.set(c.audience, (weighedBy.get(c.audience) ?? 0) + 1)
    const list = postsBy.get(c.audience) ?? []
    list.push({
      platform: c.video.platform,
      account: c.video.account_name ?? '',
      postedOn: c.video.upload_date,
      caption: postCaption(postText.get(c.video.id)?.caption ?? null),
      href: postText.get(c.video.id)?.video_url ?? null,
      comments: postComments.get(`${c.video.platform}::${c.video.video_id}`) ?? 0,
      own: true,
    })
    postsBy.set(c.audience, list)
  }
  // STAGE TWO: the three the window actually carried conversation under. The
  // order the candidates arrived in is reach, so a tie falls back to it.
  for (const [audience, list] of postsBy) {
    postsBy.set(audience, [...list].sort((a, b) => b.comments - a.comments).slice(0, RIVAL_POSTS_SHOWN))
  }

  const rivalRows: RivalPosts[] = rivals.map((r) => {
    const audience = rivalKey(r.name)
    const mine = videos.filter((v) => v.run_id === runId && v.is_competitor && rivalKey(v.competitor_name) === audience)
    const posts = postsBy.get(audience) ?? []
    const about = named.get(r.name) ?? null
    return {
      audience,
      label: r.name,
      byThem: mine.filter((v) => v.source === 'competitor_owned').length,
      aboutThem: about?.videos ?? 0,
      aboutNote: about?.note ?? null,
      namedMonth: about?.monthVideos != null && about.monthOf != null ? { k: about.monthVideos, n: about.monthOf } : null,
      foundByName: mine.filter((v) => v.source !== 'competitor_owned').length,
      // THE SUM OVER THE POSTS NAMED, AND NOTHING WIDER. It was hard-coded to
      // zero, which is a claim about a rival's week; this is a claim about
      // three posts, and `postsTotal` beside it says how many there were.
      comments: posts.reduce((t, post) => t + post.comments, 0),
      posts,
      postsTotal: mine.length,
      postsConsidered: weighedBy.get(audience) ?? 0,
      // NOT "IS A HANDLE CONFIGURED" — that is a setting, and a setting is not
      // evidence. A configured handle that has never yielded a post is exactly
      // the readiness gap Phase 0 names on the prosthetics tenant, and a row
      // reading "0 posts of their own" there would tell a paying client their
      // rival went quiet. So the question asked is whether this workspace has
      // EVER captured a post of this rival's: never, and their own posts are
      // not being read; sometimes, and a zero this update is a real zero.
      ownPostsUnread: !everOwned.has(audience),
      trackedSince: r.firstSeenAt ?? null,
      // Settings' date, off the same change log and rule (lib/settings/
      // search-set.ts), so the two pages print one "tracked since".
      since: trackedSince(r.name, changes, r.firstSeenAt ?? null),
      nameNote: OTHER_MEANING[r.name] && brandCountState(clientId, r.name) === 'noise' ? noiseWords(r.name) : null,
      retired: r.retiredAt != null,
    }
  })
  // A TRACKED RIVAL WITH NOTHING THIS UPDATE IS A ZERO, NOT AN ABSENCE. The
  // row used to be dropped unless something was found or their own posts were
  // unread, so a rival whose posts ARE read and who posted nothing reached the
  // reader as silence — "Freitag went quiet" is a fact about a rival and the
  // page said it by saying nothing. A RETIRED rival with nothing is different:
  // nobody is watching them any more, and a zero there is about us.
  // AND A STOPPED OR NEVER-OBSERVED RIVAL IS NOT LISTED AT ALL (the listing
  // rule, `listedRivals` in lib/rivals.ts): a retired rival is off every
  // reading surface, and one with nothing this update and no post of theirs
  // ever captured has nothing to read. Settings › Tracking lists them.
  .filter((r) => !r.retired && !(r.ownPostsUnread && r.byThem === 0 && r.aboutThem === 0 && (r.foundByName ?? 0) === 0))
  .map(({ retired: _retired, ...r }) => r)

  // THE FIRST-HEARD THEMES ARE "HEARD FOR THE FIRST TIME"'S (WP3.7): one read,
  // on the category, so the lead line, the block and the weekly count the same
  // themes.
  const heard = await input.heard
  // NEW QUOTES ON YOUR SUBJECTS ARE NO LONGER PRINTED (WP3.7; the approved
  // preview's This week has no such block, and the weekly's WR3 is the
  // market's themes), so they are not read.

  return {
    window,
    rows: audienceRows,
    gathered: audienceRows.reduce((t, r) => t + r.gathered, 0),
    analysed: audienceRows.reduce((t, r) => t + r.analysed, 0),
    windowComments: totalComments(windowRead?.denominators ?? null),
    contribution: input.contributionVideos != null
      ? { videos: input.contributionVideos, of: input.monthVideos }
      : null,
    crossesInto: window && window.from < month ? previousMonthOf(month) : null,
    // The market's own first-heard themes; the ones led by makers or set
    // aside are counted by the heard block (`heardAtFloor`).
    newThemes: heardRows(heard).map((t) => ({ id: t.registryId, label: t.label, videos: t.k })),
    newThemesSeen: heard.seen,
    regrouped: heard.regrouped,
    rivals: rivalRows,
    quotes: [],
    quotesTotal: null,
    quotesUnread: null,
    playbookHref: '/dashboard/market',
    market: input.market,
  }
}

const QUOTES_UNREAD =
  'Quotes are counted against your subjects once subjects are recorded for this workspace. Until then this update’s comments are read, grouped and counted.'

/**
 * The comments this update's window carried that sit under one of the client's
 * subjects.
 *
 * MEMBERSHIP IS PER (INSIGHT, SUBJECT) AND IS A STORED JUDGEMENT (M4), so this
 * is a read of `subject_memberships` and never a keyword match: a quote filed
 * under "Durability" because the word appears in it is the thing the judge was
 * built to stop. Absent the table, the honest answer is that the instrument is
 * not installed — not that the week was quiet.
 */
export async function loadSubjectQuotes(
  supabase: SupabaseClient,
  clientId: string,
  subjects: Subject[] | null,
  window: { from: string; to: string },
): Promise<{ shown: { subject: string; quote: Quote; cite: string; href: string | null }[]; total: number | null; unread: string | null }> {
  if (!subjects || subjects.length === 0) return { shown: [], total: null, unread: QUOTES_UNREAD }
  const nameById = new Map(subjects.map((s) => [s.id, s.name]))

  let members: { subject_id: string; audience_insight_id: string }[]
  try {
    members = await selectAll<{ subject_id: string; audience_insight_id: string }>(() =>
      supabase.from('subject_memberships').select('subject_id, audience_insight_id')
        .eq('client_id', clientId).eq('member', true)
        .order('audience_insight_id', { ascending: true }),
    )
  } catch (error) {
    if (isMissingSubjects(error)) return { shown: [], total: null, unread: QUOTES_UNREAD }
    throw error
  }
  if (members.length === 0) return { shown: [], total: 0, unread: null }

  const subjectOf = new Map<string, string>()
  for (const m of members) if (!subjectOf.has(m.audience_insight_id)) subjectOf.set(m.audience_insight_id, m.subject_id)

  // WITHOUT THE ENGLISH, WHICH IS READ FOR THE QUOTES SHOWN (below): every
  // subject member's evidence is read to find the few written in the window.
  const citations = await citationsUntranslated(supabase, [...subjectOf.keys()])
  const pool: { subject: string; citation: QuoteCitation }[] = []
  for (const [insightId, list] of citations) {
    const subjectId = subjectOf.get(insightId)
    if (!subjectId) continue
    for (const c of [...list].sort((a, b) => a.rank - b.rank)) {
      const text = cleanQuote(c.quote)
      if (!text || !c.commentId) continue
      pool.push({ subject: nameById.get(subjectId) ?? 'A subject', citation: { ...c, quote: text } })
    }
  }
  if (pool.length === 0) return { shown: [], total: 0, unread: null }

  // THE WINDOW IS APPLIED TO THE COMMENT'S DATE and to nothing else. An
  // insight this update wrote out of a comment written in March is March's
  // comment, and "new quotes this update" means quotes written inside the days
  // this update covered.
  // With each comment's platform and video, so the noise filter below needs
  // no second read of the same comments (`noiseCommentsOf`).
  const dated = await inChunks<{ id: string; platform: string; video_id: string }>(
    pool.map((p) => p.citation.commentId as string),
    (part) => () =>
      supabase.from('comments').select('id, platform, video_id')
        .eq('client_id', clientId)
        .in('id', part)
        .gte('comment_date', window.from).lt('comment_date', window.to)
        .order('id', { ascending: true }),
  )
  const fresh = new Set(dated.map((c) => c.id))
  const dayOk = pool.filter((p) => p.citation.commentId && fresh.has(p.citation.commentId))
  // NO QUOTE FROM UNDER A VIDEO MARKED NOISE (market-first WP2.7), and the
  // count beside the list is of the quotes it could have shown.
  const okIds = new Set(dayOk.map((p) => p.citation.commentId as string))
  const noise = await noiseCommentsOf(supabase, clientId, dated.filter((c) => okIds.has(c.id)))
  const kept = skipNoise(dayOk, (p) => p.citation.commentId, noise)
  const shown = kept.slice(0, NEW_QUOTES_SHOWN)
  const translations = await readTranslations(supabase, shown.map((s) => s.citation.quote))
  const cited = await citeQuotes(supabase, clientId, shown.map((s) => ({ ...s.citation, ...readingOf(translations, s.citation.quote) })))
  return {
    shown: cited.map((q, i) => ({ subject: shown[i].subject, ...q })),
    total: kept.length,
    unread: null,
  }
}

// ---- §5 ----------------------------------------------------------------------

/** The three categories a salesperson can act on. `objection` and
 *  `switching_signal` are what they are asked about; `praise` is what they can
 *  repeat. Every one of them is a Pass A category, so nothing here is a second
 *  classification of the same comment. */
const SALES_CATEGORIES = ['objection', 'praise', 'switching_signal'] as const

const SALES_UNREAD_NO_WINDOW =
  'This update covered no window, so there is nothing to read a week of objections out of.'

/** EXPORTED FOR THE WEEKLY REPORT (block D wave 2). WR4 and This week's §7 are
 *  the same reading of the same window, and the weekly artefact had its own
 *  month-scoped loader producing a different shape — two reads, two shapes and
 *  two things to tell a salesperson about one week. One loader, called twice. */
export async function buildSales(input: {
  supabase: SupabaseClient
  clientId: string
  window: WeekWindow | null
  windowVideos: number | null
  subjects: Subject[] | null
  /** The citations read, where the caller started it early: This week starts
   *  it beside its wave 2, before `windowVideos` and `subjects` (which only
   *  label this block) are in. The weekly report passes none and it is read
   *  here. */
  citations?: Promise<SalesCitation[] | null>
  /** The quote gate (walkthrough, 29 Sep; lib/quote-gate.ts), on what is
   *  QUOTED, never on what is counted: a quote under a maker's or a seller's
   *  post, off the market or too short to read ("Bahut ganda hai → Very
   *  dirty") is not printed; a rival's complaint must be that rival's; one
   *  thread gives a group or a list one quote. The weekly report's call does
   *  not pass it. */
  gate?: boolean
}): Promise<ForSalesData> {
  const { supabase, clientId, window } = input
  // GROUPED BY THEME UNTIL SUBJECTS EXIST, AND THE BLOCK SAYS SO. A heading a
  // reader thinks they wrote, when they did not, is worse than a heading that
  // admits whose grouping it is (the thirteen words: a subject is theirs, a
  // theme is ours).
  const grouping: SalesGrouping = input.subjects && input.subjects.length > 0 ? 'subject' : 'theme'
  const base: ForSalesData = {
    window: window ? { from: window.from, to: window.to } : null,
    videos: input.windowVideos,
    grouping,
    objections: [],
    objectionsTotal: null,
    praise: [],
    switching: [],
    switchingTotal: null,
    rivalComplaints: [],
    brief: { href: '/dashboard/reports', label: 'Open the sales brief →' },
    unread: null,
  }
  if (!window) return { ...base, unread: SALES_UNREAD_NO_WINDOW }

  const cited = await (input.citations ?? loadSalesCitations(supabase, clientId, window))
  if (cited == null) return base

  // NO QUOTE FROM UNDER A VIDEO MARKED NOISE (market-first WP2.7). Only the
  // quotes skip: every count below is still of what was read.
  const [noise, gated] = await Promise.all([
    noiseVideos(supabase, clientId, cited.map((c) => c.videoUuid)),
    input.gate ? salesGate(supabase, clientId, cited) : Promise.resolve(null),
  ])
  const quotable = (c: SalesCitation): boolean => !noise.has(c.videoUuid) && (gated ? gated.ok(c) : true)
  const rivalQuotable = (c: SalesCitation): boolean => !noise.has(c.videoUuid) && (gated ? gated.ok(c, rivalNameOf(c.audience)) : true)
  const threadOf = gated ? gated.thread : undefined
  const objections = groupCitations(cited.filter((c) => c.category === 'objection'), undefined, quotable, threadOf)
  const rivalComplaints = groupCitations(
    cited.filter((c) => c.category === 'objection' && c.audience.startsWith('competitor:')),
    (c) => ({ id: c.audience, label: rivalNameOf(c.audience) ?? c.audience }),
    rivalQuotable,
    threadOf,
  )
  // One quote per thread in a list, where the gate is asked for.
  const onePerThread = (list: readonly SalesCitation[]): SalesCitation[] => {
    if (!threadOf) return [...list]
    const seen = new Set<string>()
    return list.filter((c) => {
      const t = threadOf(c)
      if (!t) return true
      if (seen.has(t)) return false
      seen.add(t)
      return true
    })
  }
  // COUNTED BEFORE IT IS CAPPED. Slicing first and counting the slice is how
  // "2 comments · someone said they were moving between brands" came to be
  // printed on both tenants whatever the real number was.
  const switching = cited.filter((c) => c.category === 'switching_signal')
  // AND COUNTED AS COMMENTS, BECAUSE THAT IS WHAT IT SAYS. `cited` holds one
  // row per (insight × evidence) citation, so a comment two switching_signal
  // insights both cite was counted twice — and the number renders as "N
  // comments · someone said they were moving between brands" and freezes into
  // the snapshot as `switching_comments`. Measured read-only over the whole
  // corpus: Sealand 131 citation rows over 122 distinct comments, Össur 58 over
  // 57. Inside this update's window the two happen to agree today.
  const switchingComments = new Set(switching.map((c) => c.commentUuid)).size
  return {
    ...base,
    objections: objections.slice(0, SALES_GROUPS_SHOWN),
    // COUNTED BEFORE IT IS CAPPED, so "N more objections" can name a real N.
    objectionsTotal: objections.length,
    praise: onePerThread(cited.filter((c) => c.category === 'praise' && quotable(c))).slice(0, SALES_PRAISE_SHOWN).map(toSalesQuote),
    switching: onePerThread(switching.filter(quotable)).slice(0, SALES_SWITCHING_SHOWN).map(toSalesQuote),
    switchingTotal: switchingComments,
    rivalComplaints: rivalComplaints.slice(0, SALES_GROUPS_SHOWN),
  }
}

interface SalesCitation {
  category: string
  themeId: string
  themeLabel: string
  audience: string
  videoUuid: string
  /** The comment this citation quotes. One comment can be cited by two
   *  insights, so a count of citations is not a count of comments. */
  commentUuid: string
  evidenceId: string
  quote: string
  lang: string | null
  english: string | null
  platform: string
  commentDate: string | null
  href: string | null
}

/**
 * For Sales' quotes through the quote gate (lib/quote-gate.ts): each
 * citation's comment's video read once, and a verdict per citation — a market
 * quote by default, a rival's where `brand` is named.
 */
async function salesGate(
  supabase: SupabaseClient,
  clientId: string,
  cited: readonly SalesCitation[],
): Promise<{ ok: (c: SalesCitation, brand?: string | null) => boolean; thread: (c: SalesCitation) => string | null }> {
  // By the video's own row id, which each citation carries: one hop.
  const ctx = await readQuoteContext(supabase, clientId, { videoUuids: cited.map((c) => c.videoUuid) })
  const verdict = (c: SalesCitation, brand?: string | null) => quoteGate(
    { text: c.quote, lang: c.lang, english: c.english, video: ctx.forVideoUuid(c.videoUuid) },
    gateFor(clientId, brand ? { brand } : {}),
  )
  return {
    ok: (c, brand) => verdict(c, brand).ok,
    thread: (c) => {
      const v = ctx.forVideoUuid(c.videoUuid)
      return v?.videoId ? `${(v.platform ?? '').toLowerCase()}::${v.videoId}` : null
    },
  }
}

function toSalesQuote(c: SalesCitation): SalesQuote {
  return {
    quote: {
      ref: quoteRef.evidence(c.evidenceId),
      text: c.quote,
      ...(c.lang != null ? { lang: c.lang, english: c.english } : {}),
    },
    cite: [platformLabel(c.platform), c.commentDate ? shortDate(c.commentDate) : null, `under ${underWhose(c.audience)}`]
      .filter(Boolean).join(' · '),
    href: c.href,
  }
}

function underWhose(audience: string): string {
  if (audience === CLIENT_AUDIENCE) return 'your own post'
  if (audience === INDUSTRY_AUDIENCE) return 'a category video'
  return `a ${rivalNameOf(audience) ?? 'rival'} video`
}

/** Citations folded into groups, largest first, counted in DISTINCT VIDEOS.
 *  Comments would let one loud thread outrank a week. */
function groupCitations(
  cited: readonly SalesCitation[],
  keyOf: (c: SalesCitation) => { id: string; label: string } = (c) => ({ id: c.themeId, label: c.themeLabel }),
  /** Whether a citation may be QUOTED (never whether it is counted). */
  quotable: (c: SalesCitation) => boolean = () => true,
  /** The thread a quote sits in, where a group takes one quote per thread
   *  (the quote gate's rule); absent, no such cap. */
  threadOf?: (c: SalesCitation) => string | null,
): SalesGroup[] {
  const held = new Map<string, { label: string; videos: Set<string>; quotes: SalesQuote[]; threads: Set<string> }>()
  for (const c of cited) {
    const { id, label } = keyOf(c)
    const group = held.get(id) ?? { label, videos: new Set<string>(), quotes: [], threads: new Set<string>() }
    group.videos.add(c.videoUuid)
    const thread = threadOf ? threadOf(c) : null
    if (group.quotes.length < SALES_QUOTES_PER_GROUP && quotable(c) && !(thread && group.threads.has(thread))) {
      group.quotes.push(toSalesQuote(c))
      if (thread) group.threads.add(thread)
    }
    held.set(id, group)
  }
  return [...held.entries()]
    .map(([id, g]) => ({ id, label: g.label, videos: g.videos.size, quotes: g.quotes }))
    .sort((a, b) => b.videos - a.videos || a.label.localeCompare(b.label))
}

// ---- §6 ----------------------------------------------------------------------

/** Reddit carries no engagement rate this product can read, so it is excluded
 *  from the median everything here is measured against and the block says so
 *  (the mock's own footnote). */
const ENGAGEMENT_EXCLUDED = ['reddit']

const WORKED_UNREAD =
  'Too few of this update’s videos carry an engagement figure to read a format or a hook against the rest.'

function buildWorked(
  videos: readonly VideoRow[],
  own: { month: string; brand: string; videos: readonly PlaybookVideo[] } | null,
): WorkedBlock {
  const rated = videos.filter((v) => !ENGAGEMENT_EXCLUDED.includes(v.platform) && Number(v.engagement_rate) > 0)
  const perf = rated.map((v) => ({
    engagement_rate: Number(v.engagement_rate),
    hook_style: v.hook_style,
    classified_type: v.classified_type,
  }))
  const formats = perfVsMedian(perf, 'classified_type', { top: WORKED_SHOWN }).map(toWorkedRow)
  const hooks = perfVsMedian(perf, 'hook_style', { top: WORKED_SHOWN }).map(toWorkedRow)
  return {
    formats,
    hooks,
    rated: rated.length,
    excluded: ENGAGEMENT_EXCLUDED.map(platformLabel),
    sides: own ? ownSides(own) : null,
    unread: formats.length === 0 && hooks.length === 0 ? WORKED_UNREAD : null,
  }
}

/**
 * A classifier slug as a reader's label.
 *
 * MOSTLY `cap(pretty(…))`, AND THREE EXCEPTIONS THAT ARE NOT COSMETIC.
 * `hook_style` and `classified_type` are fixed enums (lib/pipeline/schemas.ts)
 * and one of their values — `trend-riding` — humanises to "Trend riding", which
 * carries a DIRECTION WORD: `trend` is in the shared movement vocabulary, so a
 * live Sealand render failed the copy contract with `[direction-word] "Trend"
 * outside a data-copy="verdict" node (D1)` while the block tests passed on
 * invented hook labels. The name of a hook is not a claim about where anything
 * is headed, and the honest answer is to call the hook what it is — it opens on
 * a current sound, format or meme, which is HOOK_STYLE_DEFS' own wording —
 * rather than to exempt one heading from the rule the rest of Phase 1 is built
 * on.
 *
 * The other two are plain readability: "Before after" and "How to" are the slug
 * showing through.
 */
const WORKED_LABELS: Readonly<Record<string, string>> = {
  'trend-riding': 'Riding what is current',
  'before-after': 'Before and after',
  'how-to': 'How-to',
}

export function workedLabel(slug: string): string {
  return WORKED_LABELS[slug] ?? cap(pretty(slug))
}

function toWorkedRow(p: PerfMultiple): WorkedRow {
  return { label: workedLabel(p.k), videos: p.count, engagement: p.avgEng, multiple: p.multiple }
}

// ---- the reads ---------------------------------------------------------------

/** The tenant's rivals, from `competitors` where M1 has landed and from the
 *  tracked list where it has not — one shape either way. */
async function loadRivals(
  supabase: SupabaseClient,
  clientId: string,
): Promise<{ name: string; retiredAt: string | null; firstSeenAt: string | null }[]> {
  try {
    const stored = await loadCompetitors(supabase, clientId)
    // `first_seen_at` IS THE IDENTITY ROW'S, NOT THE TRACKED LIST'S. The
    // fallback below is the tracked list, which is a set of strings and knows
    // no dates — so a workspace without M1 gets `null` and the table prints no
    // start at all, rather than a date read off something that does not record
    // one.
    if (stored.length > 0) return stored.map((r) => ({ name: r.name, retiredAt: r.retired_at, firstSeenAt: r.first_seen_at }))
  } catch (error) {
    if (!isMissingCompetitors(error)) throw error
  }
  const res = await supabase.from('tracking_configs').select('competitor_names').eq('client_id', clientId).maybeSingle()
  const tc = row<{ competitor_names: string[] | null }>(res, 'week.rivals')
  return (tc?.competitor_names ?? []).map((name) => ({ name, retiredAt: null, firstSeenAt: null }))
}

/**
 * How many comments dated INSIDE the window we hold under each of these posts,
 * keyed `platform::video_id`.
 *
 * COUNTED, NOT REPORTED, AND WINDOW-DATED. `videos.comments_count` is the
 * platform's own current number and drifts upward between updates — WR3 prints
 * 106 / 1 / 0 on three Ottobock posts where we hold 95 / 0 / 0 — and this page
 * is about the days the update covered, so the count is of `comments` rows
 * whose `comment_date` falls in the window. That makes it the same clock as
 * `AudienceRow.comments` beside it, which is the only way the two columns can
 * sit on one block.
 *
 * HEAD COUNTS, ONE PER POST, ISSUED TOGETHER. Nothing is fetched: the only
 * thing printed is the integer, and a popular post is thousands of rows. The
 * caller caps at `RIVAL_POSTS_CONSIDERED` per rival — SIX, not the three that
 * are shown, because the pick is two stages and the comment count is what the
 * second stage ranks on. So the cost is six head counts per tracked rival on
 * every load of this page: six on Össur's one rival, eighteen on Sealand's
 * three, covered by `idx_comments_client_platform_video`. That is what keeps
 * this from being a count per post of ninety-two.
 *
 * A COUNT THAT FAILS IS ABSENT FROM THE MAP, and the caller prints 0 for it —
 * the one place this file rounds a silence to a number, because a post row with
 * no comment column at all would be a hole in a table the other rows fill.
 */
async function windowCommentsPerVideo(
  supabase: SupabaseClient,
  clientId: string,
  videos: readonly VideoRow[],
  window: WeekWindow | null,
): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (!window) return out
  const wanted = videos.filter((v) => v.platform && v.video_id)
  if (wanted.length === 0) return out
  const counts = await mapWithLimit(wanted, READ_CONCURRENCY, async (v) => {
    const res = await supabase
      .from('comments')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .eq('platform', v.platform)
      .eq('video_id', v.video_id)
      .gte('comment_date', window.from)
      .lt('comment_date', window.to)
    if (res.error) {
      console.error(`[pages] week.postComments: ${res.error.message}`)
      return null
    }
    return { key: `${v.platform}::${v.video_id}`, count: res.count ?? 0 }
  })
  for (const c of counts) if (c) out.set(c.key, c.count)
  return out
}

/** The rivals this workspace has EVER captured a post of, by audience key.
 *  Measured, not configured: Össur has a handle for Ottobock and zero
 *  competitor-owned videos in six months of gathering. */
async function loadOwnedRivalAudiences(supabase: SupabaseClient, clientId: string): Promise<Set<string>> {
  const held = await selectAll<{ competitor_name: string | null }>(() =>
    supabase.from('videos').select('competitor_name')
      .eq('client_id', clientId).eq('is_competitor', true).eq('source', 'competitor_owned')
      .order('competitor_name', { ascending: true }),
  )
  return new Set(held.map((v) => rivalKey(v.competitor_name)))
}

/** The check's own row for this update. `undefined` means the table is not
 *  installed here; `null` means it is and this update has no row — two
 *  different silences, and §1 prints them the same way only because both mean
 *  "nobody has looked at this update yet". */
async function loadCheck(supabase: SupabaseClient, clientId: string, runId: string): Promise<CheckRow | null | undefined> {
  try {
    const res = await supabase
      .from('anomaly_checks')
      .select('*')
      .eq('client_id', clientId)
      .eq('run_id', runId)
      .maybeSingle()
    if (res.error) throw res.error
    return (res.data as CheckRow | null) ?? null
  } catch (error) {
    if (isMissingAnomalyRecord(error)) return undefined
    console.error(`[pages] week.check: ${(error as { message?: string })?.message ?? String(error)}`)
    return undefined
  }
}

/** The flags this update raised. `null` means the read FAILED — the table is
 *  not installed, or the read was refused — and never "there were none": a
 *  check row that says `flagged` beside an empty list is a record disagreeing
 *  with itself, and §1 says so rather than reading it as silence. */
async function loadFlags(supabase: SupabaseClient, clientId: string, runId: string): Promise<FlagRow[] | null> {
  try {
    return await selectAll<FlagRow>(() =>
      supabase.from('anomaly_flags').select('*')
        .eq('client_id', clientId).eq('run_id', runId)
        .order('rank', { ascending: true }),
    )
  } catch (error) {
    if (!isMissingAnomalyRecord(error)) {
      console.error(`[pages] week.flags: ${(error as { message?: string })?.message ?? String(error)}`)
    }
    return null
  }
}

/** Is this the error the anomaly record gives before M7 lands? Narrow, by the
 *  two table names, exactly as `isMissingMonthlyReading` is narrow: a missing
 *  table before the migration is the expected state and says nothing, and any
 *  other error is news. */
export function isMissingAnomalyRecord(error: unknown): boolean {
  if (!error) return false
  const { code, message } = (typeof error === 'object' ? error : {}) as { code?: string; message?: string }
  const text = message ?? (error instanceof Error ? error.message : String(error))
  if (!/anomaly_(checks|flags)/.test(text)) return false
  if (code && ['PGRST202', 'PGRST205', '42883', '42P01'].includes(code)) return true
  return /in the schema cache/i.test(text) || /does not exist/i.test(text)
}

/** The tenant's subjects, or null where M4 has not landed.
 *
 *  Exported because the weekly report's §3 reads the SAME quotes off the SAME
 *  subjects: two readers of one figure is how an artefact comes to say
 *  something the page it is a copy of cannot. */
export async function loadSubjects(supabase: SupabaseClient, clientId: string): Promise<Subject[] | null> {
  try {
    return await selectAll<Subject>(() =>
      supabase.from(TABLE_SUBJECTS).select('*').eq('client_id', clientId).order('named_at', { ascending: true }),
    )
  } catch (error) {
    if (isMissingSubjects(error)) return null
    throw error
  }
}

async function readSubjectMonths(
  reading: ReadingHandle,
  clientId: string,
  month: string,
): Promise<{ audience: string; subject_id: string; videos: number }[] | null> {
  try {
    return await selectAll<{ audience: string; subject_id: string; videos: number }>(() =>
      reading.client.from('month_subject_readings')
        .select('audience, subject_id, videos')
        .eq('client_id', clientId).eq('month', month)
        .order('audience', { ascending: true }).order('subject_id', { ascending: true }),
    )
  } catch (error) {
    if (isMissingSubjects(error) || isMissingMonthTable(error)) return null
    throw error
  }
}

async function readSubjectWindow(
  reading: ReadingHandle,
  clientId: string,
  window: { from: string; to: string },
): Promise<{ audience: string; subject_id: string; videos: number }[] | null> {
  try {
    return await selectAll<{ audience: string; subject_id: string; videos: number }>(() =>
      reading.client.rpc('window_subject_readings', {
        p_client: clientId, p_from: window.from, p_to: window.to,
      }).order('audience', { ascending: true }),
    )
  } catch (error) {
    if (isMissingSubjects(error) || isMissingMonthlyReading(error)) return null
    throw error
  }
}

/** Every video of this tenant this update touched, either as its discoverer or
 *  as its analyser. The two are different sets and §4 prints both.
 *
 *  NO CAPTION AND NO LINK ON THIS READ. It is every row an update touched
 *  (Sealand's 20 Sep update on staging: 1,565 rows, two pages), and the page
 *  counts them; the only rows whose caption and link are ever printed are the
 *  handful of rival posts §4 weighs (`RIVAL_POSTS_CONSIDERED` per rival), and
 *  those read theirs by id (`loadPostText`). The caption was nearly two thirds
 *  of this read's 1.9 MB, and the read was the long pole of the page's second
 *  wave: on staging (27 Sep) its two pages took 3.2 s and 1.7 s with the
 *  caption, while the rest of the wave was done in about a second. */
async function loadUpdateVideos(supabase: SupabaseClient, clientId: string, runId: string): Promise<VideoRow[]> {
  return selectAll<VideoRow>(() =>
    supabase.from('videos')
      .select('id, platform, video_id, run_id, analyzed_run_id, is_client, is_competitor, competitor_name, source, engagement_rate, hook_style, classified_type, account_name, upload_date, views')
      .eq('client_id', clientId)
      .or(`run_id.eq.${runId},analyzed_run_id.eq.${runId}`)
      .order('id', { ascending: true }),
  )
}

/** The caption and link of the rival posts §4 weighs, by video row id. Tens of
 *  ids (six per tracked rival), so one chunk; a failure throws, as the read it
 *  was split from did. */
async function loadPostText(supabase: SupabaseClient, clientId: string, ids: readonly string[]): Promise<Map<string, PostText>> {
  if (ids.length === 0) return new Map()
  const held = await inChunks<PostText & { id: string }>(ids, (part) => () =>
    supabase.from('videos').select('id, caption, video_url')
      .eq('client_id', clientId).in('id', part)
      .order('id', { ascending: true }),
  )
  return new Map(held.map((v) => [v.id, { caption: v.caption, video_url: v.video_url }]))
}

/**
 * The themed update before this one, and the regime it clustered under, or
 * null when there is none to compare with.
 *
 * THE NEWEST THEME ROW WRITTEN BEFORE THIS UPDATE STARTED, from any other
 * run: `themes` keeps each run's rows (persist deletes only its own run's), so
 * the row IS the evidence that run themed, which is `pickThemedRunId`'s rule.
 * A failed run that wrote themes counts: it moved the registry this update
 * matched against. Bounded by this update's start, so a run in flight after
 * it is never "before" it. Two small reads, and only when the update minted
 * anything. A read that fails answers null, which keeps today's list.
 * Exported for its test (lib/pages/week.test.ts).
 */
export async function previousThemedRegime(
  supabase: SupabaseClient,
  clientId: string,
  runId: string,
  startedAt: string | null,
): Promise<{ key: string | null } | null> {
  if (!startedAt) return null
  const themeRes = await supabase.from('themes').select('run_id, created_at')
    .eq('client_id', clientId).neq('run_id', runId).not('run_id', 'is', null)
    .lt('created_at', startedAt)
    .order('created_at', { ascending: false }).limit(1)
  const previousId = pickThemedRunId(rows<ThemedRunRow>(themeRes, 'week.previousThemedRun'))
  if (!previousId) return null
  // `*`, for the reason `loadWeek` reads the anchor that way: an absent column
  // arrives as an absent key rather than a 42703.
  const runRes = await supabase.from('pipeline_runs').select('*').eq('client_id', clientId).eq('id', previousId).maybeSingle()
  const previous = row<RunRow>(runRes, 'week.previousThemedRegime')
  return previous ? { key: previous.clustering_key ?? null } : null
}

/**
 * Themes first heard in this update, and the ones that clear the floor.
 *
 * AN UPDATE THAT OPENED A NEW CLUSTERING REGIME HEARD NOTHING FOR THE FIRST
 * TIME (market-first WP1.9). Its minted identities are the corpus re-grouped,
 * so they leave the list and are counted as `regrouped` instead. Exported for
 * its test, which runs it against a stubbed client (lib/pages/week.test.ts).
 *
 * AND A THEME AN EARLIER MONTH HOLDS WAS NOT HEARD FOR THE FIRST TIME (the
 * deploy-3 review). An update can mint an identity and stamp earlier months
 * under it (staging's 20 Sep update gave four of its six minted themes August
 * rows), so "minted by this update" is not "first heard". The rule is
 * Conversation's New (plan WP2.4: no row for the registry id in any earlier
 * month, in any audience), read in the same request as the month's counts:
 * one read, as before.
 */
export async function loadNewThemes(
  supabase: SupabaseClient,
  clientId: string,
  runId: string,
  month: string,
  regime: { clusteringKey: string | null | undefined; startedAt: string | null; date: string },
  /** One audience's videos only (the front page's arrivals read the category,
   *  where themes are grouped: decision E); every audience's by default. */
  opts: { audience?: string } = {},
): Promise<{ seen: number; shown: NewTheme[]; regrouped: Regrouped | null }> {
  const fresh = await selectAll<{ registry_id: string | null; label: string | null }>(() =>
    supabase.from('themes').select('registry_id, label')
      .eq('client_id', clientId).eq('run_id', runId).eq('first_seen', true)
      .order('id', { ascending: true }),
  )
  const ids = [...new Set(fresh.map((t) => t.registry_id).filter((id): id is string => Boolean(id)))]
  if (ids.length === 0) return { seen: 0, shown: [], regrouped: null }

  const regrouped = regroupedFor(ids, regime, await previousThemedRegime(supabase, clientId, runId, regime.startedAt))
  if (regrouped) return { seen: 0, shown: [], regrouped }

  const m = monthStartOf(month)
  let readings: { theme_id: string; videos: number; month?: string | null; audience?: string | null }[] = []
  try {
    // Every audience and every month to this one, with videos: the month's
    // rows are the counts (one audience's, where asked), the earlier months'
    // say which identities were heard before.
    readings = await inChunks<{ theme_id: string; videos: number; month?: string | null; audience?: string | null }>(ids, (part) => () =>
      supabase.from('month_theme_readings').select('theme_id, videos, month, audience')
        .eq('client_id', clientId).lte('month', m).gt('videos', 0)
        .in('theme_id', part)
        .order('theme_id', { ascending: true }).order('month', { ascending: true }).order('audience', { ascending: true }),
      // ONE THEME IS NOT ONE ROW HERE. `month_theme_readings` is keyed
      // (client_id, month, audience, theme_id) and this read names no audience
      // and every month to this one, so it gives a row per theme PER AUDIENCE
      // PER MONTH — the client, the industry and every rival. What binds a chunk of this shape is the ROW
      // cap, not the URL cap: PostgREST answers 1,000 rows at a time and
      // `selectAll` pages the rest SERIALLY, inside a chunk that was going to be
      // one of several concurrent requests. lib/chunk.ts MULTI_ROW_IN_CHUNK has
      // the arithmetic — and `mapWithLimit` beside it has the other half: the
      // chunks go out together, so the `isMissingMonthTable` guard below learns
      // a missing table after up to min(chunks, READ_CONCURRENCY) requests
      // rather than after one. AND HERE THE ROWS PER ID ARE FEW: only rows
      // with videos, and an identity an update mints is mostly one audience
      // in one month (staging's 20 Sep update: 468 minted, 541 rows), so the
      // URL cap binds first (UUID_IN_CHUNK: two reads there, not five; the
      // deploy-3 read budget). A chunk that does run past 1,000 rows pages.
      // (lib/chunk.ts's table still lists this reader at 100: that file is on
      // the freeze-months path and does not change before the 4 Oct run; the
      // fold-back after it corrects the row.)
      UUID_IN_CHUNK,
    )
  } catch (error) {
    if (!isMissingMonthTable(error)) throw error
    return { seen: ids.length, shown: [], regrouped: null }
  }

  const videosById = new Map<string, number>()
  const heardBefore = new Set<string>()
  for (const r of readings) {
    // A row with no month is the month read (the reads name it).
    const rm = r.month ? monthStartOf(r.month) : m
    if (rm < m) {
      if ((r.videos ?? 0) > 0) heardBefore.add(r.theme_id)
      continue
    }
    if (rm !== m || (opts.audience && r.audience && r.audience !== opts.audience)) continue
    videosById.set(r.theme_id, (videosById.get(r.theme_id) ?? 0) + (r.videos ?? 0))
  }
  const labelById = new Map<string, string>()
  for (const t of fresh) if (t.registry_id && t.label) labelById.set(t.registry_id, t.label)

  const firstHeard = ids.filter((id) => !heardBefore.has(id))
  const shown = firstHeard
    .map((id) => ({ id, label: labelById.get(id) ?? 'An unnamed theme', videos: videosById.get(id) ?? 0 }))
    .filter((t) => t.videos >= NEW_THEME_FLOOR)
    .sort((a, b) => b.videos - a.videos)
  return { seen: firstHeard.length, shown, regrouped: null }
}

/**
 * "Heard for the first time" for an update, on the month (WP3.7): the themes
 * it first heard, on the CATEGORY, where themes are grouped (decision E; the
 * front page's arrivals read the same audience), each with its maker share
 * (`theme_maker_shares`, one read) and, for the ones the block lists, how many
 * of its videos came from searches first run in the month (the board's
 * provenance reads). A failed read degrades to what the others answer: no
 * shares means nothing grouped and "not measured", no provenance means none.
 */
export async function loadHeard(input: {
  supabase: SupabaseClient
  client: SupabaseClient
  clientId: string
  runId: string
  month: string
  themedRunId: string | null
  regime: { clusteringKey: string | null | undefined; startedAt: string | null; date: string }
}): Promise<HeardBlock> {
  const { supabase, client, clientId, runId } = input
  const month = monthStartOf(input.month)
  const [fresh, segmentRows] = await Promise.all([
    loadNewThemes(supabase, clientId, runId, month, input.regime, { audience: INDUSTRY_AUDIENCE }).catch((error: unknown) => {
      console.error(`[pages] week.heard: ${(error as { message?: string })?.message ?? String(error)}; none named`)
      return { seen: 0, shown: [] as NewTheme[], regrouped: null }
    }),
    loadThemeSegmentRows(client, clientId, month, input.themedRunId).catch(() => null),
  ])
  const segmentsState: HeardBlock['segments'] = !makerRuleEnabled(clientId) ? 'no_rule' : segmentRows ? 'measured' : 'unknown'
  const segments = segmentRows ? themeSegmentsOf(segmentRows) : null
  const first = heardBlockOf({ month, fresh, segments, segmentsState, provenance: new Map() })
  if (first.rows.length === 0) return first
  const provenance = await loadThemesProvenance(client, clientId, month, first.rows.map((r) => r.registryId), addedSearchesRead(client, clientId, month))
    .catch(() => new Map<string, { fromNewSearches: number; of: number } | null>())
  return heardBlockOf({ month, fresh, segments, segmentsState, provenance })
}

/**
 * The reply queue's comments that sit under a video marked noise, and under a
 * maker's own post (WP3.7), by the segments reader precedence
 * (`segments_for_videos`: an override, else a judge, else a stored rule row,
 * else the segments_v1 rule inline). The noise filter's own reads
 * (lib/pages/noise.ts), taken once for both answers: each comment's video,
 * then the segments. Only for a tenant with the rule switched on; fails open
 * (nothing skipped, nothing tagged), and says so in the log.
 */
async function replySegments(
  supabase: SupabaseClient,
  clientId: string,
  commentIds: readonly string[],
): Promise<{ noise: Set<string>; maker: Set<string> }> {
  const out = { noise: new Set<string>(), maker: new Set<string>() }
  const ids = [...new Set(commentIds.filter(Boolean))]
  if (!segmentRulesEnabled(clientId) || ids.length === 0) return out
  try {
    const comments = (await Promise.all(chunk(ids, UUID_IN_CHUNK).map(async (part) => {
      const res = await supabase.from('comments').select('id, platform, video_id').eq('client_id', clientId).in('id', part)
      if (res.error) throw res.error
      return (res.data ?? []) as { id: string; platform: string; video_id: string }[]
    }))).flat()
    const native = [...new Set(comments.map((c) => c.video_id).filter(Boolean))]
    const videos = (await Promise.all(chunk(native, UUID_IN_CHUNK).map(async (part) => {
      const res = await supabase.from('videos').select('id, platform, video_id').eq('client_id', clientId).in('video_id', part)
      if (res.error) throw res.error
      return (res.data ?? []) as { id: string; platform: string; video_id: string }[]
    }))).flat()
    const uuidOf = new Map(videos.map((v) => [`${v.platform}::${v.video_id}`, v.id]))
    if (uuidOf.size === 0) return out
    const res = await supabase.rpc(RPC_SEGMENTS_FOR_VIDEOS, { p_client: clientId, p_video_ids: [...new Set(uuidOf.values())] })
    if (res.error) throw res.error
    const segment = new Map(((res.data ?? []) as { video_id: string; segment: string | null }[]).map((r) => [String(r.video_id), r.segment]))
    for (const c of comments) {
      const s = segment.get(uuidOf.get(`${c.platform}::${c.video_id}`) ?? '')
      if (s === 'noise') out.noise.add(c.id)
      else if (s === 'maker') out.maker.add(c.id)
    }
    return out
  } catch (error) {
    console.error(`[pages] week.replySegments: ${(error as { message?: string })?.message ?? String(error)}; no quote skipped or tagged`)
    return out
  }
}

/**
 * The unusual-week check's baseline on comparable months only (WP3.7, the
 * rule the run's check reads since WP3.4): how many of the three months behind
 * `month` sit in it, and the first month whose weeks can be flagged, if
 * nothing we search changes (the first pair read the same way starts a run of
 * comparable months; three of them make a baseline). Off the pair rows and the
 * change log the page's month-pair judge already read (memoised: no new read).
 * Null where either cannot be read.
 */
export async function comparableBaselineOf(
  reading: ReadingHandle,
  clientId: string,
  month: string,
  now: string,
): Promise<{ kept: number; required: number; flagsFrom: string | null } | null> {
  try {
    const [log, rows] = await Promise.all([loadChanges(reading.client, clientId), loadPairRows(reading.client, clientId, null)])
    return comparableBaselineFrom({ month, now, changes: ourChangesWithoutGatherFlags(log), rows })
  } catch (error) {
    console.error(`[pages] week.comparableBaseline: ${(error as { message?: string })?.message ?? String(error)}; the forming line alone`)
    return null
  }
}

/** `comparableBaselineOf`'s arithmetic, pure. */
export function comparableBaselineFrom(input: {
  month: string
  now: string
  changes: Parameters<typeof baselineStepOf>[1]
  rows: Parameters<typeof baselineStepOf>[0]
}): { kept: number; required: number; flagsFrom: string | null } {
  const month = monthStartOf(input.month)
  const trailing = [1, 2, 3].map((n) => backMonths(month, n)).slice(0, BASELINE_MONTHS)
  const { kept } = comparableBaseline(trailing, month, baselineStepOf(input.rows, input.changes))
  if (kept.length >= BASELINE_MONTHS) return { kept: kept.length, required: BASELINE_MONTHS, flagsFrom: null }
  const next = nextComparablePair(input.now, input.changes, input.rows, { view: 'market' })
  return { kept: kept.length, required: BASELINE_MONTHS, flagsFrom: next ? monthsAfter(next.prevMonth, BASELINE_MONTHS) : null }
}

/** The citations behind one theme, as quotes with their cite line. */
async function loadThemeQuotes(
  supabase: SupabaseClient,
  clientId: string,
  themedRunId: string,
  registryId: string,
  limit: number,
  /** The theme's label: its quotes pass the quote gate (lib/quote-gate.ts)
   *  and speak to it. */
  label: string | null = null,
): Promise<{ quote: Quote; cite: string; href: string | null }[]> {
  const themeRes = await supabase
    .from('themes').select('supporting_insight_ids')
    .eq('client_id', clientId).eq('run_id', themedRunId).eq('registry_id', registryId).limit(1)
  const theme = rows<{ supporting_insight_ids: string[] | null }>(themeRes, 'week.themeQuotes')[0]
  const insightIds = (theme?.supporting_insight_ids ?? []).slice(0, 40)
  if (insightIds.length === 0) return []

  const citations = await fetchQuoteCitationsByAudience(supabase, insightIds)
  const pool: QuoteCitation[] = []
  const seen = new Set<string>()
  for (const id of insightIds) {
    for (const c of (citations.get(id) ?? []).sort((a, b) => a.rank - b.rank)) {
      const text = cleanQuote(c.quote)
      const key = text.toLowerCase()
      if (!text || seen.has(key) || !readsAsHeroQuote(text, c)) continue
      seen.add(key)
      pool.push({ ...c, quote: text })
    }
  }
  return citeQuotes(supabase, clientId, await gateCitations(supabase, clientId, pool, limit, gateFor(clientId, { claim: label, requireRelevance: true })))
}

/** Citations through the quote gate (lib/quote-gate.ts): the first `n` that
 *  pass, best first, one per thread. */
async function gateCitations(
  supabase: SupabaseClient,
  clientId: string,
  pool: readonly QuoteCitation[],
  n: number,
  gate: GateOptions,
): Promise<QuoteCitation[]> {
  if (pool.length === 0) return []
  const ctx = await readQuoteContext(supabase, clientId, {
    commentIds: pool.map((c) => c.commentId),
    evidenceIds: pool.filter((c) => !c.commentId).map((c) => c.evidenceId),
  })
  return pickEligible(pool, (c) => ({
    text: c.quote,
    lang: c.lang ?? null,
    english: c.english ?? null,
    video: c.commentId ? ctx.forComment(c.commentId) : ctx.forEvidence(c.evidenceId),
  }), n, gate)
}

/** Turn citations into quotes with a platform · date · link cite. */
async function citeQuotes(
  supabase: SupabaseClient,
  clientId: string,
  shown: readonly QuoteCitation[],
): Promise<{ quote: Quote; cite: string; href: string | null }[]> {
  if (shown.length === 0) return []
  const commentIds = shown.map((c) => c.commentId).filter((id): id is string => Boolean(id))
  type Meta = { id: string; platform: string | null; comment_date: string | null; video_id: string | null; comment_id: string | null }
  const meta = new Map<string, Meta>()
  if (commentIds.length > 0) {
    const res = await supabase.from('comments')
      .select('id, platform, comment_date, video_id, comment_id')
      .eq('client_id', clientId).in('id', commentIds)
    for (const c of rows<Meta>(res, 'week.quoteComments')) meta.set(c.id, c)
  }
  const nativeIds = [...new Set([...meta.values()].map((m) => m.video_id).filter((v): v is string => Boolean(v)))]
  const urlByKey = new Map<string, string>()
  if (nativeIds.length > 0) {
    const res = await supabase.from('videos').select('platform, video_id, video_url').eq('client_id', clientId).in('video_id', nativeIds)
    for (const v of rows<{ platform: string | null; video_id: string | null; video_url: string | null }>(res, 'week.quoteVideos')) {
      if (v.video_url && v.video_id) urlByKey.set(`${v.platform}::${v.video_id}`, v.video_url)
    }
  }
  return shown.map((c) => {
    const m = c.commentId ? meta.get(c.commentId) : undefined
    const url = m?.platform && m.video_id ? urlByKey.get(`${m.platform}::${m.video_id}`) ?? null : null
    return {
      quote: {
        ref: quoteRef.evidence(c.evidenceId),
        text: c.quote,
        ...(c.lang != null ? { lang: c.lang, english: c.english ?? null } : {}),
      },
      cite: [m?.platform ? platformLabel(m.platform) : null, m?.comment_date ? shortDate(m.comment_date) : null]
        .filter(Boolean).join(' · '),
      href: citationLink(m?.platform ?? null, url, m?.comment_id ?? null).href,
    }
  })
}

/**
 * What a stored ref points AT, split by the door it has to be resolved through.
 *
 * THE WRITER SAYS `c:<comments.id>` AND THIS READER HAS TO SAY SO TOO. The
 * check builds a flag's refs out of the comments its explainer was shown
 * (lib/pipeline/anomaly-check.ts `candidateQuotes`), and a comment reaches an
 * evidence row through `insight_evidence.comment_id`, not through its id — so a
 * reader that only knew `e:` dropped every ref the shipped check writes and
 * printed the flag with nothing under it. Both prefixes are taken, and a BARE
 * uuid is taken as a comment id: the column was written bare until 2026-09-16
 * and nothing that reads it should care which deploy wrote the row.
 */
export function refTargets(refs: readonly string[]): { evidenceIds: string[]; commentIds: string[] } {
  const evidenceIds = new Set<string>()
  const commentIds = new Set<string>()
  for (const ref of refs) {
    const parsed = parseRef(ref)
    if (parsed && 'id' in parsed && parsed.kind === 'e') evidenceIds.add(parsed.id)
    else if (parsed && 'id' in parsed && (parsed.kind === 'c' || parsed.kind === 'm')) commentIds.add(parsed.id)
    else if (!parsed && ref.trim()) commentIds.add(ref.trim())
  }
  return { evidenceIds: [...evidenceIds], commentIds: [...commentIds] }
}

/** Resolve stored refs into quotes — the flags' own evidence. */
async function resolveRefs(
  supabase: SupabaseClient,
  clientId: string,
  refs: readonly string[],
): Promise<{ quote: Quote; cite: string; href: string | null }[]> {
  if (refs.length === 0) return []
  const { evidenceIds, commentIds } = refTargets(refs)
  if (evidenceIds.length === 0 && commentIds.length === 0) return []
  const [byId, byComment] = await Promise.all([
    evidenceIds.length > 0
      ? supabase.from('insight_evidence').select('id, comment_id, audience_insight_id').in('id', evidenceIds)
      : null,
    commentIds.length > 0
      ? supabase.from('insight_evidence').select('id, comment_id, audience_insight_id').in('comment_id', commentIds)
      : null,
  ])
  type EvidenceRow = { id: string; comment_id: string | null; audience_insight_id: string }
  const found = [
    ...(byId ? rows<EvidenceRow>(byId, 'week.flagEvidence') : []),
    ...(byComment ? rows<EvidenceRow>(byComment, 'week.flagEvidenceByComment') : []),
  ]
  // SCOPED TO THE TENANT — ON THE PARENT, because `insight_evidence` carries no
  // `client_id` (schema-baseline.sql: nine columns, none of them a tenant) and
  // is scoped everywhere in this product through the insight above it. The ids
  // come off this tenant's own flag rows and the app path hands in an
  // RLS-scoped session client, so today this is belt and braces — but WP17 and
  // WP19 will hand this loader an ADMIN client for an export, and an unscoped
  // `in()` under one is a cross-tenant read waiting for the day the ids are not
  // ours. Filtering the parents is enough: the citations below are fetched for
  // these and nothing else.
  const parents = await tenantInsights(supabase, clientId, [...new Set(found.map((e) => e.audience_insight_id))])
  if (parents.length === 0) return []
  const citations = await fetchQuoteCitationsByAudience(supabase, parents)
  const wantedEvidence = new Set([...evidenceIds, ...found.filter((e) => e.comment_id && commentIds.includes(e.comment_id)).map((e) => e.id)])
  const wantedComments = new Set(commentIds)
  const pool: QuoteCitation[] = []
  for (const list of citations.values()) {
    for (const c of list) {
      if (!wantedEvidence.has(c.evidenceId) && !(c.commentId && wantedComments.has(c.commentId))) continue
      const text = cleanQuote(c.quote)
      if (text) pool.push({ ...c, quote: text })
    }
  }
  // Through the quote gate (walkthrough, 29 Sep): a flag's evidence is
  // printed only where it is a quote the market could be read by.
  return citeQuotes(supabase, clientId, await gateCitations(supabase, clientId, pool, refs.length, gateFor(clientId)))
}

/** Of these insight ids, the ones that belong to this tenant. `audience_insights`
 *  is where the tenant lives; `insight_evidence` has no `client_id` of its own. */
async function tenantInsights(
  supabase: SupabaseClient,
  clientId: string,
  ids: readonly string[],
): Promise<string[]> {
  if (ids.length === 0) return []
  const held = await inChunks<{ id: string }>(ids, (part) => () =>
    supabase.from('audience_insights').select('id').eq('client_id', clientId).in('id', part).order('id', { ascending: true }),
  )
  return held.map((r) => r.id)
}

/**
 * The comments this update's window carried that Pass A called an objection,
 * praise or a switch — with the video they sat under, so a group can be counted
 * in distinct videos and a rival's complaints told from the category's.
 *
 * `audience_insights_current`, never `eq('run_id')`: Pass A is incremental, and
 * "the insights this corpus currently holds" is the population a week is drawn
 * from (AGENTS.md). The WINDOW is applied to the COMMENT's date, which is the
 * one clock this product keeps — an insight written by this update out of a
 * comment written in March is March's.
 */
async function loadSalesCitations(
  supabase: SupabaseClient,
  clientId: string,
  window: WeekWindow,
): Promise<SalesCitation[] | null> {
  // THE CITED COMMENTS, NOT THE WINDOW'S. Reading every comment written in
  // these days and intersecting in memory is one paged read on a week and a
  // statement timeout on a thirty-day window (Sealand's, measured: 9,000-odd
  // rows). Reading only the comments a sales insight actually cites, with the
  // window applied in the database so each chunk comes back nearly empty, is
  // the same answer off a fraction of the rows.
  const insights = await selectAll<{ id: string; category: string; theme: string | null }>(() =>
    supabase.from('audience_insights_current')
      .select('id, category, theme')
      .eq('client_id', clientId)
      .in('category', [...SALES_CATEGORIES])
      .order('id', { ascending: true }),
  )
  if (insights.length === 0) return []
  const byInsight = new Map(insights.map((i) => [i.id, i]))

  // WITHOUT THE ENGLISH, WHICH IS READ FOR THE WINDOW'S CITATIONS (below).
  const citations = await citationsUntranslated(supabase, insights.map((i) => i.id))
  const citedComments = new Set<string>()
  for (const list of citations.values()) for (const c of list) if (c.commentId) citedComments.add(c.commentId)
  if (citedComments.size === 0) return []

  type CommentRow = { id: string; platform: string; video_id: string; comment_id: string; comment_date: string | null }
  const comments = await inChunks<CommentRow>([...citedComments], (part) => () =>
    supabase.from('comments').select('id, platform, video_id, comment_id, comment_date')
      .eq('client_id', clientId)
      .in('id', part)
      .gte('comment_date', window.from)
      .lt('comment_date', window.to)
      .order('id', { ascending: true }),
  )
  if (comments.length === 0) return []
  const byComment = new Map(comments.map((c) => [c.id, c]))

  // The English of the citations the window kept, beside the videos they sat
  // under: the two reads take the comments' answer and not each other's.
  const inWindow: string[] = []
  for (const list of citations.values()) for (const c of list) if (c.commentId && byComment.has(c.commentId)) inWindow.push(c.quote)
  const [videos, translations] = await Promise.all([
    inChunks<{ id: string; platform: string; video_id: string; video_url: string | null; is_client: boolean | null; is_competitor: boolean | null; competitor_name: string | null }>(
      comments.map((c) => c.video_id),
      (part) => () =>
        supabase.from('videos')
          .select('id, platform, video_id, video_url, is_client, is_competitor, competitor_name')
          .eq('client_id', clientId)
          .in('video_id', part)
          .order('id', { ascending: true }),
    ),
    readTranslations(supabase, inWindow),
  ])
  const videoByKey = new Map(videos.map((v) => [`${v.platform}::${v.video_id}`, v]))

  const out: SalesCitation[] = []
  for (const [insightId, list] of citations) {
    const insight = byInsight.get(insightId)
    if (!insight) continue
    for (const c of [...list].sort((a, b) => a.rank - b.rank)) {
      const comment = c.commentId ? byComment.get(c.commentId) : undefined
      if (!comment) continue
      const video = videoByKey.get(`${comment.platform}::${comment.video_id}`)
      if (!video) continue
      const text = cleanQuote(c.quote)
      if (!text) continue
      const reading = readingOf(translations, c.quote)
      out.push({
        category: insight.category,
        themeId: insight.theme ?? insightId,
        // A THEME SLUG IS NOT A HEADING. Pass A writes `brand_controversy`;
        // a salesperson reads "Brand controversy". Humanised here rather than
        // in the block, because the email arm has no stylesheet to capitalise
        // with and the report will want the same words.
        themeLabel: insight.theme ? cap(pretty(insight.theme)) : 'Unnamed',
        audience: video.is_client ? CLIENT_AUDIENCE : video.is_competitor ? rivalKey(video.competitor_name) : INDUSTRY_AUDIENCE,
        videoUuid: video.id,
        commentUuid: comment.id,
        evidenceId: c.evidenceId,
        quote: text,
        lang: reading.lang ?? null,
        english: reading.english ?? null,
        platform: comment.platform,
        commentDate: comment.comment_date,
        href: citationLink(comment.platform, video.video_url ?? null, comment.comment_id).href,
      })
    }
  }
  return out
}

/**
 * One `.in()` read, in chunks of a hundred ids, issued together.
 *
 * NOT A REFINEMENT — THE UNCHUNKED VERSION IS A 400 AND THE SERIAL VERSION IS A
 * TIMEOUT. PostgREST puts an `in()` list in the query string, and a thousand
 * uuids is a URL no gateway will take: this page's first run against production
 * came back "selectAll: Bad Request" from exactly that. Slicing the list
 * instead would be worse — the read would succeed and silently answer about the
 * first hundred rows. And chunking it serially cost five thousand ids fifty
 * round trips, measured at 17 s on Össur and a statement timeout on Sealand's
 * thirty-day window, so the chunks go out together (`Promise.all`, the shape
 * lib/engage.ts has used since the digest shipped). Chunks are disjoint and
 * concatenating them in chunk order keeps the output order a serial loop
 * produced.
 *
 * THE SIZE IS PART OF THE OUTPUT ORDER, SO CHANGING IT IS NOT ONLY A
 * PERFORMANCE CHANGE. The output is chunk order, then row order within a chunk,
 * so where the boundary falls decides the sequence — and `tenantInsights`'
 * sequence reaches `fetchQuoteCitationsByAudience`, whose Map is keyed in the
 * order the EVIDENCE ROWS arrive, and then `pool.slice(0, refs.length)`. That
 * chain is exactly how a chunk size in lib/quotes.ts turned out to be choosing
 * four of Sealand's "For sales" quotes (the note beside `fetchChunks`, which is
 * pinned at 120 for that reason). It is bounded here today — a flag's refs are
 * a handful, so a caller almost never has more than one chunk — but "bounded
 * today" is a thing to check, not to assume: anyone moving this size should
 * diff the loader's whole output on both tenants, because no test states what
 * the order should be.
 */
async function inChunks<T>(
  ids: readonly string[],
  build: (part: string[]) => Parameters<typeof selectAll<T>>[0],
  size: number = UUID_IN_CHUNK,
): Promise<T[]> {
  const parts = chunk([...new Set(ids)], size)
  const pages = await mapWithLimit(parts, READ_CONCURRENCY, (part) => selectAll<T>(build(part)))
  return pages.flat()
}

// ---- small arithmetic --------------------------------------------------------

const share = (k: number, n: number): number => (n > 0 ? (k / n) * 100 : 0)

/** The month start `n` months before this one. */
function backMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, (m - 1) - n, 1))
  return d.toISOString().slice(0, 10)
}

function previousMonthOf(month: string): string {
  return backMonths(month, 1)
}

/** The `n` complete months before this one, oldest first. */
function trailingMonths(month: string, n: number): string[] {
  const out: string[] = []
  for (let i = n; i >= 1; i -= 1) out.push(backMonths(month, i))
  return out
}

function sumMonth(denominators: readonly { month: string; videos: number }[], month: string): number {
  return denominators.reduce((t, d) => (d.month === month ? t + (d.videos ?? 0) : t), 0)
}

function sumAudienceMonth(
  denominators: readonly { month: string; audience: string; videos: number }[],
  month: string,
  audience: string,
): number {
  return denominators.reduce((t, d) => (d.month === month && d.audience === audience ? t + (d.videos ?? 0) : t), 0)
}

function totalVideos(denominators: { videos: number }[] | null): number | null {
  if (denominators == null) return null
  return denominators.reduce((t, d) => t + (d.videos ?? 0), 0)
}

function totalComments(denominators: { comments: number }[] | null): number | null {
  if (denominators == null) return null
  return denominators.reduce((t, d) => t + (d.comments ?? 0), 0)
}

function mergeMix(mixes: readonly PlatformMix[]): PlatformMix {
  const out: PlatformMix = {}
  for (const mix of mixes) for (const [k, v] of Object.entries(mix)) out[k] = (out[k] ?? 0) + v
  return out
}

/**
 * The pooled baseline this page states the check's readiness from.
 *
 * Every audience together, three complete months, the same slice the check
 * itself pools (decision S) — so the sentence "baseline forming: 1 of 3
 * months" on this page and the one the check writes into `anomaly_checks` are
 * the same reading and not two.
 */
export function pooledBaseline(
  denominators: readonly { month: string; videos: number }[],
  month: string,
  weekVideos: number,
): BaselineState {
  const months: DenominatorMonth[] = trailingMonths(month, BASELINE_MONTHS).map((m) => ({
    month: m,
    videos: sumMonth(denominators, m),
  }))
  return baselineStateOf({ name: 'every audience together', weekVideos, months })
}

// ---- Week by week (market-first decision M, part 1; WP2.9) ---------------------------

export const RPC_MARKET_WEEK_VOLUMES = 'market_week_volumes'
export const TABLE_WEEK_LINE_READS = 'week_line_reads'

/**
 * The weekly volume bars' reads, for Your market (inside "With this update")
 * and for This week (`week.weeks`): ONE read of MF4's `market_week_volumes`
 * over the axis (the weeks overlapping the month read and the month before,
 * through the current week), with the updates, the change log and the
 * schedule the page already holds, built by the one pure builder both pages
 * call (`weekVolumesBlock`). A second, small read of the kept weeks
 * (`week_line_reads`) is made only once a week's due date has passed, so the
 * pending row can say which are kept; before then none can be.
 *
 * NULL, AND THE BLOCK SAYS NOTHING OF WEEKS, where MF4 cannot be read (not
 * applied, or an error): no count is printed that nothing counted.
 */
export async function loadWeekVolumes(input: {
  client: SupabaseClient
  clientId: string
  reading: Pick<ReadingMonth, 'month'>
  now: string
  /** Finish instants of completed or partial runs. */
  updates: readonly string[]
  rivalAudiences: readonly string[]
  changeRows: readonly ConfigChange[]
  schedule: ScheduleConfig | null
  /** Your market's (WP3.13 display): read the kept same-age line once
   *  `WEEK_LINE` says print, its six kinds alone (a subject's weeks are
   *  Subjects' strip). This week draws no line (§2.7) and does not ask. */
  keptLine?: boolean
}): Promise<WeekVolumesBlock | null> {
  const { client, clientId } = input
  const axis = weekAxis(input.reading, input.now)
  if (axis.length === 0) return null
  const cfg = weekLineConfigFor(clientId)
  const keptAhead = input.keptLine && cfg?.print ? loadKeptWeekLine(client, { clientId, cfg, rivalAudiences: input.rivalAudiences, kindsOnly: true }) : null
  keptAhead?.catch(() => {})
  const [res, runs] = await Promise.all([
    client.rpc(RPC_MARKET_WEEK_VOLUMES, { p_client: clientId, p_from: axis[0], p_to: addDays(axis[axis.length - 1], 7) }),
    // The bars' cadence test (`chartCadenceBroken`): every run, any status.
    // Unreadable, the bars are not drawn rather than drawn unchecked.
    loadCadenceRuns(client, clientId).catch((e: unknown) => {
      console.error(`[pages] cadence runs: ${e instanceof Error ? e.message : String(e)}; week by week is not drawn`)
      return null
    }),
  ])
  if (res.error) {
    console.error(`[pages] ${RPC_MARKET_WEEK_VOLUMES}: ${res.error.message}; week by week is not drawn`)
    return null
  }
  if (!runs) return null
  const block = weekVolumesBlock({
    runs,
    reading: input.reading,
    now: input.now,
    updates: input.updates,
    rows: ((res.data ?? []) as MarketWeekRowRaw[]).map(marketWeekRowOf),
    rivalAudiences: input.rivalAudiences,
    changes: ourChangesWithoutGatherFlags(input.changeRows),
    cfg,
    nextUpdateAfter: input.schedule ? scheduledUpdateAfter(input.schedule) : null,
    line: keptAhead ? (await keptAhead.catch(() => null))?.line ?? null : null,
  })
  const line = block.line
  if (line && 'state' in line) {
    // WHEN A DUE DATE HAS PASSED, so the pending row can tell one still ahead
    // from one that has come and gone (the deploy-3 review: on 1 Nov the row
    // still said "due 18 Oct"): the latest update's day, or two days before
    // the clock (`passedBeforeOf`).
    const nowMs = Date.parse(input.now)
    const latest = input.updates.filter((u) => !(Date.parse(u) > nowMs)).sort().pop() ?? null
    line.passedBefore = passedBeforeOf(latest, input.now)
  }
  if (cfg && line && 'state' in line && line.due.some((d) => d.date <= input.now.slice(0, 10))) {
    const kept = await client.from(TABLE_WEEK_LINE_READS).select('week')
      .eq('client_id', clientId).eq('method_version', cfg.methodVersion).eq('age_days', cfg.ageDays)
    if (kept.error) console.error(`[pages] ${TABLE_WEEK_LINE_READS}: ${kept.error.message}; no week read as kept`)
    else {
      line.keptRead = true
      const due = new Set(line.due.map((d) => d.week))
      const weeks = ((kept.data ?? []) as { week: string }[]).map((r) => String(r.week).slice(0, 10)).filter((w) => due.has(w))
      if (weeks.length > 0) line.kept = [...new Set(weeks)].sort()
    }
  }
  return block
}
