import type { SupabaseClient } from '@supabase/supabase-js'

import { fmtInt, fullDate, longMonth } from '../format'
import { quoteRef } from '../renderables/quotes-freeze'
import type { Quote, Scope } from '../renderables/types'
import { fetchQuoteResolutionsByRefs } from '../quotes'
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
import { loadWindowReading, readingClient, type WindowReading } from '../reading/read'
import { isAnswer, type FigureTable as ReadingFigures, type Verdict } from '../reading/verdicts'
import { proseFigures } from '../prose/figures'
import type { MonthStatus } from '../reading/types'
import { composeInterpretation, type Interpretation } from '../prose/interpret'
import {
  previousQuarter,
  quarterFilling,
  quarterGateSentence,
  quarterLabel,
  quarterToReview,
  quarterUnlocked,
  quarterlyPeriod,
  type Quarter,
} from '../reports/quarterly'
import { rows } from './read'
import {
  isMissingAnomalyFlags,
  loadOverview,
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
import { loadCompetitiveSurface, type CompetitiveSurfaceData, type QuestionRow, type StandingsBlock } from './competitive-surface'
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
  /** What the number is, in the reader's words. */
  label: string
  /** The evidence under it — the denominator, the band, the panel. */
  caption: string
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
  title: string
  /** "first raised in July" / "new in September". */
  age: string
  /** Grounded in N videos — a figure with its denominator named in `of`. */
  videos: number | null
  status: string
  decidedAt: string | null
  href: string
}

export interface ReadPage {
  interpretation: Interpretation
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

export interface SubjectQuarterRow {
  id: string
  label: string
  /** The month columns — the tenant's own audience and the category's. */
  you: { k: number; n: number; pct: number | null } | null
  category: { k: number; n: number; pct: number | null } | null
  /** The quarter columns. `baseline_forming` below six readings. */
  youQuarter: Verdict | null
  categoryQuarter: Verdict | null
}

export interface SubjectsPage {
  rows: SubjectQuarterRow[]
  monthLabel: string
  /** The line under the table about which column carries what. */
  note: string | null
  /** Said instead of the table when `subjects` (M4) is not applied here. */
  notRecorded: string | null
  /** The gate, when the quarter columns cannot be drawn yet. */
  gate: string | null
  /** Why the two quarter columns are empty, when they are. Null once a row
   *  carries one. */
  quarterNote: string | null
  setLine: string | null
}

export interface CategoryPage {
  audience: string
  label: string
  denominator: number | null
  monthLabel: string
  /** "Movers and mix are September against August." */
  basis: string
  growing: Mover[]
  fading: Mover[]
  moversNote: string | null
  kinds: CategoryBlock['kinds']
  kindVerdicts: CategoryBlock['kindVerdicts']
  kindsNote: string | null
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
}

export interface QuarterFlag {
  label: string
  objectKind: string
  weekStart: string
  weekEnd: string
  k: number
  n: number
  changePts: number
  bandPts: number
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
  checks: { ran: number; flagged: number; quiet: number; recorded: boolean }
  flags: QuarterFlag[]
  flagsNote: string | null
  /** The corpus in numbers, row by row. */
  numbers: { label: string; value: string; note?: string }[]
  unit: string
  href: string
  /** The comparisons this artefact asked for and did not draw, and why —
   *  printed, not promised (lib/reading/record.ts `refusedSentence`). */
  refusedLine: string | null
}

export interface UnsettledItem {
  title: string
  /** The badge: "too few to compare", "band ±6.8", "comparison refused". */
  why: string
  body: string
}

export interface UnsettledPage {
  items: UnsettledItem[]
  waiting: string[]
  heldBack: string[]
  /** When the first quarter-on-quarter verdict lands, in the reader's words. */
  settles: string
  changeLog: string[]
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
  const suffix = ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'
  return `${n}${n % 10 <= 3 ? suffix : 'th'}`
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

/** What a flag turned out to be, said in one clause. */
export function flagOutcome(flag: { label: string }, later: readonly Verdict[]): string {
  const match = later.find((v) => v.objectLabel.toLowerCase() === flag.label.toLowerCase())
  if (!match) return 'no later reading of the same object has been taken'
  if (match.state === 'moved') return `the month's own reading agreed — it cleared its band`
  if (match.state === 'no_clear_change') return `the month's own reading did not agree — inside the band`
  if (match.state === 'too_little_data') return 'the month it fell in read on too little to settle it'
  if (match.state === 'refused') return 'the month it fell in could not be compared'
  return 'the month it fell in has no baseline behind it yet'
}

/** The still-unsettled items, off the verdicts the pages drew. One per object,
 *  worst first, so the last page is a list and not a transcript. */
export function unsettledItems(verdicts: readonly Verdict[], limit = 4): UnsettledItem[] {
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
      title: `Whether ${v.objectLabel} moved${v.audience ? '' : ''}`,
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
  const themeIds = [...overview.category.growing, ...overview.category.fading].map((m) => m.id)

  // THE WINDOW PAIR. One read per side, over DISTINCT videos — never three
  // month rows added together.
  const reading = scope.reading?.client ?? readingClient()
  const themeOptions = { runId: themedRunId, objectIds: themeIds.length ? themeIds : undefined }
  const [thisQuarter, lastQuarter, subjectsNow, subjectsBefore, checks, record] = await Promise.all([
    quarterWindowFor(reading, clientId, quarter, themeOptions),
    quarterWindowFor(reading, clientId, prior, themeOptions),
    subjectWindowFor(reading, clientId, quarter),
    subjectWindowFor(reading, clientId, prior),
    loadQuarterChecks(supabase, clientId, quarter),
    loadRecordInputs(reading, clientId, { kind: 'quarter', from: quarter.from, to: quarter.to }, {
      now: readingAt,
      gate: 'tenant',
    }).catch(() => null),
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
    draft: options.draft ?? null,
  })
}

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
  const subjectsRead = windowApplied && a.subjectsNow != null && a.subjectsBefore != null
  // The month the month-level pages are of is the month the PRODUCT is in, and
  // on a review of a closed quarter that is a month outside it. Every page that
  // prints a month figure says so rather than letting a Q3 masthead speak for
  // a November reading.
  const monthOutside = overview.month < quarter.from || overview.month > quarter.to

  const cover = buildCover({ overview, quarter, readingAt, readings, thisQuarter: a.thisQuarter })
  const subjects = buildSubjects({ overview, quarterVerdicts, unlocked, gate, monthLabel, subjectsRead })
  const category = buildCategory({
    overview,
    quarterVerdicts,
    monthLabel,
    windowApplied,
    themesRead,
    monthOutside,
    thisQuarter: a.thisQuarter,
    lastQuarter: a.lastQuarter,
  })
  const rivals = buildRivals({ overview, competitive: a.competitive })
  const moves = buildMoves({ overview, market: a.market, quarter })

  // Everything the pages may speak from, in one list: the interpretation
  // argues from it, the last page lists what it could not settle, and the
  // method page counts what it refused. One source, three readers.
  const verdicts = [...overview.sentence.verdicts, ...quarterVerdicts]
  const method = buildMethod({ quarter, verdicts, overview, record: a.record, checks: a.checks, readingAt })
  const read = buildRead({ overview, market: a.market, verdicts, quarterVerdicts, unlocked, cover, draft: a.draft ?? null })
  const unsettled = buildUnsettled({ verdicts, readings, overview, method })

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
  readingAt: string
  readings: number
  thisQuarter: WindowReading
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

  const stats: CoverStat[] = []
  if (lead && isAnswer(lead.state) && lead.value.n > 0) {
    stats.push({
      token: 'lead_share',
      value: pct1((lead.value.k / lead.value.n) * 100),
      label: `${lead.objectLabel} in ${longMonth(overview.month)}`,
      caption: `${fmtInt(lead.value.k)} of ${fmtInt(lead.value.n)} videos${lead.bandPts != null ? ` · band ±${Math.round(lead.bandPts * 10) / 10}` : ''}`,
    })
  }
  if (overview.bar.videos != null) {
    stats.push({
      token: 'month_videos',
      value: fmtInt(overview.bar.videos),
      label: `videos in ${longMonth(overview.month)}`,
      caption: overview.bar.line,
    })
  }
  stats.push({
    token: 'readings',
    value: String(a.readings),
    label: 'monthly readings behind your own side',
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
    stats,
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
    title: row.title,
    age:
      row.monthsRepeated > 1
        ? `first raised ${longMonth(`${row.firstMade.slice(0, 7)}-01`)} · ${row.monthsRepeated} months`
        : `new in ${longMonth(`${row.firstMade.slice(0, 7)}-01`)}`,
    videos: null,
    status: row.statusLabel,
    decidedAt: row.decidedAt,
    href: `/dashboard/market?advice=${encodeURIComponent(row.lineageId)}`,
  }))
  return {
    interpretation,
    figures: a.cover.figures,
    verdicts: a.verdicts,
    quotes,
    advice,
    adviceNote: a.market ? a.market.advice.empty : 'The advice ledger could not be read for this workspace.',
    confidence: confidenceOf(a.verdicts, a.unlocked),
    counted: countedLines(a.verdicts),
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
  subjectsRead: boolean
}): SubjectsPage {
  const block = a.overview.subjects
  const byObject = new Map(a.quarterVerdicts.map((v) => [`${v.objectKind}:${v.objectId}:${v.audience}`, v]))
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
    youQuarter: byObject.get(`subject:${row.id}:${CLIENT_AUDIENCE}`) ?? null,
    categoryQuarter: byObject.get(`subject:${row.id}:${a.overview.category.audience}`) ?? null,
  }))
  const drawn = rows.some((r) => r.youQuarter || r.categoryQuarter)
  return {
    rows,
    monthLabel: a.monthLabel,
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
    setLine: null,
  }
}

// ---- page 4 · what the category talked about ----------------------------------

function buildCategory(a: {
  overview: OverviewData
  quarterVerdicts: Verdict[]
  monthLabel: string
  windowApplied: boolean
  themesRead: boolean
  monthOutside: boolean
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
      a.monthOutside ? ` ${a.monthLabel} is outside this quarter — it is the month the product is in now.` : ''
    }`,
    growing: c.growing,
    fading: c.fading,
    moversNote: c.moversNote,
    kinds: c.kinds,
    kindVerdicts: c.kindVerdicts,
    kindsNote: c.kindsNote,
    attention: c.attention,
    attentionNote: c.attentionNote,
    mood: c.mood,
    moodNote: c.moodNote,
    quarter,
    // THREE SILENCES, AND THEY ARE NOT THE SAME CLAIM. No windowed reading at
    // all is a migration that has not been applied; a windowed reading with no
    // clustering behind it is an update that has not themed; and a pair of
    // reads that produced no comparable row is a measurement.
    quarterNote: !a.windowApplied
      ? 'The quarter-on-quarter reading is not recorded for this workspace yet, so only the month is compared.'
      : !a.themesRead
        ? 'No clustering of this quarter could be read, so what the category talked about is compared month on month only.'
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

function buildRivals(a: { overview: OverviewData; competitive: CompetitiveSurfaceData | null }): RivalsPage {
  const co = a.competitive
  return {
    rows: a.overview.rivals.rows,
    recorded: a.overview.rivals.recorded,
    months: co?.standings.months ?? [],
    standings: co?.standings ?? null,
    standingsNote: co ? co.standings.empty : 'The standings could not be read for this workspace.',
    questions: co?.questions.rows.slice(0, 6) ?? [],
    questionsLine: co
      ? `${fmtInt(co.questions.videos)} rival videos in this window carried a question, over ${fmtInt(co.questions.insights)} readings.`
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
  return {
    moves,
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
    claimsCaveat: m?.ways.claimsCaveat ?? '',
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
    objectKind: f.object_kind,
    weekStart: f.week_start,
    weekEnd: f.week_end,
    k: f.week_k,
    n: f.week_n,
    changePts: Number(f.change_pts),
    bandPts: Number(f.band_pts),
    denominator: f.denominator,
    outcome: flagOutcome(f, a.verdicts),
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
      quiet: Math.max(0, checks.ran - checks.flaggedRuns),
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
    href: '/dashboard/settings/record',
    refusedLine: refused.length ? refusedSentence(refused) : null,
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
    { label: 'Period', value: `${quarter.from} – ${quarter.to}`, note: quarterFilling(quarter, readingAt) ? 'still filling' : undefined },
  ]
  if (!inputs) {
    out.push({ label: 'The corpus', value: 'not recorded', note: 'the quarter’s record could not be read for this workspace' })
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
        .select('object_kind, label, denominator, week_start, week_end, week_k, week_n, change_pts, band_pts, explanation')
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
}): UnsettledPage {
  const waiting: string[] = []
  if (!quarterUnlocked(a.readings)) {
    waiting.push(quarterGateSentence(a.readings))
  }
  for (const note of a.overview.notes.slice(0, 3)) waiting.push(note.text)
  const heldBack: string[] = []
  if (a.method.checks.recorded && a.method.checks.ran === 0) {
    heldBack.push('No unusual-week check ran inside this quarter, so nothing here rests on one.')
  }
  return {
    items: unsettledItems(a.verdicts),
    waiting,
    heldBack,
    settles: quarterUnlocked(a.readings)
      ? 'Every comparison this quarter could answer is on the pages before this one.'
      : `${quarterGateSentence(a.readings)} The first quarter-on-quarter verdict for your own audience lands once six stand behind it.`,
    changeLog: a.overview.notes.map((n) => n.text).slice(0, 4),
  }
}

/** The refs this artefact shows, so a snapshot can freeze ids and resolve the
 *  words at render (lib/renderables/quotes-freeze.ts). */
export function quarterlyQuoteRefs(data: QuarterlyData): string[] {
  return [...new Set(data.read.quotes.map((q) => q.quote.ref).filter(Boolean))]
}

/** Resolve a stored artefact's quote refs back to words. Never stored: a
 *  snapshot holds ids and numbers, and a third party's sentence resolves live
 *  so an erasure reaches it. */
export async function resolveQuarterlyQuotes(supabase: SupabaseClient, refs: readonly string[]): Promise<Map<string, Quote>> {
  if (!refs.length) return new Map()
  const resolved = await fetchQuoteResolutionsByRefs(supabase, [...refs], { onReadError: 'degrade' })
  const out = new Map<string, Quote>()
  for (const [ref, one] of resolved) out.set(ref, { ref, text: one.text, lang: one.lang ?? null, english: one.english ?? null })
  return out
}

export { quoteRef }
