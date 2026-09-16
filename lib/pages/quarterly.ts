import type { SupabaseClient } from '@supabase/supabase-js'

import { fmtInt, longMonth, monthName } from '../format'
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
  quarterGateSentence,
  quarterLabel,
  quarterOf,
  quarterReadingMonth,
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
}

export interface RivalsPage {
  rows: RivalRow[]
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
  /** "You acted on 2 of 5 this quarter." */
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
  /** The run the reading was taken over, for the snapshot's `run_id`. */
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
}): string {
  const parts: string[] = []
  if (input.lead && isAnswer(input.lead.state)) {
    parts.push(
      `The biggest banded change this quarter is ${input.lead.objectLabel}, at [[lead_share]] of [[lead_of]] videos in ${input.monthLabel}.`,
    )
  } else {
    parts.push(`Nothing on either side cleared its band this quarter by more than the reading can carry.`)
  }
  parts.push(`The category was read across [[quarter_videos]] videos in ${input.quarterLabel}.`)
  parts.push(
    input.unlocked
      ? 'Your own side is compared with the quarter before it on every page that has both sides.'
      : `Your own side is not compared with the quarter before it yet: ${quarterGateSentence(input.readings).slice(0, 1).toLowerCase()}${quarterGateSentence(input.readings).slice(1)}`,
  )
  return parts.join(' ')
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
  /** Which quarter. Defaults to the quarter the reading date falls in. */
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
  const quarter = options.quarter ?? quarterOf(readingAt)
  const prior = previousQuarter(quarter)

  // THE THREE PAGE LOADERS, unchanged, on the horizon whose axis is this
  // quarter's three months. `last_3` is the product's own three-month window
  // and is what a reader gets when they open the page beside this artefact.
  const pageScope = { ...scope, params: { ...scope.params, horizon: 'last_3' } }
  const [overview, market, competitive] = await Promise.all([
    loadOverview(pageScope),
    loadMarketSurface(pageScope).catch(() => null),
    loadCompetitiveSurface(pageScope).catch(() => null),
  ])
  if (!overview) return null

  const readings = overview.bar.readings
  const unlocked = quarterUnlocked(readings)
  const gate = quarterGateSentence(readings)
  const monthLabel = longMonth(overview.month)

  // THE WINDOW PAIR. One read per side, over DISTINCT videos — never three
  // month rows added together.
  const reading = scope.reading?.client ?? readingClient()
  const clientId = scope.clientId
  const [thisQuarter, lastQuarter] = await Promise.all([
    windowFor(reading, clientId, quarter),
    windowFor(reading, clientId, prior),
  ])

  const quarterVerdicts = buildQuarterVerdicts({ quarter, prior, thisQuarter, lastQuarter, readings, overview })
  const windowApplied = thisQuarter.denominators != null

  const cover = buildCover({ overview, quarter, prior, readingAt, readings, thisQuarter })
  const subjects = buildSubjects({ overview, quarterVerdicts, unlocked, gate, monthLabel, windowApplied })
  const category = buildCategory({ overview, quarterVerdicts, monthLabel, windowApplied })
  const rivals = buildRivals({ overview, competitive })
  const moves = buildMoves({ overview, market, quarter })

  // Everything the pages may speak from, in one list: the interpretation
  // argues from it, the last page lists what it could not settle, and the
  // method page counts what it refused. One source, three readers.
  const verdicts = [
    ...overview.sentence.verdicts,
    ...quarterVerdicts,
  ]
  const method = await buildMethod({ supabase, reading, clientId, quarter, readingAt, verdicts, overview })
  const read = await buildRead({ supabase, overview, market, verdicts, unlocked, cover, options })
  const unsettled = buildUnsettled({ verdicts, quarter, readings, overview, method })

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
 *  `window_denominators` is `>= from and < to` (lib/reading/record.ts). */
async function windowFor(client: SupabaseClient, clientId: string, quarter: Quarter): Promise<WindowReading> {
  const { from, to } = halfOpenInstants({ kind: 'quarter', from: quarter.from, to: quarter.to })
  return loadWindowReading(client, clientId, { from, to })
}

/** The quarter-on-quarter verdicts, one per audience read on both sides. */
function buildQuarterVerdicts(a: {
  quarter: Quarter
  prior: Quarter
  thisQuarter: WindowReading
  lastQuarter: WindowReading
  readings: number
  overview: OverviewData
}): Verdict[] {
  const now = a.thisQuarter.denominators
  const before = a.lastQuarter.denominators
  if (!now || !before) return []
  const priorByAudience = new Map(before.map((d) => [d.audience, d]))
  const out: Verdict[] = []
  for (const d of now) {
    const was = priorByAudience.get(d.audience)
    if (!was) continue
    out.push(
      quarterChange({
        object: { kind: 'audience', id: d.audience, label: audienceName(d.audience, a.overview) },
        audience: d.audience,
        window: { kind: 'quarter', from: a.quarter.from, to: a.quarter.to },
        basis: { from: a.prior.from, to: a.prior.to },
        value: { k: d.videos, n: d.videos },
        baseline: { k: was.videos, n: was.videos },
        readings: a.readings,
      }),
    )
  }
  // The theme side, where the window read carried numerators.
  const themesNow = a.thisQuarter.themes ?? []
  const themesBefore = new Map((a.lastQuarter.themes ?? []).map((t) => [`${t.audience}:${t.theme_id}`, t]))
  const denomNow = new Map(now.map((d) => [d.audience, d.videos]))
  const denomBefore = new Map(before.map((d) => [d.audience, d.videos]))
  for (const t of themesNow) {
    const was = themesBefore.get(`${t.audience}:${t.theme_id}`)
    const n = denomNow.get(t.audience)
    const priorN = denomBefore.get(t.audience)
    if (!was || !n || !priorN) continue
    out.push(
      quarterChange({
        // THE WINDOW READ CARRIES NO LABEL — `window_theme_readings` answers
        // in registry ids, and a label is the registry's. The month series the
        // pages already loaded holds the labels, so the id is looked up there
        // and falls back to itself rather than to a blank.
        object: { kind: 'theme', id: t.theme_id, label: themeLabel(t.theme_id, a.overview) },
        audience: t.audience,
        window: { kind: 'quarter', from: a.quarter.from, to: a.quarter.to },
        basis: { from: a.prior.from, to: a.prior.to },
        value: { k: t.videos, n },
        baseline: { k: was.videos, n: priorN },
        readings: a.readings,
      }),
    )
  }
  return out
}

/** A registry id's label, off the month series the pages already loaded. The
 *  window read answers in ids alone. */
function themeLabel(id: string, overview: OverviewData): string {
  const mover = [...overview.category.growing, ...overview.category.fading].find((m) => m.id === id)
  return mover?.label ?? id
}

function audienceName(audience: string, overview: OverviewData): string {
  if (audience === overview.category.audience) return overview.category.label
  const rival = overview.rivals.rows.find((r) => r.audience === audience)
  return rival?.label ?? audience
}

// ---- page 1 · the cover -------------------------------------------------------

function buildCover(a: {
  overview: OverviewData
  quarter: Quarter
  prior: Quarter
  readingAt: string
  readings: number
  thisQuarter: WindowReading
}): CoverPage {
  const { overview } = a
  const lead = overview.sentence.lead
  const quarterVideos = a.thisQuarter.denominators
    ? a.thisQuarter.denominators.reduce((sum, d) => sum + d.videos, 0)
    : null

  const figures: ReadingFigures = { ...overview.sentence.figures }
  if (lead && isAnswer(lead.state) && lead.value.n > 0) {
    figures.lead_share = { value: Math.round((lead.value.k / lead.value.n) * 1000) / 10, unit: 'pct', label: `${lead.objectLabel}, this month` }
    figures.lead_of = { value: lead.value.n, unit: 'videos', label: 'videos it is a share of' }
  }
  if (quarterVideos != null) {
    figures.quarter_videos = { value: quarterVideos, unit: 'videos', label: `videos read in ${quarterLabel(a.quarter, false)}` }
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

  const platforms = overview.record.lines.find((l) => /TikTok|YouTube|Instagram|Reddit/.test(l)) ?? ''
  return {
    body: coverBody({
      lead,
      monthLabel: longMonth(overview.month),
      quarterLabel: quarterLabel(a.quarter, false),
      unlocked: quarterUnlocked(a.readings),
      readings: a.readings,
    }),
    figures,
    stats,
    stamp: [
      `as at ${monthName(quarterReadingMonth(a.quarter, a.readingAt))}`,
      overview.monthStatus === 'filling' ? `${longMonth(overview.month)} still filling` : null,
      readingCounter(a.readings),
    ]
      .filter(Boolean)
      .join(' · '),
    corpus: platforms || overview.record.line,
  }
}

// ---- page 2 · our read --------------------------------------------------------

async function buildRead(a: {
  supabase: SupabaseClient
  overview: OverviewData
  market: MarketSurfaceData | null
  verdicts: Verdict[]
  unlocked: boolean
  cover: CoverPage
  options: QuarterlyOptions
}): Promise<ReadPage> {
  const quotes = a.overview.sentence.voices.map((v: Voice) => ({ quote: v.quote, cite: v.cite }))
  const interpretation = composeInterpretation(
    'interpretation_quarterly',
    a.verdicts,
    proseFigures(a.cover.figures),
    quotes.map((q) => ({ ref: q.quote.ref, context: q.cite })),
    { draft: a.options.draft ?? null },
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
  windowApplied: boolean
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
    youQuarter: byObject.get(`subject:${row.id}:${a.overview.rivals.rows[0]?.audience ?? ''}`) ?? null,
    categoryQuarter: byObject.get(`subject:${row.id}:${a.overview.category.audience}`) ?? null,
  }))
  return {
    rows,
    monthLabel: a.monthLabel,
    note: block.note,
    notRecorded: block.state === 'not_recorded' ? 'Subjects are not recorded for this workspace yet, so there is no quarter-on-quarter table to draw.' : null,
    gate: a.unlocked ? null : a.gate,
    setLine: null,
  }
}

// ---- page 4 · what the category talked about ----------------------------------

function buildCategory(a: {
  overview: OverviewData
  quarterVerdicts: Verdict[]
  monthLabel: string
  windowApplied: boolean
}): CategoryPage {
  const c = a.overview.category
  const prevMonthLabel = longMonth(previousMonthOf(a.overview.month))
  return {
    audience: c.audience,
    label: c.label,
    denominator: c.denominator,
    monthLabel: a.monthLabel,
    // THE MOCK'S OWN SENTENCE. Movers and the kind mix are a MONTH against the
    // month before it, and a quarterly review that let a reader think they were
    // quarter figures would be the whole point of this package missed.
    basis: `Movers and the mix are ${a.monthLabel} against ${prevMonthLabel}.`,
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
    quarter: a.quarterVerdicts.filter((v) => v.audience === c.audience),
    quarterNote: a.windowApplied ? null : 'The quarter-on-quarter reading is not recorded for this workspace yet, so only the month is compared.',
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
  const acted = advice.filter((r) => inQuarter(r.decidedAt?.slice(0, 10) ?? null)).length
  return {
    moves,
    movesNote: m ? (m.moves.recorded ? m.moves.empty : 'Moves are not recorded for this workspace yet.') : 'Moves could not be read for this workspace.',
    advice,
    actedLine:
      advice.length === 0
        ? 'No advice stands on this workspace yet.'
        : `You acted on ${fmtInt(acted)} of ${fmtInt(advice.length)} this quarter.`,
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

interface FlagRow {
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

async function buildMethod(a: {
  supabase: SupabaseClient
  reading: SupabaseClient
  clientId: string
  quarter: Quarter
  readingAt: string
  verdicts: Verdict[]
  overview: OverviewData
}): Promise<MethodPage> {
  const window: RecordWindow = { kind: 'quarter', from: a.quarter.from, to: a.quarter.to }
  const refused: Refusal[] = refusals(a.verdicts)
  const [inputs, checks] = await Promise.all([
    loadRecordInputs(a.reading, a.clientId, window, {
      now: a.readingAt,
      refusals: refused,
      comparisonsRefused: refused.length,
      gate: 'tenant',
    }).catch(() => null),
    loadQuarterChecks(a.supabase, a.clientId, a.quarter),
  ])

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
    line: inputs ? howSoundLine(inputs) : a.overview.record.line,
    lines: inputs ? recordLines(inputs) : a.overview.record.lines,
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
    numbers: methodNumbers(inputs, a.quarter, a.overview),
    unit: 'A video with an analysed comment written in the month.',
    href: '/dashboard/settings/record',
    refusedLine: refused.length ? refusedSentence(refused) : null,
  }
}

/** The corpus in numbers, as the mock's own table. Every row carries what it
 *  is out of, or says it was not recorded. */
export function methodNumbers(inputs: RecordInputs | null, quarter: Quarter, overview: OverviewData): { label: string; value: string; note?: string }[] {
  const out: { label: string; value: string; note?: string }[] = [
    { label: 'Period', value: `${quarter.from} – ${quarter.to}`, note: overview.monthStatus === 'filling' ? 'still filling' : undefined },
  ]
  if (!inputs) {
    out.push({ label: 'The corpus', value: 'not recorded', note: 'the quarter’s record could not be read for this workspace' })
    return out
  }
  // `coverage` is NULL when the month tables are not applied and EMPTY when
  // the tenant has never been read — two different silences, and neither is a
  // zero (lib/reading/record.ts).
  if (!inputs.coverage) {
    out.push({ label: 'The corpus', value: 'not recorded', note: 'the comment-dated month tables are not applied for this workspace' })
    return out
  }
  const videos = inputs.coverage.reduce((sum, c) => sum + c.videos, 0)
  const comments = inputs.coverage.reduce((sum, c) => sum + c.comments, 0)
  out.push({ label: 'Videos', value: fmtInt(videos), note: 'distinct videos with an analysed comment in the quarter' })
  out.push({ label: 'Conversations', value: fmtInt(comments), note: 'comments read across them' })
  out.push({
    label: 'Updates',
    value: `${fmtInt(inputs.delivery.delivered)} this quarter`,
    note: inputs.delivery.longestGapDays != null ? `longest gap ${fmtInt(inputs.delivery.longestGapDays)} days` : undefined,
  })
  return out
}

/** Every unusual-week check that ran inside the quarter, and the flags they
 *  raised. Guarded by name: M7 is not applied in production. */
async function loadQuarterChecks(
  supabase: SupabaseClient,
  clientId: string,
  quarter: Quarter,
): Promise<{ recorded: boolean; ran: number; flaggedRuns: number; flags: FlagRow[] }> {
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
  quarter: Quarter
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
