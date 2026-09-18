import type { SupabaseClient } from '@supabase/supabase-js'

import { READER_FLAGS } from '../calibration'
import { fmtInt, fmtPct, fullDate, longMonth, monthName, shortDate } from '../format'
import type { Quote, Scope } from '../renderables/types'
import { selectAll } from '../supabase-admin'
import { quarterChange, QUARTER_UNLOCKS_AT } from '../reading/bands'
import {
  halfOpenInstants,
  howSoundLine,
  loadRecordInputs,
  recordLines,
  refusals,
  refusedSentence,
  type RecordInputs,
  type RecordWindow,
  type Refusal,
} from '../reading/record'
import { methodLines, platformShareLine, type MethodLines } from '../reading/method'
import type { PlatformMix } from '../reading/types'
import { loadDeckChangeLog, loadSearchPlan, type DeckChangeLog, type SearchPlan } from '../settings/deck-record'
import { loadWindowReading, readingClient, type WindowReading } from '../reading/read'
import { isMissingMonthTable } from '../reading/monthly'
import { isAnswer, type FigureTable as ReadingFigures, type Verdict, type VerdictFlag } from '../reading/verdicts'
import { gapBasisLine, gapBetween, gapLine, inheritRefusal, GAP_WORDS, type Gap, type GapSide } from '../reading/gap'
import type { Grounding } from '../reading/afterwards'
import type { OwnPostCensus, SaidAbout } from '../reading/own-posts'
import { proseFigures } from '../prose/figures'
import type { MonthStatus } from '../reading/types'
import { composeInterpretation, type Interpretation } from '../prose/interpret'
import {
  firstQuarterVerdictMonth,
  previousQuarter,
  QUARTERLY_CLAIMS_CAVEAT,
  quarterFilling,
  quarterGateSentence,
  quarterLabel,
  quarterToReview,
  quarterUnlocked,
  quarterlyPeriod,
  type Quarter,
} from '../reports/quarterly'
import { monthLine, type MonthLine } from '../reports/documents/figures'
import { rows } from './read'
import {
  isMissingAnomalyFlags,
  loadOverview,
  monthlyLineLabel,
  type CategoryBlock,
  type Mover,
  type OverviewData,
  type RivalRow,
  type Voice,
} from './overview'
import { isMissingAnomalyChecks } from './weekly'
import { fetchRunningRunIds } from './latest-video-run'
import { fetchThemedRunId } from './themed-run'
import { readSubjectWindow } from '../subjects/read'
import { isMissingSubjects, type SubjectWindowReading } from '../subjects/types'
import { CLIENT_AUDIENCE } from '../rivals'
import type { PlanCheckCard } from '../ask/plan-cards'
import type { HeadToHead } from '../reading/head-to-head'
import { loadCompetitiveSurface, type CompetitiveSurfaceData, type QuestionRow, type StandingsBlock } from './competitive-surface'
import type { MoveReading } from '../reading/moves'
import { loadMarketSurface, type AdviceRow, type ClaimRow, type MarketSurfaceData, type MoveRow } from './market-surface'

/**
 * The quarterly review's loader (Phase 1 WP20, design item 14).
 *
 * THE ARTEFACT IS THE PAGES' OWN READING, PLUS ONE WINDOW. Everything a
 * quarterly review says about a MONTH is Overview's, Market's and
 * Competitive's own loaders, unchanged — the artefact cannot say something the
 * product cannot, because it IS the product. What is quarterly-only is the
 * WINDOW read: one banded comparison of this quarter against the quarter
 * before it, per object, through `quarterChange`.
 *
 * A QUARTER IS NOT THREE MONTHS ADDED UP. `window_denominators` /
 * `window_theme_readings` (M3) count DISTINCT videos over a window; summing
 * three month rows counts a video whose thread spans two months twice, and the
 * surplus ran to +38.7% over twelve months on live data (AGENTS.md, WP3). So
 * the quarter figure comes from the window pair and from nowhere else — and
 * where M3 is not applied, this loader says the comparison is not recorded
 * rather than adding three months together to get a number that looks right.
 *
 * THE SIX-MONTH GATE IS READ, NOT ASSUMED. `quarterChange` returns
 * `baseline_forming` below six monthly readings, and the count it is given is
 * Overview's own `bar.readings` — the months of the GATHERED era that carry a
 * reading, not every stored month. A workspace with 119 back-read denominator
 * months and six delivered updates has six readings, and the artefact says so.
 *
 * AND THAT COUNT IS NOT ASK'S, WHICH IS AN OPEN DISAGREEMENT. `bar.readings`
 * sums `history.denominators` over EVERY audience, so a month counts if the
 * client, the category or any tracked rival had a row in it, at any volume.
 * WP21's `readableMonthCount` (lib/agent/basis.ts) answers a narrower question
 * for the same sentence — it drops rival audiences and months under
 * `SHARE_BAND.minN`, "because one page said five years of comparable history
 * and four months of it, a paragraph apart". The two live tenants happen to
 * agree today; a thin month or a rival-heavy month splits them, and the gate
 * then unlocks earlier than Ask's sentence implies it should. The cover no
 * longer labels this count "behind your own side", which was the half of the
 * disagreement that was plainly wrong; WHICH count should gate the quarter view
 * is a product decision and is recorded rather than quietly taken here.
 *
 * WHAT DEGRADES, AND HOW. M1–M8 are unapplied in production. Every read that
 * needs one is guarded by name and answers in words — the `isMissing*`
 * precedent — so the eight pages have the SAME SHAPE every quarter. A page
 * that cannot say something says so; it never prints a zero for a thing nobody
 * counted.
 */

// ---- the shapes ---------------------------------------------------------------

/** A figure the cover puts on its own, with what it is out of. */
export interface CoverStat {
  /** The token this figure is substituted from on the cover paragraph. */
  token: string
  value: string
  /**
   * Whether `value` is a FIGURE or a WORD.
   *
   * The artboard's cover card sets its value in mono at 38px, which is right
   * for "13 pts" and wrong for "comparison refused". Both reach this card:
   * where the mock prints a magnitude the product sometimes has only the
   * refusal, and D2's rule is that the word stands alone rather than a
   * magnitude standing beside it. So the card keeps the mock's LAYOUT and the
   * renderer sets a word at reading size.
   */
  kind: 'figure' | 'word'
  /** What the number is, in the reader's words. */
  label: string
  /** The evidence under it — the denominator, the band, the panel. */
  caption: string
  /**
   * The banded step this card carries, where it carries one.
   *
   * A `Verdict` and never a magnitude of our own: `MovementBadge` prints
   * points only where the band was cleared, and the three cards the mock draws
   * ("−18%", "−3 pts") are exactly the claims that rule refuses on today's
   * corpus.
   */
  verdict?: Verdict | null
}

export interface CoverPage {
  /** The quarter in one paragraph, with `[[token]]` figure placeholders.
   *  CODE's sentence, not a model's: the cover of an artefact that may be
   *  forwarded is the last place to put prose nobody rated. */
  body: string
  /** The figures as MEASURED — a surface converts them once, at render
   *  (lib/prose/figures.ts is the one crossing). */
  figures: ReadingFigures
  stats: CoverStat[]
  /** "as at 28 Sep 2026 · September still filling · your 3rd monthly reading,
   *  the quarter view needs 6". */
  stamp: string
  /** "TikTok, YouTube, Instagram, Reddit · 7,059 videos read". */
  corpus: string
}

export interface StandingAdvice {
  /** The lineage — the row's identity, and what a list keys on. NOT an href:
   *  the field was a `/dashboard/market?advice=…` link nothing ever rendered
   *  as one, used only as a React key. */
  id: string
  title: string
  /** "first raised in July" / "new in September". */
  age: string
  status: string
  decidedAt: string | null
  /**
   * `qr.p2.standingadvice` · "grounded in 412 videos", and the PRUNED sentence
   * beside it.
   *
   * The ledger has carried this since wave 1 (`AdviceRow.grounded`) and the
   * deck dropped it. `Grounding.line` is the count with the population it is a
   * count of, named; `Grounding.pruned` is the case the mock has no slot for —
   * the advice cited evidence and a later update replaced every row of it, so
   * "0 videos behind it" would be a claim about the evidence where the truth
   * is about our own re-analysis. Null where nothing was recorded, which is
   * not the same as zero.
   */
  grounded: Grounding | null
}

export interface ReadPage {
  interpretation: Interpretation
  /**
   * `qr.p2.meta` · the card's three facts in one mono line — "7,059 videos
   * this quarter · 13 updates · 3 monthly readings of 6".
   *
   * All three existed and were split across pages 1 and 7; page 2's own meta
   * was the quarter's label and nothing else. They are on this page because
   * this is the page that ARGUES, and the size of the corpus an argument rests
   * on belongs beside the argument.
   */
  meta: string
  figures: ReadingFigures
  /** Everything the interpretation may argue from. */
  verdicts: Verdict[]
  quotes: { quote: Quote; cite: string }[]
  /** The advice that is standing, oldest first. */
  advice: StandingAdvice[]
  adviceNote: string | null
  /** A calibrated word and the sentence under it. */
  confidence: { word: string; why: string }
  counted: string[]
}

/**
 * A mover on this artefact, with the two READER_FLAGS beside it.
 *
 * `flags` IS NOT A DIRECTION AND NEVER BECOMES ONE. `new` and `gone_quiet` are
 * the two `READER_FLAGS` (lib/calibration.ts) — facts about whether an object
 * was heard at all, which is a different question from whether its share
 * moved. A flag may be printed where a direction word may not, which is why
 * the mock's page 4 can carry them on a workspace whose every direction flag
 * is false.
 *
 * Only these two, taken from the verdict's own list plus `Mover.isNew`. The
 * other six `VerdictFlag`s are about what WE did to the corpus and belong
 * beside the verdict, not beside the row's name.
 */
export interface QuarterMover extends Mover {
  flags: VerdictFlag[]
}

/** A theme the register has marked dormant, with the last month it was read
 *  in on this artefact's axis. The monthly report's `GoneQuiet`, same rule. */
export interface QuarterQuiet {
  id: string
  label: string
  lastHeard: string | null
}

export interface SubjectQuarterRow {
  id: string
  label: string
  /** The month columns — the tenant's own audience and the category's. */
  you: { k: number; n: number; pct: number | null } | null
  category: { k: number; n: number; pct: number | null } | null
  /**
   * The LEAD rival's month, where one is tracked and carried a row.
   *
   * Overview's subject row has carried this since WP11 and the quarterly
   * dropped it on the floor (`qr.p3`: the mock draws three series and the
   * build drew two). It is a LEVEL, like the other two — never a difference
   * between it and yours, which is deviation D1's ruling: two proportions on
   * two different denominators have no band, so the two are printed side by
   * side and nothing is said about the gap.
   */
  rival: { k: number; n: number; pct: number | null } | null
  /** The last months of the CATEGORY side, for the line — the only side with
   *  the n to carry one (lib/pages/overview.ts `spark`). */
  spark: (number | null)[]
  /** The months `spark` is indexed by, same length. */
  sparkMonths: string[]
  /** The quarter columns. `baseline_forming` below six readings. */
  youQuarter: Verdict | null
  categoryQuarter: Verdict | null
  /**
   * The two-audience gap over the QUARTER — the field `qr.p3.gapline` binds
   * (D1). Null where either quarter column could not be drawn.
   *
   * IT IS YOU AGAINST THE CATEGORY, NOT AGAINST THE RIVAL, and that is a
   * deliberate departure from the mock. This page carries no rival side at all
   * — `buildQuarterVerdicts` restricts a subject's quarter to the two columns
   * the table prints, on the recorded ground that "a subject's reading under a
   * single rival's videos is a different question and has its own page" — so a
   * gap to the rival here would need a read this page does not take, and would
   * print a difference beside two columns neither of whose numbers it used.
   * The gap is between the two columns the reader can see.
   *
   * IT IS NOT GATED BY THE SIX READINGS. `baseline_forming` says there is no
   * PRIOR quarter to compare against; a gap is a difference inside one window
   * and needs no baseline, so it is drawn whenever both sides carry a reading.
   * The earlier gap (`Gap.basis`) is the prior quarter's pair, and that one
   * does disappear with the baseline.
   *
   * THE PORT MUST PRINT IT AS `gapLine(row.gap, { period: true })`. The row's
   * own body prints the MONTH's levels ("you 31% of 84 · the category 22% of
   * 1,388") and this gap is the QUARTER's (30.1% of 249 · 22% of 4,147), so
   * the bare sentence would put two different "you …% of N" in one row with
   * nothing to tell them apart. The labelled form names the quarter in front
   * of its own figures. This is the one surface in the product that needs it,
   * which is why the option exists and why it is off by default.
   */
  gap: Gap | null
}

export interface SubjectsPage {
  rows: SubjectQuarterRow[]
  /** The lead rival's name, where one is tracked. Null means no third column.
   *  */
  rivalLabel: string | null
  /** `qr.p3.chart` — the month line, drawn only for the side with the n and
   *  carrying no direction word (D3). Null where no subject has a series. */
  line: MonthLine | null
  /** `qr.p3.quote` — the voices this page may show, as refs that resolve at
   *  render. */
  quotes: { quote: Quote; cite: string }[]
  monthLabel: string
  /** "October is outside this quarter …", where the month-level columns are of
   *  a month the heading's quarter does not contain. Page 3 named its month and
   *  never said that, under a heading reading "Q3 2026 against Q2 2026". */
  monthNote: string | null
  /** The line under the table about which column carries what. */
  note: string | null
  /** Said instead of the table when `subjects` (M4) is not applied here. */
  notRecorded: string | null
  /** The gate, when the quarter columns cannot be drawn yet. */
  gate: string | null
  /** Why the two quarter columns are empty, when they are. Null once a row
   *  carries one. */
  quarterNote: string | null
}

export interface CategoryPage {
  audience: string
  label: string
  denominator: number | null
  monthLabel: string
  /** "Movers and mix are September against August." */
  basis: string
  /** The six-month gate, when this workspace has not cleared it — null once it
   *  has. Printed unconditionally, this page told a workspace standing at nine
   *  readings that the quarter view "needs six months — you have 9". */
  gate: string | null
  growing: QuarterMover[]
  fading: QuarterMover[]
  moversNote: string | null
  /** `qr.p4.flags`, the second of the two READER_FLAGS. The registry's own
   *  dormancy rule, read here exactly as Voice and the monthly report read it
   *  — never a second rule for one word. Empty where nothing is dormant; null
   *  where the register could not be read at all. */
  quiet: QuarterQuiet[] | null
  quietNote: string | null
  /** `qr.p4.quote` — the voices this page may show, as refs. */
  quotes: { quote: Quote; cite: string }[]
  kinds: CategoryBlock['kinds']
  kindVerdicts: CategoryBlock['kindVerdicts']
  kindsNote: string | null
  /**
   * `qr.p4.kinds`' basis note — how much of the question-and-objection talk
   * arrives as a Reddit thread.
   *
   * `CategoryBlock.reddit` has been built since Block B and this page dropped
   * it, so the mock's "Reddit 38% of question videos" had a field and no
   * renderer. It travels with the kind rows because it is what those rows are
   * a reading OF: a kind mix that is materially one platform's is a different
   * finding from one spread across four (D15 — a figure without its basis).
   */
  reddit: CategoryBlock['reddit']
  attention: CategoryBlock['attention']
  attentionNote: string | null
  mood: CategoryBlock['mood']
  moodNote: string | null
  /** The quarter's own reading of the objects above, where the window read
   *  could be taken. Empty where M3 is not applied. */
  quarter: Verdict[]
  quarterNote: string | null
  /** The category's videos this quarter and the quarter before it, as two
   *  counts. NOT a verdict: a volume is not a share of itself, and banding one
   *  against the other prints "4,147 of 4,147 · no clear change". Null where
   *  the window read could not be taken. */
  quarterVolume: { videos: number; before: number } | null
}

export interface RivalsPage {
  rows: RivalRow[]
  /**
   * `qr.p5.whattheysay` · what each tracked rival PUBLISHED in `monthLabel`'s
   * month — one census per rival, straight off Competitive's own read so the
   * deck and the page cannot disagree.
   *
   * MONTH-SCOPED ON A QUARTERLY DECK, AND SAID SO. These are this block's rows'
   * month, the same one `monthLabel` and `monthNote` already qualify, not a
   * quarter: an own-post census is dated by `videos.upload_date` and summing
   * three months of it would be a fourth dating nobody asked for.
   * `OwnPostCensus.basis` prints the month beside every figure.
   */
  ownPosts: OwnPostCensus[]
  /**
   * `qr.p5.saidabout` · what is said ABOUT each rival by everybody else.
   *
   * Empty on every row and each row says why: the claims are `video_claims`
   * rows in a rival's bucket, which no tenant session may select. The block
   * exists here because a deck that silently drops a section reads as a deck
   * that had nothing to say.
   */
  saidAbout: SaidAbout[]
  /** The month THESE ROWS are of — Overview's, which is the month the product
   *  is in. The page headed itself off `standings.monthLabel` instead, a
   *  different read of a different surface: it printed "Sep 2026" while the
   *  rest of the sheet said October. */
  monthLabel: string
  /** And whether that month falls outside the quarter under review. */
  monthNote: string | null
  /** Whether the panel reading behind the two shares exists at all. False means
   *  `month_audience_stats` (M5) is not applied here, so a blank cell reads
   *  "not recorded yet" and NOT "not observed", which is a measurement
   *  (lib/reading/standings.ts; Block B fix c0102bd). */
  recorded: boolean
  months: string[]
  standings: StandingsBlock | null
  standingsNote: string | null
  questions: QuestionRow[]
  questionsLine: string
  /**
   * `qr.p5.h2h` · head to head, then and now — Competitive's own five measures,
   * passed through (`lib/reading/head-to-head.ts`, wave 1).
   *
   * MONTH-SCOPED ON A QUARTERLY DECK, like the rows above it and for the same
   * reason: the share measures are comment-dated and the engagement, positive
   * share and own-post rows are dated by a video's upload, so each row names
   * its own clock. THREE OF THE FIVE CARRY NO BADGE ON PURPOSE — a rate, a
   * median and a bare count are not proportions, and the product's band is
   * built for shares. Null where no rival is selected or nothing was read.
   */
  headToHead: HeadToHead | null
  /** Whose videos the questions were asked under — the mock's brand prefix on
   *  each row. One rival, because `buildQuestions` reads one. */
  questionsRival: string | null
  rivalsNote: string | null
  dualMention: number | null
  caveat: string
}

export interface MovesPage {
  moves: MoveRow[]
  movesNote: string | null
  advice: AdviceRow[]
  /** The Market page's own sentence, over the WHOLE ledger and not the twelve
   *  rows drawn: "You have acted on 7 of 64 — every piece of advice this
   *  product has ever given you." Never quarter-scoped; see buildMoves. */
  actedLine: string
  adviceNote: string | null
  claims: ClaimRow[]
  claimsLine: string
  claimsCaveat: string
  /** The rule the whole page is read under. */
  rule: string
  /**
   * `qr.p6.plan` — the newest re-checked plan, or null where the workspace has
   * uploaded none (D4, added by D-ledger; this file's owner is D-brief).
   *
   * ONE, NOT ALL. Market lists every stored plan; a quarterly review page is a
   * page, and the plan a reader is steering by is the most recent one. Its
   * claims carry their own counts with the population named, and its `moved`
   * rows carry the date a verdict last changed and how many readings have
   * carried it — never "held N updates".
   */
  plan: PlanCheckCard | null
  /**
   * `qr.p6.move1` · the measured reading behind each declared move — Market's
   * own `readMove` output, matched to the moves this quarter drew.
   *
   * ONE READING PER MOVE, NOT A SECOND MEASUREMENT. `MarketSurfaceData
   * .readings` is already built and already banded; the deck takes the ones
   * whose move it is printing and draws them. `MoveReading.chartNote` is the
   * refusal a line gets below three readings, and it is printed where the mock
   * draws the chart — a chart is a direction claim too.
   */
  readings: MoveReading[]
}

// WHAT THE METHOD PAGE PRINTS, AND NOTHING ELSE. `changePts`, `bandPts` and
// `objectKind` rode along from the row and were rendered nowhere; the object
// key `flagOutcome` joins on is read off the FlagRow where the join happens.
export interface QuarterFlag {
  label: string
  weekStart: string
  weekEnd: string
  k: number
  n: number
  denominator: string
  /** What it turned out to be — the next reading's verdict on the same object,
   *  or the honest absence of one. */
  outcome: string
  sentences: string[]
}

export interface MethodPage {
  /** The quarter's own record window. */
  window: { from: string; to: string }
  line: string
  lines: string[]
  /** How many checks ran this quarter, and how many fired. */
  checks: { ran: number; flagged: number; recorded: boolean }
  flags: QuarterFlag[]
  flagsNote: string | null
  /** The corpus in numbers, row by row. */
  numbers: { label: string; value: string; note?: string }[]
  unit: string
  /** The comparisons this artefact asked for and did not draw, and why —
   *  printed, not promised (lib/reading/record.ts `refusedSentence`). */
  refusedLine: string | null
  /** The method footnote, composed once for every surface and every artefact
   *  (block D, D9 — lib/reading/method.ts). Null where the quarter's record
   *  could not be read. */
  method: MethodLines | null
  /** What each search term brought back inside this quarter, and the sentence
   *  that has to travel with it — the table is dated by the GATHER, which is
   *  the one figure in the product honestly on that clock. Null where nothing
   *  was recorded (`qr.p8.searchplan`). */
  searchPlan: SearchPlan | null
  /** Every change to what we track that was logged inside this quarter, dated
   *  and with what it broke. Page 7 prints the COUNT; this is the log behind
   *  it. Null where the log is not applied here, which is not the same
   *  sentence as "nothing changed" (`qr.p8.changelog`). */
  changeLog: DeckChangeLog | null
}

export interface UnsettledItem {
  title: string
  /** The badge: "too few to compare", "band ±6.8", "comparison refused". */
  why: string
  body: string
}

export interface UnsettledPage {
  items: UnsettledItem[]
  /** What was never ASKED, as against what was asked and could not be
   *  answered. `items` can only hold comparisons that were BUILT, so on a
   *  workspace whose quarter half cannot be read at all the list is empty and
   *  the page used to read "Every comparison this quarter asked for was drawn."
   *  — on the same artefact whose other pages say the quarter-on-quarter
   *  reading is not recorded. Null when both halves were attempted. */
  notAsked: string | null
  waiting: string[]
  heldBack: string[]
  /** When the first quarter-on-quarter verdict lands, in the reader's words —
   *  with the month it settles in, where that can be counted. */
  settles: string
}

export interface QuarterlyData {
  brand: string
  quarter: Quarter
  prior: Quarter
  readingAt: string
  period: string
  /** The month the month-level pages are of. */
  month: string
  monthStatus: MonthStatus
  /** The monthly readings behind the tenant's own side. */
  readings: number
  unlocked: boolean
  /** The gate sentence, always composed, printed where it bites. */
  gate: string
  /** Always null: a quarter belongs to no single update (see composeQuarterly).
   *  Kept on the shape so the snapshot writer reads one field, not two. */
  runId: string | null
  cover: CoverPage
  read: ReadPage
  subjects: SubjectsPage
  category: CategoryPage
  rivals: RivalsPage
  moves: MovesPage
  method: MethodPage
  unsettled: UnsettledPage
}

// ---- the pure half ------------------------------------------------------------

const pct1 = (n: number): string => `${Math.round(n * 10) / 10}%`

/** "your 3rd monthly reading, the quarter view needs 6" — the mock's own
 *  counter, with the gate attached where the reader first meets it. */
export function readingCounter(readings: number, needed = QUARTER_UNLOCKS_AT): string {
  const nth = ordinal(readings)
  const head = readings === 0 ? 'no monthly reading yet' : `your ${nth} monthly reading`
  return readings >= needed ? head : `${head}, the quarter view needs ${needed}`
}

export function ordinal(n: number): string {
  const rem100 = n % 100
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`
  // The lookup already answers for every digit — 4 through 9 read 'th' off the
  // end of a four-entry array. The `n % 10 <= 3 ? suffix : 'th'` that used to
  // sit here was a second guard over a table that needed none.
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}

/**
 * How sure we are, in a calibrated word, and why in a sentence.
 *
 * NOT A SCORE AND NOT A MODEL's WORD. It is read off the verdicts the pages
 * actually drew: a quarter whose own side is still forming is never better
 * than "partly", however solid the category side is, because the reader's
 * question is about their own brand.
 */
export function confidenceOf(verdicts: readonly Verdict[], unlocked: boolean): { word: string; why: string } {
  const answered = verdicts.filter((v) => isAnswer(v.state))
  const total = verdicts.length
  if (total === 0) {
    return { word: 'not yet', why: 'Nothing this quarter cleared a band on either side, so there is no reading to be confident about.' }
  }
  const share = answered.length / total
  if (!unlocked) {
    return {
      word: 'partly',
      why: `The category side is read month by month; your own side is not, because a quarter-on-quarter comparison needs six monthly readings. ${fmtInt(answered.length)} of ${fmtInt(total)} comparisons on these pages were answered.`,
    }
  }
  if (share >= 0.66) {
    return { word: 'reasonable', why: `${fmtInt(answered.length)} of ${fmtInt(total)} comparisons on these pages were answered against their band.` }
  }
  return {
    word: 'partly',
    why: `${fmtInt(answered.length)} of ${fmtInt(total)} comparisons on these pages were answered; the rest read on too little or were refused, and each says which on the last page.`,
  }
}

/**
 * The cover paragraph, composed in code, with figure tokens.
 *
 * WHY CODE AND NOT THE MODEL. The interpretation page is the one place on this
 * artefact a model may argue (design §7, item 9), and it carries the word
 * *Interpretation* for exactly that reason. A cover is read by people who never
 * reach page 2 — often people the workspace forwarded it to — so it states what
 * was counted and nothing else.
 */
export function coverBody(input: {
  lead: Verdict | null
  monthLabel: string
  quarterLabel: string
  unlocked: boolean
  readings: number
  /** Whether the month the lead belongs to falls outside the quarter under
   *  review — the normal case on a scheduled send. */
  monthOutside?: boolean
}): string {
  const parts: string[] = []
  // ONE SENTENCE, ONE PERIOD. `overview.sentence.lead` is a MONTH verdict —
  // the largest banded change in the month the product is in — and the first
  // cut called it "the biggest banded change THIS QUARTER … in September".
  // A cover is the sheet most likely to be read on its own and forwarded, so
  // it names the month the figure belongs to and says nothing about the
  // quarter it does not have.
  if (input.lead && isAnswer(input.lead.state)) {
    parts.push(
      `The biggest banded change in ${input.monthLabel} is ${input.lead.objectLabel}, at [[lead_share]] of [[lead_of]] videos${
        input.monthOutside ? `, the month in hand rather than a month of ${input.quarterLabel}` : ''
      }.`,
    )
  } else {
    parts.push(`Nothing on either side cleared its band in ${input.monthLabel} by more than the reading can carry.`)
  }
  // THE CATEGORY'S OWN DENOMINATOR. This figure summed the window read across
  // EVERY audience — your own, each rival's and the category's — and then
  // called the total "the category": on Össur's real Q3 rows, ~1,306 against a
  // category of 1,134. Each audience counts the same corpus from a different
  // side, so a sum of them is not a count of anything.
  parts.push(`The category was read across [[quarter_videos]] videos in ${input.quarterLabel}.`)
  parts.push(
    input.unlocked
      ? 'Your own side is compared with the quarter before it on every page that has both sides.'
      : `Your own side is not compared with the quarter before it yet: ${quarterGateSentence(input.readings).slice(0, 1).toLowerCase()}${quarterGateSentence(input.readings).slice(1)}`,
  )
  return parts.join(' ')
}

/**
 * Where the month-level pages stand relative to the quarter under review.
 *
 * FOUR OF THE EIGHT PAGES ARE A MONTH. The movers, the kind mix, the mood, the
 * attention line, the rival rows and every level on page 3 come from Overview,
 * Market and Competitive on the `last_3` horizon, whose month is whatever month
 * the PRODUCT is currently in — there is no as-at date to hand those loaders,
 * and the reading layer has no way to rewind them. That is a real limit, and
 * the honest thing is to name it: a Q3 review built in November prints
 * November's movers, and the reader has to be told so on the sheet rather than
 * left to assume a document headed Q3 is Q3 throughout.
 *
 * `null` when the month is inside the quarter, which is the only case in which
 * a document headed Q3 can let a month figure speak for itself. Whether the
 * QUARTER is still filling is the quarter's own clause and not this one's —
 * keying both off `overview.monthStatus` is how "November still filling" came
 * to be stamped on a quarter that closed weeks earlier.
 */
export function monthBasisClause(month: string, quarter: Quarter): string | null {
  if (month >= quarter.from && month <= quarter.to) return null
  return `the month-level pages read ${longMonth(month)}, outside this quarter`
}

/** The same fact as a sentence a page can print under its own rows. Null while
 *  the month is inside the quarter, which is the only case in which a document
 *  headed Q3 can let a month figure speak for itself. */
export function monthOutsideNote(month: string, quarter: Quarter): string | null {
  if (month >= quarter.from && month <= quarter.to) return null
  return `${longMonth(month)} is outside this quarter — it is the month the product is in now.`
}

/**
 * What a flag turned out to be, said in one clause.
 *
 * JOINED ON KIND AND ID, NEVER ON LABEL. A flag is written weeks earlier by a
 * different run, and `anomaly_flags`' own column comment says it: "label — What
 * the reader was shown. Decoration, never a key — theme labels churn about 88%
 * run to run" (AGENTS.md: do not join themes by label). The first cut matched
 * `objectLabel.toLowerCase() === label.toLowerCase()` and compared neither kind
 * nor id, so a re-labelled theme printed "no later reading of the same object
 * has been taken" when one had been, and a flag of another KIND whose label
 * happened to match a theme's printed that theme's outcome as its own — a rival
 * flagged "fit and comfort" reading the theme's verdict. The table keys on
 * (client_id, run_id, object_kind, object_id) and indexes on
 * (client_id, object_kind, object_id, week_start); this is that key.
 */
export function flagOutcome(flag: { objectKind: string; objectId: string }, later: readonly Verdict[]): string {
  const match = later.find((v) => v.objectKind === flag.objectKind && v.objectId === flag.objectId)
  if (!match) return 'no later reading of the same object has been taken'
  if (match.state === 'moved') return `the month's own reading agreed — it cleared its band`
  if (match.state === 'no_clear_change') return `the month's own reading did not agree — inside the band`
  // "LANDED", NOT "FELL". `fell` is in DIRECTION_WORDS, and `method.tsx` prints
  // these unmarked ("What it turned out to be: …"), so three of these five
  // branches broke rule (c) in all three modes. The calendar sense is not a
  // claim that anything moved — but the block test passed only because the
  // fixture's single flag carries the one branch of five with no direction
  // word in it, which makes the contract unsatisfiable the moment a real flag
  // resolves any other way.
  if (match.state === 'too_little_data') return 'the month it landed in read on too little to settle it'
  if (match.state === 'refused') return 'the month it landed in could not be compared'
  return 'the month it landed in has no baseline behind it yet'
}

/**
 * The still-unsettled items, off the verdicts the pages drew. One per object,
 * worst first, so the last page is a list and not a transcript.
 *
 * AND THE TITLE NAMES THE SIDE. The dedup key is object AND audience, so two
 * audiences' readings of one object are two rows — which is right — but the
 * title was `Whether ${label} moved${v.audience ? '' : ''}`, both branches
 * empty, so they arrived as two identically-titled rows and a reader could
 * not tell which was theirs. `side` turns an audience key into the reader's
 * words; where it answers nothing the title stays as it was.
 */
export function unsettledItems(
  verdicts: readonly Verdict[],
  options: { limit?: number; side?: (audience: string) => string | null } = {},
): UnsettledItem[] {
  const limit = options.limit ?? 4
  const rank: Record<string, number> = { refused: 0, too_little_data: 1, baseline_forming: 2 }
  const seen = new Set<string>()
  return verdicts
    .filter((v) => !isAnswer(v.state))
    .sort((a, b) => (rank[a.state] ?? 9) - (rank[b.state] ?? 9) || b.value.n - a.value.n)
    .filter((v) => {
      const key = `${v.objectKind}:${v.objectId}:${v.audience}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, limit)
    .map((v) => ({
      title: `Whether ${v.objectLabel} moved${audienceSuffix(v.audience, options.side)}`,
      why:
        v.state === 'refused'
          ? 'comparison refused'
          : v.state === 'baseline_forming'
            ? 'not enough months behind it'
            : v.bandPts != null
              ? `band ±${Math.round(v.bandPts * 10) / 10}`
              : 'too few to compare',
      body: `${v.objectLabel} read ${v.value.n > 0 ? `${fmtInt(v.value.k)} of ${fmtInt(v.value.n)} videos` : 'nothing we could count'} in this window${
        v.baseline ? `, against ${fmtInt(v.baseline.k)} of ${fmtInt(v.baseline.n)} before it` : ''
      }.`,
    }))
}

/** ", in your own videos" — or nothing, where nobody can name the side. */
function audienceSuffix(audience: string | null | undefined, side?: (audience: string) => string | null): string {
  if (!audience || !side) return ''
  const words = side(audience)
  return words ? `, ${words}` : ''
}

// ---- the loader ---------------------------------------------------------------

export interface QuarterlyOptions {
  /** Which quarter. Defaults to the quarter that has CLOSED — never the one
   *  the reading date falls in; see `quarterToReview`. A caller that wants the
   *  quarter in progress (an operator previewing mid-quarter) names it. */
  quarter?: Quarter
  /** Overridable for tests and for a rebuild that re-reads as at its own date. */
  now?: string
  /** A model's draft of the interpretation page, when the build has one. The
   *  artefact never calls a model itself — a loader that spends money is a
   *  loader nobody can preview. */
  draft?: string | null
}

export async function loadQuarterly(scope: Scope, options: QuarterlyOptions = {}): Promise<QuarterlyData | null> {
  const supabase = scope.supabase as SupabaseClient
  const readingAt = options.now ?? new Date().toISOString()
  // THE QUARTER THAT CLOSED. A quarterly send fires on the first update of a
  // new quarter, so the artefact it carries reviews the one behind it — four
  // days of October is not a quarter (lib/reports/quarterly.ts).
  const quarter = options.quarter ?? quarterToReview(readingAt)
  const prior = previousQuarter(quarter)

  // THE THREE PAGE LOADERS, unchanged, on the horizon whose axis is this
  // quarter's three months. `last_3` is the product's own three-month window
  // and is what a reader gets when they open the page beside this artefact.
  const pageScope = { ...scope, params: { ...scope.params, horizon: 'last_3' } }
  const clientId = scope.clientId
  const [overview, market, competitive, runningIds] = await Promise.all([
    loadOverview(pageScope),
    loadMarketSurface(pageScope).catch((error: unknown) => {
      console.error(`[pages] quarterly.market: ${(error as { message?: string })?.message ?? String(error)}`)
      return null
    }),
    loadCompetitiveSurface(pageScope).catch((error: unknown) => {
      console.error(`[pages] quarterly.competitive: ${(error as { message?: string })?.message ?? String(error)}`)
      return null
    }),
    fetchRunningRunIds(supabase, clientId, 'quarterly'),
  ])
  if (!overview) return null

  // THE CLUSTERING THE THEME HALF IS READ UNDER. `window_theme_readings` takes
  // a run id and answers nothing without one, so a window read taken with none
  // carries denominators and no numerators — which is what the first cut did,
  // leaving the theme loop below unreachable on every real load. The themed
  // update is the page loaders' own (lib/pages/themed-run.ts).
  const themedRunId = await fetchThemedRunId(supabase, clientId, runningIds, 'quarterly')
  // BOUNDED, AND EVERY ROW LABELLED. The window read answers in registry ids;
  // the labels live on the month series the pages already loaded, so the
  // quarter is read for the objects those pages name and an unlabelled id can
  // never reach a page.
  const themeIds = quarterThemeIds(overview)

  // THE WINDOW PAIR. One read per side, over DISTINCT videos — never three
  // month rows added together.
  const reading = scope.reading?.client ?? readingClient()
  // AN EMPTY SET IS NOT "NO BOUND". A thin month names no mover, and
  // `objectIds: undefined` turned that into an UNBOUNDED read whose every row
  // was then dropped for want of a label — a read of the whole quarter, paid
  // for, thrown away, and reported as though the pair had been compared and
  // found nothing. Nothing was asked; `buildCategory` says so in its own words.
  const themeOptions = themeIds.length
    ? { runId: themedRunId, objectIds: themeIds }
    : { runId: null }
  const [thisQuarter, lastQuarter, subjectsNow, subjectsBefore, checks, searchPlan, changeLog, record, quiet] = await Promise.all([
    quarterWindowFor(reading, clientId, quarter, themeOptions),
    quarterWindowFor(reading, clientId, prior, themeOptions),
    subjectWindowFor(reading, clientId, quarter),
    subjectWindowFor(reading, clientId, prior),
    loadQuarterChecks(supabase, clientId, quarter),
    // The search plan and the change log for THIS QUARTER, both bounded by it
    // and both null rather than empty where the table cannot be read — the
    // deck's page 7 has only ever printed a count of the second, and page 8
    // has never had the first at all (block D, D9).
    loadSearchPlan(supabase, clientId, quarter),
    loadDeckChangeLog(supabase, clientId, quarter),
    // NAMED, NOT SWALLOWED. A record that cannot be read is printed as "could
    // not be recovered" on the method page; an operator still needs to know
    // why, and a bare `.catch(() => null)` left no trace anywhere.
    loadRecordInputs(reading, clientId, { kind: 'quarter', from: quarter.from, to: quarter.to }, {
      now: readingAt,
      gate: 'tenant',
    }).catch((error: unknown) => {
      console.error(`[pages] quarterly.record: ${(error as { message?: string })?.message ?? String(error)}`)
      return null
    }),
    loadQuiet(supabase, clientId, overview),
  ])

  return composeQuarterly({
    overview,
    market,
    competitive,
    quarter,
    prior,
    readingAt,
    thisQuarter,
    lastQuarter,
    subjectsNow,
    subjectsBefore,
    checks,
    record,
    searchPlan,
    changeLog,
    quiet,
    draft: options.draft ?? null,
  })
}

/**
 * The themes that have gone quiet — `qr.p4.flags`, the second of the two
 * `READER_FLAGS`.
 *
 * THE REGISTER'S OWN RULE, NOT A SECOND ONE. `theme_registry.status =
 * 'dormant'` is what Voice and the monthly report already read, fired by the
 * pipeline over updates that produced observations. The tempting alternative
 * — "a mover whose k is zero this month" — is a READING of this month and
 * would be a second meaning for one word, which is the drift the verdict
 * contract exists to stop. A theme currently growing or fading is by
 * construction not dormant, so this is a list beside the movers and never a
 * flag on one of them.
 *
 * AND `lastHeard` IS DATED BY THE COMMENT, WHICH COST THIS FUNCTION ITS FIRST
 * IMPLEMENTATION. It read `theme_registry.last_seen_at`, which is the RUN's
 * wall clock at persist (`lib/pipeline/themes.ts` writes `nowIso`) — measured
 * read-only on 2026-09-18, all 50 dormant rows on one tenant carry the single
 * value `2026-08-23`, so the artefact would have printed "last heard August"
 * for fifty themes whose comments are from any month, and ordered the five it
 * shows arbitrarily inside one identical timestamp. `lib/pages/voice-surface.ts`
 * already refuses those two columns in writing on this same table. The answer
 * is the one Voice takes: the last month the theme actually carried a reading
 * on this artefact's axis (`month_theme_readings`, the category's audience,
 * comment-dated), and null where the axis does not reach back to it.
 */
export async function loadQuiet(
  supabase: SupabaseClient,
  clientId: string,
  overview: OverviewData,
  limit = 5,
): Promise<QuarterQuiet[] | null> {
  try {
    const res = await supabase
      .from('theme_registry')
      .select('id, canonical_label')
      .eq('client_id', clientId)
      .eq('status', 'dormant')
      .limit(QUIET_POOL)
    if (res.error) throw res.error
    const dormant = rows<{ id: string; canonical_label: string | null }>(res, 'quarterly.quiet').map((r) => ({
      id: r.id,
      label: r.canonical_label ?? r.id,
    }))
    if (dormant.length === 0) return []
    const heard = await lastHeardMonths(supabase, clientId, overview, dormant.map((d) => d.id))
    return quietRows(dormant, heard, limit)
  } catch (error) {
    console.error(`[pages] quarterly.quiet: ${(error as { message?: string })?.message ?? String(error)}`)
    return null
  }
}

/** How many dormant entries are ranked before the five are taken. The register
 *  is small (1,046 active / 50 dormant on the larger tenant, measured) and the
 *  ranking needs the whole set, because the top five by LAST MONTH cannot be
 *  taken by a database order on a column that is not the answer. */
export const QUIET_POOL = 200

/**
 * The last month each of these themes was read in, on the category's axis.
 *
 * One bounded read of `month_theme_readings` — the comment-dated table — for
 * the dormant ids alone, and never a per-theme loop. A month with no videos is
 * not a month it was heard in. Where the month tables are not applied here the
 * map is empty and every row's `lastHeard` is null, which is the honest
 * answer and not a guessed date.
 */
async function lastHeardMonths(
  supabase: SupabaseClient,
  clientId: string,
  overview: OverviewData,
  ids: readonly string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (ids.length === 0) return out
  try {
    const read = await selectAll<{ theme_id: string; month: string; videos: number | null }>(() =>
      supabase
        .from('month_theme_readings')
        .select('theme_id, month, videos')
        .eq('client_id', clientId)
        .eq('audience', overview.category.audience)
        .in('theme_id', [...ids])
        .lte('month', overview.month)
        .order('month', { ascending: true }),
    )
    for (const r of read) {
      if ((r.videos ?? 0) <= 0) continue
      const month = monthStartOfDay(r.month)
      const held = out.get(r.theme_id)
      if (!held || month > held) out.set(r.theme_id, month)
    }
  } catch (error) {
    if (!isMissingMonthTable(error)) throw error
  }
  return out
}

/**
 * The five to print: the most recently heard first, and a stable order under
 * them.
 *
 * SILENCE WE HEARD, NOT SILENCE WE NEVER DID — Voice's rule, in Voice's own
 * words (`lib/pages/voice-surface.ts`): "a theme with no rows at all is
 * silence we never heard; a dormant entry that carried a reading on this axis
 * is silence we did." Voice takes its list off the page's month series, so a
 * dormant entry the series never held is not in it; this list is taken off the
 * register, so the same rule has to be applied here. Measured read-only
 * 2026-09-18: all 50 dormant entries on the larger tenant carry NO
 * `month_theme_readings` row at all, so "gone quiet" about any of them is a
 * claim the comment-dated axis cannot support, and the page's own sentence —
 * "Nothing this artefact follows has gone quiet" — is the true one.
 *
 * AND THE ORDER IS STABLE, because the five a reader sees must not change
 * between a render and its re-render: most recent first, ties broken by label.
 * The first implementation ordered on a column whose fifty rows held one
 * identical value, which is not an order at all.
 */
export function quietRows(
  dormant: readonly { id: string; label: string }[],
  heard: ReadonlyMap<string, string>,
  limit: number,
): QuarterQuiet[] {
  return [...dormant]
    .map((d) => ({ id: d.id, label: d.label, lastHeard: heard.get(d.id) ?? null }))
    .filter((d) => d.lastHeard != null)
    .sort((a, b) => (a.lastHeard === b.lastHeard ? a.label.localeCompare(b.label) : (b.lastHeard ?? '').localeCompare(a.lastHeard ?? '')))
    .slice(0, limit)
}

const monthStartOfDay = (iso: string): string => `${iso.slice(0, 7)}-01`

/**
 * One windowed read of the tenant's own subjects, or null where M4 is not
 * applied here.
 *
 * ITS OWN READ, because `window_subject_readings` is its own function and the
 * subjects table is its own migration. Guarded by name — the `isMissing*`
 * precedent — so a workspace without M4 reads "not recorded" and never a zero.
 */
export async function subjectWindowFor(
  client: SupabaseClient,
  clientId: string,
  quarter: Quarter,
): Promise<SubjectWindowReading[] | null> {
  const { from, to } = halfOpenInstants({ kind: 'quarter', from: quarter.from, to: quarter.to })
  try {
    return await readSubjectWindow(client, clientId, { from, to })
  } catch (error) {
    if (!isMissingSubjects(error)) {
      console.error(`[pages] quarterly.subjectWindow: ${(error as { message?: string })?.message ?? String(error)}`)
    }
    return null
  }
}

/**
 * The themes this artefact follows across the quarter: the movers its own
 * category page drew, and no others.
 *
 * One definition, read by the LOAD (to bound the window read) and by the
 * COMPOSE (to tell "nothing was asked" from "nothing was found"). Empty is a
 * real answer — a thin month moves nothing clearly — and it means the quarter's
 * theme half is not read at all rather than read and discarded.
 */
export function quarterThemeIds(overview: OverviewData): string[] {
  return [...overview.category.growing, ...overview.category.fading].map((m) => m.id)
}

export interface ComposeQuarterlyInput {
  overview: OverviewData
  market: MarketSurfaceData | null
  competitive: CompetitiveSurfaceData | null
  quarter: Quarter
  prior: Quarter
  readingAt: string
  thisQuarter: WindowReading
  lastQuarter: WindowReading
  /** The tenant's own subjects over the same two windows. Null — never [] —
   *  where M4 is not applied for this workspace. */
  subjectsNow: SubjectWindowReading[] | null
  subjectsBefore: SubjectWindowReading[] | null
  checks: QuarterChecks
  record: RecordInputs | null
  /** What each search term brought back inside the quarter, and the changes
   *  logged inside it. Optional so a caller that predates block D still
   *  composes — both arrive as null and the method page says so. */
  searchPlan?: SearchPlan | null
  changeLog?: DeckChangeLog | null
  /** Themes the register has marked dormant. Null — never [] — where the
   *  register could not be read, because "nothing has gone quiet" and "we
   *  could not look" are two different sentences. */
  quiet?: QuarterQuiet[] | null
  draft?: string | null
}

/**
 * The eight pages, composed. PURE — every read is the caller's.
 *
 * WHY THE SPLIT. A fixture that hand-types eight pages is a second reading of
 * the product, and the first thing to drift from it. This way a block test and
 * a production render walk the SAME composer, and the only difference between
 * them is which rows the database handed back.
 */
export function composeQuarterly(a: ComposeQuarterlyInput): QuarterlyData {
  const { overview, quarter, prior, readingAt } = a
  const readings = overview.bar.readings
  const unlocked = quarterUnlocked(readings)
  const gate = quarterGateSentence(readings)
  const monthLabel = longMonth(overview.month)

  const quarterVerdicts = buildQuarterVerdicts({
    quarter,
    prior,
    thisQuarter: a.thisQuarter,
    lastQuarter: a.lastQuarter,
    subjectsNow: a.subjectsNow,
    subjectsBefore: a.subjectsBefore,
    readings,
    overview,
  })
  const windowApplied = a.thisQuarter.denominators != null
  // The theme half is its own read and its own silence: a window pair can
  // carry denominators and no clustering to count numerators under.
  const themesRead = a.thisQuarter.themes != null && a.lastQuarter.themes != null
  // …and whether any theme was NAMED to follow. The set is the current month's
  // movers; a month that moved nothing clearly names none, and a quarter read
  // for no object has not been compared and found nothing — it has not been
  // asked. Four silences on that page now, and no two of them are the same
  // claim.
  const themesAsked = quarterThemeIds(overview).length > 0
  const subjectsRead = windowApplied && a.subjectsNow != null && a.subjectsBefore != null
  // The month the month-level pages are of is the month the PRODUCT is in, and
  // on a review of a closed quarter that is a month outside it. Every page that
  // prints a month figure says so rather than letting a Q3 masthead speak for
  // a November reading.
  const monthNote = monthOutsideNote(overview.month, quarter)

  // ONE SET OF VOICES, THREE PAGES. `overview.sentence.voices` is the month's
  // own evidence, already resolved and already erasure-safe; the quarterly
  // pages that want a quote take REFS from it rather than each running its own
  // quote read, so no two pages of one artefact can show the same theme with
  // two different people's words.
  const quotes = overview.sentence.voices.map((v: Voice) => ({ quote: v.quote, cite: v.cite }))
  const subjects = buildSubjects({
    overview, quarterVerdicts, unlocked, gate, monthLabel, monthNote, subjectsRead,
    quotes: voicesFor(overview, 'subject', quotes),
  })
  const category = buildCategory({
    overview,
    quiet: a.quiet ?? null,
    quotes: voicesFor(overview, 'theme', quotes),
    quarterVerdicts,
    monthLabel,
    unlocked,
    gate,
    windowApplied,
    themesRead,
    themesAsked,
    monthNote,
    thisQuarter: a.thisQuarter,
    lastQuarter: a.lastQuarter,
  })
  // THE COVER IS BUILT AFTER THE PAGES IT QUOTES, NOT BEFORE THEM. Its three
  // cards are page 3's quarter gap, page 4's attention panel and the largest of
  // the quarter's own banded steps, so it reads what those pages drew rather
  // than drawing any of it a second time — the rule the whole artefact is
  // arranged under (`buildMoves` takes Market's own acted sentence for it).
  const cover = buildCover({
    overview, quarter, prior, readingAt, readings, thisQuarter: a.thisQuarter,
    gaps: subjects.rows.map((r) => r.gap).filter((g): g is Gap => g != null),
    quarterVerdicts,
  })
  const rivals = buildRivals({ overview, competitive: a.competitive, monthLabel, monthNote })
  const moves = buildMoves({ overview, market: a.market, quarter })

  // Everything the pages may speak from, in one list: the interpretation
  // argues from it, the last page lists what it could not settle, and the
  // method page counts what it refused. One source, three readers.
  const verdicts = [...overview.sentence.verdicts, ...quarterVerdicts]
  const method = buildMethod({
    quarter, verdicts, overview, record: a.record, checks: a.checks, readingAt,
    searchPlan: a.searchPlan ?? null,
    changeLog: a.changeLog ?? null,
  })
  const read = buildRead({ overview, market: a.market, verdicts, quarterVerdicts, unlocked, cover, readings, draft: a.draft ?? null })
  const unsettled = buildUnsettled({ verdicts, readings, overview, method, subjects, moves, category, windowApplied, subjectsRead })

  return {
    brand: overview.brand,
    quarter,
    prior,
    readingAt,
    period: quarterlyPeriod(quarter, prior, readingAt),
    month: overview.month,
    monthStatus: overview.monthStatus,
    readings,
    unlocked,
    gate,
    // A QUARTER IS NOT AN UPDATE'S ARTEFACT. The weekly report names the run
    // it was built over because it IS that update; a quarterly review is dated
    // by the comment across three months and belongs to no single run, so the
    // snapshot carries none rather than the last one that happened to land.
    runId: null,
    cover,
    read,
    subjects,
    category,
    rivals,
    moves,
    method,
    unsettled,
  }
}

/** One windowed read of one quarter. Half-open instants, because
 *  `window_denominators` is `>= from and < to` (lib/reading/record.ts).
 *
 *  `runId` IS NOT OPTIONAL IN PRACTICE. `loadWindowReading` reads
 *  `window_theme_readings` only when it is given one — a read without it is a
 *  pair of denominators and nothing else. */
export async function quarterWindowFor(
  client: SupabaseClient,
  clientId: string,
  quarter: Quarter,
  themes: { runId: string | null; objectIds?: readonly string[] },
): Promise<WindowReading> {
  const { from, to } = halfOpenInstants({ kind: 'quarter', from: quarter.from, to: quarter.to })
  return loadWindowReading(client, clientId, { from, to, runId: themes.runId, objectIds: themes.objectIds })
}

/** The quarter-on-quarter verdicts: one per theme and per subject read on both
 *  sides of the pair, against that audience's own windowed denominator. */
function buildQuarterVerdicts(a: {
  quarter: Quarter
  prior: Quarter
  thisQuarter: WindowReading
  lastQuarter: WindowReading
  subjectsNow: SubjectWindowReading[] | null
  subjectsBefore: SubjectWindowReading[] | null
  readings: number
  overview: OverviewData
}): Verdict[] {
  const now = a.thisQuarter.denominators
  const before = a.lastQuarter.denominators
  if (!now || !before) return []
  const out: Verdict[] = []
  // NO VERDICT ON AN AUDIENCE'S OWN VOLUME. The first cut built one per
  // audience as `value: {k: videos, n: videos}` against the same pair before
  // it — 100% against 100%, so `proportionDelta` answered 0 points and the
  // state was `no_clear_change` however much the quarter moved. It rendered as
  // "The category · 4,147 of 4,147 · no clear change", and it counted as an
  // ANSWERED comparison in `confidenceOf`, inflating the confidence word with
  // a comparison that could not fail. A quarter's volume is a pair of counts,
  // not a share of itself: it is stated as one on the category page and never
  // banded.
  //
  // The theme side, where the window read carried numerators against a real
  // denominator, is the comparison that means something.
  const themesNow = a.thisQuarter.themes ?? []
  const themesBefore = new Map((a.lastQuarter.themes ?? []).map((t) => [`${t.audience}:${t.theme_id}`, t]))
  const denomNow = new Map(now.map((d) => [d.audience, d.videos]))
  const denomBefore = new Map(before.map((d) => [d.audience, d.videos]))
  for (const t of themesNow) {
    const was = themesBefore.get(`${t.audience}:${t.theme_id}`)
    const n = denomNow.get(t.audience)
    const priorN = denomBefore.get(t.audience)
    // THE WINDOW READ CARRIES NO LABEL — `window_theme_readings` answers in
    // registry ids, and a label is the registry's. The month series the pages
    // already loaded holds the labels, and a theme those pages never named has
    // none: dropped, rather than printed to a client as a raw id.
    const label = themeLabel(t.theme_id, a.overview)
    if (!was || !n || !priorN || !label) continue
    out.push(
      quarterChange({
        object: { kind: 'theme', id: t.theme_id, label },
        audience: t.audience,
        window: { kind: 'quarter', from: a.quarter.from, to: a.quarter.to },
        basis: { from: a.prior.from, to: a.prior.to },
        value: { k: t.videos, n },
        baseline: { k: was.videos, n: priorN },
        readings: a.readings,
      }),
    )
  }

  // THE SUBJECT SIDE — the mock's page 3, and the half of the artefact the
  // reader paid for. The tenant's OWN audience is `CLIENT_AUDIENCE`; the first
  // cut looked its verdicts up under the first RIVAL's audience key, against
  // verdicts that were never built for a subject at all, so no quarter column
  // could ever be drawn.
  const subjectsBefore = new Map((a.subjectsBefore ?? []).map((s) => [`${s.audience}:${s.subject_id}`, s]))
  const subjectLabels = new Map(a.overview.subjects.rows.map((r) => [r.id, r.label]))
  for (const s of a.subjectsNow ?? []) {
    // The two columns the page draws, and no others: a subject's reading under
    // a single rival's videos is a different question and has its own page.
    if (s.audience !== CLIENT_AUDIENCE && s.audience !== a.overview.category.audience) continue
    const was = subjectsBefore.get(`${s.audience}:${s.subject_id}`)
    const n = denomNow.get(s.audience)
    const priorN = denomBefore.get(s.audience)
    const label = subjectLabels.get(s.subject_id)
    if (!was || !n || !priorN || !label) continue
    out.push(
      quarterChange({
        object: { kind: 'subject', id: s.subject_id, label },
        audience: s.audience,
        window: { kind: 'quarter', from: a.quarter.from, to: a.quarter.to },
        basis: { from: a.prior.from, to: a.prior.to },
        value: { k: s.videos, n },
        baseline: { k: was.videos, n: priorN },
        readings: a.readings,
      }),
    )
  }
  return out
}

/** A registry id's label, off the month series the pages already loaded. The
 *  window read answers in ids alone; null means nobody on these pages named
 *  this object, and a page prints no row for it. */
function themeLabel(id: string, overview: OverviewData): string | null {
  const mover = [...overview.category.growing, ...overview.category.fading].find((m) => m.id === id)
  return mover?.label ?? null
}

/**
 * "449 videos in September · 10 updates in Q3 2026" — what this quarter rests
 * on, in one line under the cover's figures.
 *
 * NOT `record.line`, which the method page already prints in full and which on
 * a workspace whose windowed reading is unapplied is a sentence about our own
 * bookkeeping rather than about the corpus. And never a quarter TOTAL summed
 * from months: where the window read could not be taken there is no quarter
 * count to print, and the line says the month instead of guessing one.
 */
function corpusLine(overview: OverviewData, quarter: Quarter, quarterVideos: number | null): string {
  const parts: string[] = []
  if (quarterVideos != null) parts.push(`${fmtInt(quarterVideos)} category videos read in ${quarterLabel(quarter, false)}`)
  else if (overview.bar.videos != null) parts.push(`${fmtInt(overview.bar.videos)} videos in ${longMonth(overview.month)}`)
  if (overview.bar.updates > 0) parts.push(`${fmtInt(overview.bar.updates)} ${overview.bar.updates === 1 ? 'update' : 'updates'} in ${longMonth(overview.month)}`)
  return parts.length ? parts.join(' · ') : 'Nothing has been read for this workspace yet.'
}

/** An audience key in the reader's words — "in your own videos", "in the
 *  category", "under Freitag" — or null where this workspace does not name it.
 *  The rival labels are the operator's own from Settings. */
function audienceSideIn(overview: OverviewData): (audience: string) => string | null {
  return (audience: string): string | null => {
    if (audience === CLIENT_AUDIENCE) return 'in your own videos'
    if (audience === overview.category.audience) return `in ${overview.category.label.toLowerCase()}`
    const rival = overview.rivals.rows.find((r) => r.audience === audience)
    return rival ? `under ${rival.label}` : null
  }
}

/** One audience's videos in a windowed read, or null when that audience was
 *  not in it (or the read could not be taken at all). Never a sum across
 *  audiences: every audience counts the same category videos from a different
 *  side, so adding them counts one corpus several times. */
function windowVideos(reading: WindowReading, audience: string): number | null {
  return reading.denominators?.find((d) => d.audience === audience)?.videos ?? null
}

// ---- page 1 · the cover -------------------------------------------------------

function buildCover(a: {
  overview: OverviewData
  quarter: Quarter
  prior: Quarter
  readingAt: string
  readings: number
  thisQuarter: WindowReading
  /** The quarter gaps page 3 draws — the cover's first card is one of them. */
  gaps: readonly Gap[]
  /** The quarter's own banded steps — the cover's third card is the largest. */
  quarterVerdicts: readonly Verdict[]
}): CoverPage {
  const { overview } = a
  const lead = overview.sentence.lead
  // THE CATEGORY'S OWN WINDOWED COUNT, not a sum across audiences. See
  // `windowVideos` and `coverBody`.
  const quarterVideos = windowVideos(a.thisQuarter, overview.category.audience)
  const monthOutside = monthBasisClause(overview.month, a.quarter) != null

  const figures: ReadingFigures = { ...overview.sentence.figures }
  if (lead && isAnswer(lead.state) && lead.value.n > 0) {
    figures.lead_share = { value: Math.round((lead.value.k / lead.value.n) * 1000) / 10, unit: 'pct', label: `${lead.objectLabel}, this month` }
    figures.lead_of = { value: lead.value.n, unit: 'videos', label: 'videos it is a share of' }
  }
  if (quarterVideos != null) {
    figures.quarter_videos = { value: quarterVideos, unit: 'videos', label: `${overview.category.label} videos read in ${quarterLabel(a.quarter, false)}` }
  }

  // THE MOCK'S THREE CARDS, IN THE MOCK'S ORDER, AND NONE OF THE MOCK'S THREE
  // CLAIMS (`qr.p1.stats`).
  //
  //   "13 pts · gap to Freitag … narrowed from 19 points in June"
  //     → the QUARTER gap between the two columns page 3 prints, with both
  //       sides' k of n and the band, and the earlier quarter as its own dated
  //       reading rather than as the word "narrowed" (D1, lib/reading/gap.ts).
  //   "−18% · category attention since June … panel re-frozen 3 Sep"
  //     → the panel's own level with the size of the panel under it, and the
  //       latest BANDED step beside it. June to September crosses the
  //       3 September re-freeze, which is the refusal `AttentionBlock.verdict`
  //       carries instead of a percentage (D7, D8).
  //   "−3 pts · price in the category, Q2 33% to Q3 30%. Fading for a 3rd month."
  //     → the largest quarter-on-quarter step that CLEARED its band, printed as
  //       its two counts with the badge. No direction word: three consecutive
  //       quarters is not something any tenant has (D2, D5).
  //
  // THE CARDS FALL BACK RATHER THAN GOING BLANK. Below the migrations none of
  // the three can be read, and a cover of three absences is not the artefact —
  // so the month's own lead, the month's videos and the reading counter fill
  // the remaining slots, in that order, and the cover always carries three
  // real figures. Trimmed to three at the end, which is the mock's grid.
  const stats: CoverStat[] = []
  const gap = [...a.gaps].sort((g, h) => (h.state === 'apart' ? 1 : 0) - (g.state === 'apart' ? 1 : 0))[0] ?? null
  if (gap) {
    const apart = gap.state === 'apart' && gap.gapPts != null
    stats.push({
      token: `gap_${gap.objectId}`,
      kind: apart ? 'figure' : 'word',
      value: apart ? `${Math.round(Math.abs(gap.gapPts as number) * 10) / 10} pts` : GAP_WORDS[gap.state],
      label: `${gap.objectLabel} — you against ${gap.b.label}, ${quarterLabel(a.quarter, false)}`,
      caption: [gapLine(gap, { period: true }), gapBasisLine(gap)].filter(Boolean).join(' · '),
    })
  }
  const attention = overview.category.attention
  const panelMonth = attention?.months[attention.months.length - 1] ?? null
  if (attention && panelMonth) {
    stats.push({
      token: 'panel_comments',
      kind: 'figure',
      value: fmtInt(panelMonth.comments),
      label: `panel comments under ${overview.category.label.toLowerCase()} in ${longMonth(panelMonth.month)}`,
      caption: [
        attention.accountCount != null ? `a fixed panel of ${fmtInt(attention.accountCount)} accounts` : 'a fixed panel of accounts',
        attention.panel?.frozen_at ? `frozen ${fullDate(attention.panel.frozen_at)}` : null,
      ].filter(Boolean).join(' · '),
      verdict: attention.verdict,
    })
  }
  const moved = [...a.quarterVerdicts]
    .filter((v) => v.state === 'moved' && v.changePts != null)
    .sort((v, w) => Math.abs(w.changePts as number) - Math.abs(v.changePts as number))[0] ?? null
  if (moved) {
    stats.push({
      token: `quarter_${moved.objectKind}_${moved.objectId}`,
      kind: 'figure',
      value: `${fmtInt(moved.value.k)} of ${fmtInt(moved.value.n)}`,
      label: `${moved.objectLabel}, ${quarterLabel(a.quarter, false)}`,
      caption: moved.baseline
        ? `against ${fmtInt(moved.baseline.k)} of ${fmtInt(moved.baseline.n)} in ${quarterLabel(a.prior, false)}`
        : `read over ${quarterLabel(a.quarter, false)}`,
      verdict: moved,
    })
  }
  if (lead && isAnswer(lead.state) && lead.value.n > 0) {
    stats.push({
      token: 'lead_share',
      kind: 'figure',
      value: pct1((lead.value.k / lead.value.n) * 100),
      label: `${lead.objectLabel} in ${longMonth(overview.month)}`,
      caption: `${fmtInt(lead.value.k)} of ${fmtInt(lead.value.n)} videos${lead.bandPts != null ? ` · band ±${Math.round(lead.bandPts * 10) / 10}` : ''}`,
    })
  }
  if (overview.bar.videos != null) {
    stats.push({
      token: 'month_videos',
      kind: 'figure',
      value: fmtInt(overview.bar.videos),
      label: `videos in ${longMonth(overview.month)}`,
      caption: overview.bar.line,
    })
  }
  // NOT "behind your own side", WHICH THIS NUMBER IS NOT ABOUT. `bar.readings`
  // counts the months of the gathered era that carry a DENOMINATOR ROW, summed
  // over every audience — so a month counts if the client, the category or any
  // tracked rival was read in it, at any volume. That is Overview's own
  // counter, printed on OV0 in the same words, and it is the number
  // `quarterChange` gates on; what it is not is a count of this workspace's own
  // side, nor a count of months a comparison may be drawn on. Ask's
  // `readableMonthCount` (lib/agent/basis.ts) answers that second question with
  // two reductions this one does not make — it drops rival audiences and months
  // under SHARE_BAND.minN — and the two print under the same word on the same
  // day for the same tenant. Reconciling them is a decision about when the
  // quarter view unlocks, not a label; the label at least stops claiming the
  // narrower of the two.
  stats.push({
    token: 'readings',
    kind: 'figure',
    value: String(a.readings),
    label: 'monthly readings so far',
    caption: readingCounter(a.readings),
  })

  return {
    body: coverBody({
      lead,
      monthLabel: longMonth(overview.month),
      quarterLabel: quarterLabel(a.quarter, false),
      unlocked: quarterUnlocked(a.readings),
      readings: a.readings,
      monthOutside,
    }),
    figures,
    stats: stats.slice(0, 3),
    // A DAY, NOT A MONTH. The first cut printed "as at Sep 2026", which is the
    // month the reading is OF; the stamp is the day the reading was TAKEN, and
    // on a still-filling quarter those are different facts about one artefact.
    // The mock's own masthead says "as at 28 Sep 2026".
    // THE QUARTER'S OWN STATE, THEN THE MONTH'S. "September still filling" was
    // keyed off `overview.monthStatus` alone, so a Q3 review built in November
    // stamped "November still filling" on a quarter that closed weeks earlier.
    // The quarter says whether IT is filling; the month clause says which month
    // the month-level pages are of, and whether it is even inside the quarter.
    stamp: [
      `as at ${fullDate(a.readingAt)}`,
      quarterFilling(a.quarter, a.readingAt) ? `${quarterLabel(a.quarter, false)} still filling` : null,
      monthBasisClause(overview.month, a.quarter),
      readingCounter(a.readings),
    ]
      .filter(Boolean)
      .join(' · '),
    corpus: corpusLine(overview, a.quarter, quarterVideos),
  }
}

// ---- page 2 · our read --------------------------------------------------------

function buildRead(a: {
  overview: OverviewData
  market: MarketSurfaceData | null
  verdicts: Verdict[]
  /** The quarter-on-quarter half alone — what the interpretation may argue
   *  from, because its slot's sentences all say "this quarter". */
  quarterVerdicts: Verdict[]
  unlocked: boolean
  cover: CoverPage
  readings: number
  draft: string | null
}): ReadPage {
  const quotes = a.overview.sentence.voices.map((v: Voice) => ({ quote: v.quote, cite: v.cite }))
  // THE QUARTERLY SLOT'S SENTENCES SAY "THIS QUARTER", so only comparisons
  // whose window IS the quarter may be argued from. Handed the whole list, the
  // page wrote "X cleared the band this quarter" about a month verdict — the
  // same figure the cover was calling a quarter change. A month's reading is
  // still on the pages that own it, and is still in `verdicts` below for
  // anything that audits what this artefact drew.
  const interpretation = composeInterpretation(
    'interpretation_quarterly',
    a.quarterVerdicts,
    proseFigures(a.cover.figures),
    quotes.map((q) => ({ ref: q.quote.ref, context: q.cite })),
    { draft: a.draft },
  )
  const ledger = a.market?.advice.rows ?? []
  const advice: StandingAdvice[] = ledger.slice(0, 5).map((row) => ({
    id: row.lineageId,
    title: row.title,
    age:
      row.monthsRepeated > 1
        ? `first raised ${longMonth(`${row.firstMade.slice(0, 7)}-01`)} · ${row.monthsRepeated} months`
        : `new in ${longMonth(`${row.firstMade.slice(0, 7)}-01`)}`,
    status: row.statusLabel,
    decidedAt: row.decidedAt,
    grounded: row.grounded,
  }))
  return {
    interpretation,
    meta: [
      a.cover.corpus,
      readingCounter(a.readings),
    ].join(' · '),
    figures: a.cover.figures,
    verdicts: a.verdicts,
    quotes,
    advice,
    adviceNote: a.market ? a.market.advice.empty : 'The advice ledger could not be read for this workspace.',
    confidence: confidenceOf(a.verdicts, a.unlocked),
    // THE QUARTER HALF, LIKE THE INTERPRETATION TWO LINES ABOVE IT. Handed the
    // whole list, "What is counted under it" printed a MONTH's figure under a
    // paragraph arguing about the quarter — September against August under
    // "Nothing cleared its band this quarter", and on a workspace where no
    // quarter verdict can be built at all every counted line was a month's. On
    // a populated read a Q3 line and a September line sat in one list with
    // nothing to tell them apart. A month's counted figures belong under a
    // heading that names the month, and this heading does not.
    counted: countedLines(a.quarterVerdicts),
  }
}

/** "Three counted things sit under that" — the mock's own device, built from
 *  the verdicts rather than written. Only answered verdicts appear: a counted
 *  thing that did not clear its band is not a counted thing. */
export function countedLines(verdicts: readonly Verdict[], limit = 3): string[] {
  return verdicts
    .filter((v) => v.state === 'moved' && v.changePts != null && v.value.n > 0)
    .sort((x, y) => Math.abs(y.changePts ?? 0) - Math.abs(x.changePts ?? 0))
    .slice(0, limit)
    .map(
      (v) =>
        `${v.objectLabel}: ${fmtInt(v.value.k)} of ${fmtInt(v.value.n)} videos${
          v.baseline ? `, against ${fmtInt(v.baseline.k)} of ${fmtInt(v.baseline.n)} before it` : ''
        }.`,
    )
}

// ---- page 3 · your subjects ---------------------------------------------------

function buildSubjects(a: {
  overview: OverviewData
  quarterVerdicts: Verdict[]
  unlocked: boolean
  gate: string
  monthLabel: string
  monthNote: string | null
  subjectsRead: boolean
  quotes: { quote: Quote; cite: string }[]
}): SubjectsPage {
  const block = a.overview.subjects
  const categoryLabel = a.overview.category.label
  const byObject = new Map(a.quarterVerdicts.map((v) => [`${v.objectKind}:${v.objectId}:${v.audience}`, v]))

  // D1 · THE QUARTER GAP, off the two verdicts the two columns are drawn from.
  // Both sides come from one `WindowReading` — the month bodies minus the month
  // GROUP BY, never a sum of month rows — so the difference, the two levels and
  // the band are one reading of one pair of numbers.
  const gapSide = (v: Verdict, label: string, counted: 'value' | 'baseline'): GapSide | null => {
    const side = counted === 'value' ? v.value : v.baseline
    if (!side) return null
    return { audience: v.audience, label, value: side, pct: null, observed: side.n > 0 }
  }
  const quarterGap = (row: { id: string; label: string }, you: Verdict | null, category: Verdict | null): Gap | null => {
    if (!you || !category) return null
    const a1 = gapSide(you, 'you', 'value')
    const b1 = gapSide(category, categoryLabel, 'value')
    if (!a1 || !b1) return null
    const a0 = gapSide(you, 'you', 'baseline')
    const b0 = gapSide(category, categoryLabel, 'baseline')
    // A refusal on EITHER column refuses the difference: if the product will
    // not say whether one side moved, it will not say how far apart they are
    // either, because both refusals are about the same break in the record.
    // A refused column that recorded no reason draws NO gap rather than a
    // difference beside it (`inheritRefusal`, lib/reading/gap.ts).
    const inherited = inheritRefusal([you, category])
    if (inherited.refused && !inherited.reason) return null
    const refused = inherited.reason ?? undefined
    return gapBetween({
      objectKind: 'subject',
      objectId: row.id,
      objectLabel: row.label,
      a: a1,
      b: b1,
      window: you.window,
      ...(a0 && b0 && you.basis && category.basis
        ? { basis: { a: a0, b: b0, window: { kind: 'quarter' as const, from: you.basis.from, to: you.basis.to } } }
        : {}),
      ...(refused ? { refused } : {}),
      // A subject's membership is not a clustering artefact.
      regime: 'n/a',
    })
  }

  const rows: SubjectQuarterRow[] = block.rows.map((row) => ({
    id: row.id,
    label: row.label,
    // A SIDE WITH NO DENOMINATOR IS NOT A SIDE. Overview's subject row carries
    // nulls where the audience was not read at all; a cell that printed "0 of
    // 0" would be a measurement of a thing nobody measured.
    you: row.you && row.you.k != null && row.you.n != null ? { k: row.you.k, n: row.you.n, pct: row.you.pct } : null,
    category:
      row.category && row.category.k != null && row.category.n != null
        ? { k: row.category.k, n: row.category.n, pct: row.category.pct }
        : null,
    // YOUR OWN SIDE IS `CLIENT_AUDIENCE` (lib/rivals.ts). The first cut keyed
    // it on `overview.rivals.rows[0].audience` — the first COMPETITOR — so the
    // "you" column could not have been drawn even had a subject verdict
    // existed, which none did.
    // THE RIVAL COLUMN, WHICH THE ARTEFACT HAD AND DROPPED. Overview's own
    // subject row carries the lead rival's side; the quarterly kept two of the
    // three. It is a LEVEL beside the other two levels, and nothing on this
    // page subtracts one from another: two proportions on two different
    // denominators have no band (deviation D1), so the three are printed and
    // the gap is not named.
    rival:
      row.rival && row.rival.k != null && row.rival.n != null
        ? { k: row.rival.k, n: row.rival.n, pct: row.rival.pct }
        : null,
    // THE CATEGORY'S OWN MONTHS. The spark is the category side by
    // construction (lib/pages/overview.ts) — it is the only side with the n to
    // carry a line on today's corpus — and the page draws it only where three
    // readings stand behind it.
    spark: row.spark,
    sparkMonths: row.sparkMonths,
    youQuarter: byObject.get(`subject:${row.id}:${CLIENT_AUDIENCE}`) ?? null,
    categoryQuarter: byObject.get(`subject:${row.id}:${a.overview.category.audience}`) ?? null,
    gap: quarterGap(
      row,
      byObject.get(`subject:${row.id}:${CLIENT_AUDIENCE}`) ?? null,
      byObject.get(`subject:${row.id}:${a.overview.category.audience}`) ?? null,
    ),
  }))
  const drawn = rows.some((r) => r.youQuarter || r.categoryQuarter)
  // ONE LINE, NOT SIX. The chart is the LEAD subject's category series — the
  // row the page opens with — because six overlaid series on a printed sheet
  // is not a reading, and because every one of them divides by the same
  // denominator anyway.
  const lead = rows.find((r) => r.spark.some((p) => p != null)) ?? null
  return {
    rows,
    rivalLabel: block.rivalLabel,
    line: lead
      ? monthLine({
          months: lead.sparkMonths,
          labelFor: monthlyLineLabel,
          series: [{ label: `${lead.label} · ${block.categoryLabel}`, points: lead.spark }],
        })
      : null,
    quotes: a.quotes,
    monthLabel: a.monthLabel,
    monthNote: a.monthNote,
    note: block.note,
    notRecorded: block.state === 'not_recorded' ? 'Subjects are not recorded for this workspace yet, so there is no quarter-on-quarter table to draw.' : null,
    gate: a.unlocked ? null : a.gate,
    // WHY THE LAST TWO COLUMNS ARE EMPTY, SAID ONCE UNDER THE TABLE. A page
    // that heads two columns "this quarter against the one before it" and then
    // draws nothing in them, with no sentence, is the artefact refusing to
    // account for itself — which is the one thing this product does not do.
    quarterNote: drawn
      ? null
      : !a.subjectsRead
        ? 'Your subjects are not counted as one window for this workspace yet, so the quarter columns cannot be drawn.'
        : 'No subject carried a reading on both sides of this quarter, so the quarter columns are empty.',
  }
}

// ---- page 4 · what the category talked about ----------------------------------

/**
 * The month's voices, claimed by the page the thing they were cited for
 * belongs to.
 *
 * THE OVERVIEW BLOCK'S RULE, MIRRORED. `sentence.voices` is loaded from the
 * supporting insights of the month's LEAD object (`loadVoices`), so it is
 * evidence for one thing — a subject or a theme — and not for the artefact at
 * large. `components/pages/overview/category.tsx` already refuses them where
 * the lead is not a theme of the category, on the principle that a quote is
 * about the category only when the thing it was cited for is one. Handed
 * unfiltered to both pages, page 3 cited a THEME's evidence as a subject quote
 * — the exact case that guard exists to refuse — and the printed artefact
 * carried the same two quotes on pages 2, 3 and 4.
 *
 * A theme's voices are further held to the category's own audience, which is
 * the audience page 4 prints. The read page keeps all of them: it is the page
 * the sentence itself is on, and they are that sentence's evidence.
 */
export function voicesFor<T>(
  overview: OverviewData,
  kind: 'subject' | 'theme',
  quotes: readonly T[],
): T[] {
  const lead = overview.sentence.lead
  if (!lead || lead.objectKind !== kind) return []
  if (kind === 'theme' && lead.audience !== overview.category.audience) return []
  return [...quotes]
}

/** The two READER_FLAGS on a mover, and nothing else. `isNew` is the row's own
 *  answer to "first heard this month"; the rest come off the verdict, which is
 *  where every other flag on this artefact already lives. */
export function withFlags(mover: Mover): QuarterMover {
  const flags: VerdictFlag[] = []
  if (mover.isNew) flags.push('new')
  for (const f of mover.verdict.flags) if ((READER_FLAGS as readonly string[]).includes(f) && !flags.includes(f)) flags.push(f)
  return { ...mover, flags }
}

function buildCategory(a: {
  overview: OverviewData
  quiet: QuarterQuiet[] | null
  quotes: { quote: Quote; cite: string }[]
  quarterVerdicts: Verdict[]
  monthLabel: string
  unlocked: boolean
  gate: string
  windowApplied: boolean
  themesRead: boolean
  themesAsked: boolean
  monthNote: string | null
  thisQuarter: WindowReading
  lastQuarter: WindowReading
}): CategoryPage {
  const c = a.overview.category
  const prevMonthLabel = longMonth(previousMonthOf(a.overview.month))
  const quarter = a.quarterVerdicts.filter((v) => v.audience === c.audience)
  const videos = windowVideos(a.thisQuarter, c.audience)
  const before = windowVideos(a.lastQuarter, c.audience)
  return {
    audience: c.audience,
    label: c.label,
    denominator: c.denominator,
    monthLabel: a.monthLabel,
    // THE MOCK'S OWN SENTENCE, PLUS WHERE THAT MONTH SITS. Movers and the kind
    // mix are a MONTH against the month before it, and a quarterly review that
    // let a reader think they were quarter figures would be the whole point of
    // this package missed. On a review built after its quarter closed the month
    // is not even inside it, and the sentence has to say so — see
    // `monthBasisClause`.
    basis: `Movers and the mix are ${a.monthLabel} against ${prevMonthLabel}.${
      a.monthNote ? ` ${a.monthNote}` : ''
    }`,
    // THE GATE IS A CAVEAT, NOT A MASTHEAD. It says the quarter view needs six
    // monthly readings and names how many stand behind this one, which reads
    // as a live warning; printed unconditionally it said "needs six months —
    // you have 9" to a workspace that cleared the gate three readings ago.
    // `buildSubjects` has always dropped it at six; this page now does too.
    gate: a.unlocked ? null : a.gate,
    growing: c.growing.map(withFlags),
    fading: c.fading.map(withFlags),
    moversNote: c.moversNote,
    quiet: a.quiet,
    // TWO SILENCES, AND THEY ARE NOT THE SAME CLAIM. A register we could not
    // read is a failure of ours; a register with nothing dormant in it is a
    // reading. The mock's "gone quiet" column would say the same thing for
    // both, and a reader would take the first for the second.
    // AND NEITHER SENTENCE MAY SAY THE FLAG'S OWN WORDS. Both were written
    // with "gone quiet" in them and neither was ever rendered; wave 2 renders
    // them, and rule (c) sweeps a direction word outside a verdict node —
    // which is what the FLAG is marked as, and a sentence about the register
    // is not. Overview's own wording is the precedent ("Nothing this page has
    // drawn has stopped being said").
    quietNote:
      a.quiet == null
        ? 'The register of dormant themes could not be read for this workspace.'
        : a.quiet.length === 0
          ? 'Nothing this artefact follows has stopped being said.'
          : null,
    quotes: a.quotes,
    kinds: c.kinds,
    kindVerdicts: c.kindVerdicts,
    kindsNote: c.kindsNote,
    reddit: c.reddit,
    attention: c.attention,
    attentionNote: c.attentionNote,
    mood: c.mood,
    moodNote: c.moodNote,
    quarter,
    // FOUR SILENCES, AND NO TWO OF THEM ARE THE SAME CLAIM. No windowed
    // reading at all is a migration that has not been applied; no theme named
    // to follow is a month that moved nothing clearly, so nothing was LOOKED
    // FOR; a windowed reading with no clustering behind it is an update that
    // has not themed; and a pair of reads that produced no comparable row is a
    // measurement. The fourth used to be folded into the last, which stated a
    // measurement about a question nobody asked.
    quarterNote: !a.windowApplied
      ? 'The quarter-on-quarter reading is not recorded for this workspace yet, so only the month is compared.'
      : !a.themesAsked
        ? `Nothing moved clearly in ${a.monthLabel}, so no theme was named to follow across this quarter.`
        : !a.themesRead
          // NOT "clustering", WHICH IS OURS. The GLOSSARY's reader-facing word
          // for it is under `theme` — "the grouping is ours and it can change;
          // when it does, the line says so" — and every other arm of this
          // four-way silence is already in plain words. This one went out on a
          // sent artefact and behind the share link.
          ? 'No grouping of this quarter’s themes could be read, so what the category talked about is compared month on month only.'
          : quarter.length === 0
            ? 'Nothing the category talked about carried a reading on both sides of this quarter.'
            : null,
    quarterVolume: videos != null && before != null ? { videos, before } : null,
  }
}

function previousMonthOf(month: string): string {
  const d = new Date(`${month.slice(0, 10)}T00:00:00.000Z`)
  d.setUTCMonth(d.getUTCMonth() - 1)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}

// ---- page 5 · rivals ----------------------------------------------------------

function buildRivals(a: {
  overview: OverviewData
  competitive: CompetitiveSurfaceData | null
  monthLabel: string
  monthNote: string | null
}): RivalsPage {
  const co = a.competitive
  return {
    rows: a.overview.rivals.rows,
    // COMPETITIVE'S OWN TWO READS, PASSED THROUGH. Re-deriving either here
    // would be a second count of one thing on one artefact, which is how a
    // deck comes to disagree with the page it was composed from.
    ownPosts: co?.ownClaims ?? [],
    saidAbout: co?.saidAbout ?? [],
    monthLabel: a.monthLabel,
    monthNote: a.monthNote,
    recorded: a.overview.rivals.recorded,
    months: co?.standings.months ?? [],
    standings: co?.standings ?? null,
    standingsNote: co ? co.standings.empty : 'The standings could not be read for this workspace.',
    questions: co?.questions.rows.slice(0, 6) ?? [],
    questionsRival: co?.questions.rival ?? null,
    headToHead: co?.headToHead ?? null,
    questionsLine: co
      // FINDINGS, NOT READINGS. `co.questions.insights` counts question-kind
      // audience_insights rows. "Reading" is one of the thirteen words and is
      // fixed as a measurement of a PERIOD — the cover stamp six pages earlier
      // in this same document says "your 8th monthly reading" — so one artefact
      // printed the word twice meaning two different things. Ask already uses
      // the reader's word for these rows ("3,129 of 3,129 findings
      // searchable", lib/agent/basis.ts).
      ? `${fmtInt(co.questions.videos)} rival videos in this window carried a question, over ${fmtInt(co.questions.insights)} findings.`
      : 'What the category asks under a rival’s videos could not be read for this workspace.',
    rivalsNote: a.overview.rivals.standingsNote,
    dualMention: a.overview.rivals.dualMention,
    caveat: a.overview.rivals.caveat,
  }
}

// ---- page 6 · your moves ------------------------------------------------------

function buildMoves(a: { overview: OverviewData; market: MarketSurfaceData | null; quarter: Quarter }): MovesPage {
  const m = a.market
  const inQuarter = (day: string | null): boolean => !!day && day >= a.quarter.from && day <= a.quarter.to
  const moves = (m?.moves.rows ?? []).filter((r) => inQuarter(r.declaredAt.slice(0, 10)))
  const advice = m?.advice.rows ?? []
  const declared = new Set(moves.map((r) => r.id))
  return {
    moves,
    // THE READINGS OF THE MOVES THIS PAGE DRAWS, and no others: a reading of a
    // move declared in another quarter is a real reading and is not this
    // page's, and the moves above are already filtered by declared date.
    readings: (m?.moves.readings ?? []).filter((r: MoveReading) => declared.has(r.moveId)),
    movesNote: m ? (m.moves.recorded ? m.moves.empty : 'Moves are not recorded for this workspace yet.') : 'Moves could not be read for this workspace.',
    advice,
    // NEITHER SIDE OF THIS WAS QUARTER-SCOPED, AND THE DENOMINATOR WAS A
    // DISPLAY CAP. "You acted on N of 12 this quarter" divided decisions dated
    // inside the quarter by `market.advice.rows.length` — the twelve OLDEST
    // rows of a ledger that runs to 56 and 64 (`ledgerRowsShown`). The Market
    // page next door already answers this over the real total, and its own
    // docblock explains why the quarter is a lie on it: a decision carries a
    // date, but the denominator is every identity ever recommended, which has
    // no quarter at all. One sentence, computed once, in that module.
    actedLine: m ? m.advice.actedLine : 'The advice ledger could not be read for this workspace.',
    adviceNote: m?.advice.empty ?? null,
    claims: m?.ways.claims ?? [],
    claimsLine: m?.ways.claimsLine ?? 'What you say and what they say back could not be read for this workspace.',
    // THE ARTEFACT'S OWN CAVEAT, NOT THE PAGE'S. See QUARTERLY_CLAIMS_CAVEAT:
    // the page's second sentence is build status about an unshipped feature and
    // this artefact goes to people outside the workspace.
    claimsCaveat: m ? QUARTERLY_CLAIMS_CAVEAT : '',
    // The newest plan Market read, carried through unchanged — one reading of
    // one plan, not two computations of it.
    plan: m?.plans[0] ?? null,
    // THE RULE OF THIS PAGE, printed on it. It is the one page that puts a
    // move and a reading side by side, and a reader will draw the arrow if we
    // do not say we are not drawing it.
    rule: 'We report what the conversation did after you acted. We never claim you caused it.',
  }
}

// ---- page 7 · coverage and method ---------------------------------------------

interface CheckRow {
  run_id: string
  outcome: string
  flagged_count: number | null
  week_start: string | null
}

export interface FlagRow {
  object_kind: string
  /** The key `flagOutcome` joins on — a subjects.id, an insight category slug,
   *  a `competitor:<name>` string or a theme_registry.id. */
  object_id: string
  label: string
  denominator: string
  week_start: string
  week_end: string
  week_k: number
  week_n: number
  change_pts: number | string
  band_pts: number | string
  explanation: { sentences?: string[] } | null
}

function buildMethod(a: {
  quarter: Quarter
  verdicts: Verdict[]
  overview: OverviewData
  record: RecordInputs | null
  checks: QuarterChecks
  readingAt: string
  searchPlan: SearchPlan | null
  changeLog: DeckChangeLog | null
}): MethodPage {
  const window: RecordWindow = { kind: 'quarter', from: a.quarter.from, to: a.quarter.to }
  const refused: Refusal[] = refusals(a.verdicts)
  const checks = a.checks
  // THE REFUSALS ARE THIS RENDER'S, not the corpus's, so they are counted by
  // the caller and stitched in here rather than read (lib/reading/record.ts).
  const inputs: RecordInputs | null = a.record
    ? { ...a.record, window, refusals: refused, comparisonsRefused: refused.length }
    : null

  const flags: QuarterFlag[] = checks.flags.map((f) => ({
    label: f.label,
    weekStart: f.week_start,
    weekEnd: f.week_end,
    k: f.week_k,
    n: f.week_n,
    denominator: f.denominator,
    outcome: flagOutcome({ objectKind: f.object_kind, objectId: f.object_id }, a.verdicts),
    sentences: f.explanation?.sentences ?? [],
  }))

  return {
    window,
    // A MONTH'S RECORD IS NOT THE QUARTER'S. The fallback printed Overview's
    // own record here — "3 updates · 2,359 videos …", "3 updates delivered,
    // 2026-09-06 to 2026-09-13, longest gap 7 days", and another page's
    // refusals — under the heading "How was this quarter read?", two lines
    // above a numbers table that said "The corpus — not recorded" and six
    // pages before one that said every comparison was drawn. Three
    // contradictions on one artefact. A record that could not be read says so.
    line: inputs
      ? howSoundLine(inputs)
      : 'How this quarter was read could not be recovered for this workspace, so nothing about its coverage is stated here.',
    lines: inputs ? recordLines(inputs) : [],
    checks: {
      ran: checks.ran,
      flagged: checks.flaggedRuns,
      recorded: checks.recorded,
    },
    flags,
    flagsNote: checks.recorded
      ? checks.ran === 0
        ? 'No unusual-week check has run inside this quarter.'
        : null
      : 'The unusual-week check is not recorded for this workspace yet, so this quarter has no check record to print.',
    numbers: methodNumbers(inputs, a.quarter, a.overview, a.readingAt),
    unit: 'A video with an analysed comment written in the month.',
    refusedLine: refused.length ? refusedSentence(refused) : null,
    // THE FOOTNOTE IS THE PAGE'S, NOT THE MONTH'S — composed over the quarter
    // window this method page already holds, so its coverage clause is the
    // quarter's and its read-depth clause still says it is all-time.
    method: inputs ? methodLines(inputs, { brand: a.overview.brand, readingAt: a.readingAt }) : null,
    searchPlan: a.searchPlan,
    changeLog: a.changeLog,
  }
}

/** The corpus in numbers, as the mock's own table. Every row carries what it
 *  is out of, or says it was not recorded. */
export function methodNumbers(
  inputs: RecordInputs | null,
  quarter: Quarter,
  overview: OverviewData,
  readingAt: string,
): { label: string; value: string; note?: string }[] {
  const out: { label: string; value: string; note?: string }[] = [
    // THE PERIOD IS THE QUARTER'S, SO ITS STATE IS THE QUARTER'S. Keyed off
    // `overview.monthStatus` this row said "still filling" about a quarter that
    // had closed weeks earlier, because the MONTH the product is in was
    // filling.
    // AND IN THE READER'S DATES. This row printed the bounds raw — "Period ·
    // 2026-07-01 – 2026-09-30" — on a client-facing sheet where every other
    // date goes through fullDate / shortDate / longMonth; the mock's own row
    // reads "1 Jul – 28 Sep 2026". The year is on the second date only,
    // because a quarter never crosses one.
    { label: 'Period', value: `${shortDate(quarter.from)} – ${fullDate(quarter.to)}`, note: quarterFilling(quarter, readingAt) ? 'still filling' : undefined },
  ]
  if (!inputs) {
    // NOT "The corpus", WHICH IS OURS, and this is the row a young workspace
    // is most likely to be shown. Every other label in this table is already in
    // the reader's words — Videos, Comments, Updates, "Videos in September".
    out.push({ label: 'Videos', value: 'not recorded', note: 'the quarter’s record could not be read for this workspace' })
    return out
  }
  // `coverage` is NULL when the month tables are not applied and EMPTY when
  // the tenant has never been read — two different silences, and neither is a
  // zero (lib/reading/record.ts).
  if (!inputs.coverage) {
    // NOT "the month tables are not applied" — they are, and they are seeded.
    // What is missing is the WINDOWED read (`window_denominators`, M3), which
    // is the only honest way to count distinct videos over three months. The
    // month in hand is printed instead, labelled as the month.
    out.push({
      label: `Videos in ${longMonth(overview.month)}`,
      value: overview.bar.videos != null ? fmtInt(overview.bar.videos) : 'not recorded',
      note: 'the quarter is not counted as one window for this workspace yet, so the month in hand is stated instead',
    })
    if (inputs.delivery.delivered > 0) {
      out.push({
        label: 'Updates',
        value: `${fmtInt(inputs.delivery.delivered)} this quarter`,
        note: inputs.delivery.longestGapDays != null ? `longest gap ${fmtInt(inputs.delivery.longestGapDays)} days` : undefined,
      })
    }
    return out
  }
  const videos = inputs.coverage.reduce((sum, c) => sum + c.videos, 0)
  const comments = inputs.coverage.reduce((sum, c) => sum + c.comments, 0)
  out.push({ label: 'Videos', value: fmtInt(videos), note: 'distinct videos with an analysed comment in the quarter' })
  // "COMMENTS", NOT "CONVERSATIONS". `lib/calibration.ts` fixes a conversation
  // as one video and the comments it sparked, and says comments are always
  // counted separately as comments — so this row under a Videos row labelled
  // Conversations said the quarter held 1,388 videos and 11,840 conversations,
  // where the glossary makes the conversations 1,388.
  out.push({ label: 'Comments', value: fmtInt(comments), note: 'comments read across those videos' })
  out.push({
    label: 'Updates',
    value: `${fmtInt(inputs.delivery.delivered)} this quarter`,
    note: inputs.delivery.longestGapDays != null ? `longest gap ${fmtInt(inputs.delivery.longestGapDays)} days` : undefined,
  })
  // THE ARTBOARD'S OTHER FOUR ROWS — Sources, Held back, Languages and the
  // refusals — which the build had as PROSE above the table and the mock has as
  // rows (`qr.p7.numbers`). Same figures, same basis sentences, in the shape a
  // reader can scan. Each is pushed only where its own read exists, so a row is
  // never a blank and never a zero standing in for a silence.
  const mix: PlatformMix = {}
  for (const c of inputs.coverage) for (const [k, n] of Object.entries(c.platformMix)) mix[k] = (mix[k] ?? 0) + n
  const sources = platformShareLine(mix)
  if (sources) out.push({ label: 'Sources', value: sources, note: 'of the videos read in this quarter' })
  if (inputs.discard.readable && inputs.discard.judged > 0) {
    out.push({
      label: 'Held back',
      value: `${fmtPct((inputs.discard.setAside / inputs.discard.judged) * 100, 0)} set aside by the relevance gate`,
      // THE GATE'S OWN CLOCK, NAMED. `recordedFrom` is the day the gate started
      // recording what it discarded, and no month before it can show this.
      note: `${fmtInt(inputs.discard.setAside)} of ${fmtInt(inputs.discard.judged)} looked at${
        inputs.discard.recordedFrom ? `, recorded from ${fullDate(inputs.discard.recordedFrom)}` : ''
      }`,
    })
  }
  if (inputs.language.analysed > 0 && inputs.language.notEnglish + inputs.language.english > 0) {
    const known = inputs.language.notEnglish + inputs.language.english
    out.push({
      label: 'Languages',
      value: `${fmtPct((inputs.language.notEnglish / known) * 100, 0)} not in English`,
      // THE BASIS TRAVELS WITH THE FIGURE (D15). It is a share of the videos
      // whose language we KNOW, not of everything read, and the two differ by
      // however many videos carry no language at all.
      note: `of ${fmtInt(known)} videos whose language is recorded`,
    })
  }
  if (inputs.comparisonsRefused != null) {
    out.push({
      label: 'Refused',
      value: inputs.comparisonsRefused === 1 ? '1 comparison' : `${fmtInt(inputs.comparisonsRefused)} comparisons`,
      note: 'held back rather than drawn — the reasons are under this table',
    })
  }
  return out
}

export interface QuarterChecks {
  /** False where M7 is not applied here — told apart from a quiet quarter. */
  recorded: boolean
  ran: number
  flaggedRuns: number
  flags: FlagRow[]
}

/** Every unusual-week check that ran inside the quarter, and the flags they
 *  raised. Guarded by name: M7 is not applied in production. */
export async function loadQuarterChecks(
  supabase: SupabaseClient,
  clientId: string,
  quarter: Quarter,
): Promise<QuarterChecks> {
  try {
    const checkRes = await supabase
      .from('anomaly_checks')
      .select('run_id, outcome, flagged_count, week_start')
      .eq('client_id', clientId)
      .gte('week_start', quarter.from)
      .lte('week_start', quarter.to)
    if (checkRes.error) throw checkRes.error
    const checks = rows<CheckRow>(checkRes, 'quarterly.checks')
    const flaggedRuns = checks.filter((c) => c.outcome === 'flagged').map((c) => c.run_id)
    if (flaggedRuns.length === 0) return { recorded: true, ran: checks.length, flaggedRuns: 0, flags: [] }
    const flags = await selectAll<FlagRow>(() =>
      supabase
        .from('anomaly_flags')
        .select('object_kind, object_id, label, denominator, week_start, week_end, week_k, week_n, change_pts, band_pts, explanation')
        .eq('client_id', clientId)
        .in('run_id', flaggedRuns)
        .order('week_start', { ascending: true })
        .order('rank', { ascending: true }),
    )
    return { recorded: true, ran: checks.length, flaggedRuns: flaggedRuns.length, flags }
  } catch (error) {
    if (!isMissingAnomalyFlags(error) && !isMissingAnomalyChecks(error)) {
      console.error(`[pages] quarterly.checks: ${(error as { message?: string })?.message ?? String(error)}`)
    }
    return { recorded: false, ran: 0, flaggedRuns: 0, flags: [] }
  }
}

// ---- page 8 · what we could not settle ----------------------------------------

function buildUnsettled(a: {
  verdicts: Verdict[]
  readings: number
  overview: OverviewData
  method: MethodPage
  /** The two pages whose own rows are what a reader is waiting on. */
  subjects: SubjectsPage
  moves: MovesPage
  category: CategoryPage
  /** Whether the quarter's own window read could be taken at all, and whether
   *  the subject half of it could. A comparison never attempted is not a
   *  comparison drawn, and this is the page that has to say which it was. */
  windowApplied: boolean
  subjectsRead: boolean
}): UnsettledPage {
  // `qr.p8.waiting` · THE SUBJECT-LEVEL WAITS, NOT THE OVERVIEW'S SERIES NOTES.
  // The section listed three `MonthLabel`s — clustering changes and unlogged
  // eras, which are facts about our bookkeeping and are already the METHOD
  // page's subject. What a reader of page 8 is waiting on is a named thing:
  // a subject whose quarter column could not be drawn, a move with one reading
  // behind it, a theme the register has marked dormant. The series notes stay,
  // at the end, because they are true — they are simply not the answer to the
  // question this heading asks.
  const waiting: string[] = []
  if (!quarterUnlocked(a.readings)) {
    waiting.push(quarterGateSentence(a.readings))
  }
  for (const row of a.subjects.rows) {
    if (row.categoryQuarter || row.youQuarter) continue
    waiting.push(`${row.label}, quarter on quarter: neither side carried a reading on both sides of this quarter, so no verdict is printed for it.`)
  }
  for (const move of a.moves.moves) {
    if (a.moves.readings.some((r) => r.moveId === move.id && r.verdict)) continue
    waiting.push(`${move.title}, ${move.on} — ${move.line}`)
  }
  for (const q of a.category.quiet ?? []) {
    waiting.push(`${q.label} has not been read since ${q.lastHeard ? monthName(q.lastHeard) : 'the months on this axis'}; a theme is never called dead, only dormant.`)
  }
  for (const note of a.overview.notes.slice(0, 3)) waiting.push(note.text)

  // `qr.p8.heldback` · THE GATE'S SHARE, ON THIS PAGE. The figure is the record
  // page's own (`methodNumbers`' "Held back" row), read off it rather than
  // computed again, so the two pages of one artefact cannot disagree about how
  // much was set aside.
  const heldBack: string[] = []
  const gate = a.method.numbers.find((r) => r.label === 'Held back')
  if (gate) {
    heldBack.push(`${gate.value[0].toUpperCase()}${gate.value.slice(1)} of what the search plan gathered — read, but not counted into a subject (${gate.note}).`)
    // AND WHY THE MOCK'S THREE-ROW SAMPLE IS NOT UNDER IT. M8 withholds
    // `gate_verdicts.reason` from an authenticated reader, so the reasons a
    // sample would carry cannot be selected on a tenant session at all. Saying
    // so is the honest form; a sample with the reasons blanked would read as
    // three videos nobody could explain.
    heldBack.push('What each discarded video was set aside FOR is not readable on this workspace’s own session, so the share is stated and no sample is drawn.')
  }
  if (a.method.checks.recorded && a.method.checks.ran === 0) {
    heldBack.push('No unusual-week check ran inside this quarter, so nothing here rests on one.')
  }
  // WITH THE MONTH IT SETTLES IN. `firstQuarterVerdictMonth` computes exactly
  // this and was called by nothing but its own test — so the last page said
  // "lands once six stand behind it" and named no month, and the reader who
  // wanted to know when had to count on their fingers. It is one reading a
  // month, so the arithmetic is honest and the page says on what assumption.
  const settlesIn = firstQuarterVerdictMonth(a.readings, a.overview.month)
  // WHAT WAS NEVER ASKED. `unsettledItems` reads the verdicts the pages DREW,
  // so where no quarter comparison could be built there is nothing unanswered
  // and the page fell to "Every comparison this quarter asked for was drawn."
  // — the one page whose whole job is confession, contradicting the four
  // before it. The silences are the category page's own: no windowed reading
  // at all is a migration, and a windowed reading with no subject half is a
  // narrower one.
  const notAsked = !a.windowApplied
    ? 'No quarter-on-quarter comparison was attempted. This quarter is not counted as one window for this workspace yet, so nothing below is a reading of the quarter against the one before it.'
    : !a.subjectsRead
      ? 'Your subjects were not compared across this quarter — they are not counted as one window for this workspace yet, so no subject comparison was attempted.'
      : null
  return {
    items: unsettledItems(a.verdicts, { side: audienceSideIn(a.overview) }),
    notAsked,
    waiting,
    heldBack,
    settles: quarterUnlocked(a.readings)
      ? 'Every comparison this quarter could answer is on the pages before this one.'
      : `${quarterGateSentence(a.readings)} The first quarter-on-quarter verdict for your own audience lands once six stand behind it${
          settlesIn ? ` — at one reading a month, with ${monthName(settlesIn)}` : ''
        }.`,
  }
}

/*
 * NO QUOTE HELPERS HERE. The first cut exported `quarterlyQuoteRefs` and
 * `resolveQuarterlyQuotes` and nothing called either: `createSnapshot`
 * (lib/snapshots.ts) freezes every quote's words on the way in and resolves
 * them on the way out, for every artefact on the spine, and the weekly report
 * has no such pair for exactly that reason.
 */
