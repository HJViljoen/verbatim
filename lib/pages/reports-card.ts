import type { SupabaseClient } from '@supabase/supabase-js'

import { fmtInt, longMonth } from '../format'
import { SHARE_BAND } from '../report-bands'
import { quarterChange } from '../reading/bands'
import { loadMonthSeries, loadWindowReading, type WindowReading } from '../reading/read'
import { isMissingMonthlyReading, monthStartOf } from '../reading/monthly'
import type { DenominatorPoint } from '../reading/series'
import type { Counted, Verdict } from '../reading/verdicts'
import { readSubjectWindow } from '../subjects/read'
import { isMissingSubjects, type SubjectWindowReading } from '../subjects/types'
import { loadActiveSubjects } from '../subjects/membership'
import { INDUSTRY_AUDIENCE } from '../rivals'
import type { Scope } from '../renderables/types'
import {
  firstQuarterVerdictMonth,
  previousQuarter,
  QUARTER_READINGS_NEEDED,
  quarterGateSentence,
  quarterLabel,
  quarterToReview,
  type Quarter,
} from '../reports/quarterly'

/**
 * The quarterly card on /dashboard/reports (Block D wave 1, package D7;
 * `reports.quarterly.*` in status/mock-gap.md §4).
 *
 * THE ARTEFACT EXISTS AND THE CARD DOES NOT. `lib/pages/quarterly.ts` builds
 * eight pages of quarter-on-quarter reading and `grep -rni quarter
 * app/dashboard/` returns four hits, all comments and schedule branches. So a
 * workspace that has one cannot see that it has one. This is the card: the
 * quarter under review, one banded row per subject, the bars behind them, the
 * gate sentence and the caveat — and nothing else, because a card is not the
 * artefact.
 *
 * FIVE RULES IT IS BUILT UNDER, ALL OF THEM ALREADY THE PRODUCT'S:
 *
 *  · A quarter is NOT three months added up. Both sides come off
 *    `window_denominators` / `window_subject_readings` (M3, M4), which count
 *    DISTINCT videos over a window; summing month rows overstates by up to
 *    +38.7% over twelve months on live data.
 *  · Below six monthly readings `quarterChange` answers `baseline_forming`,
 *    and every row on this card then reads "not enough months yet" — which is
 *    deviation D12's ruling, kept.
 *  · NO CALENDAR DATE IS EVER PROMISED. The mock's card says "Ready 1 Oct".
 *    The scheduler fires the quarterly on the first UPDATE of a new calendar
 *    quarter, not on a date, so `ready` is `null` and stays `null`; a date here
 *    would be a claim about a cadence nothing guarantees.
 *  · Every level carries its "of N" — the rows are `Verdict`s, which carry
 *    both sides' k and n by construction.
 *  · Where M3 or M4 is not applied the card DEGRADES in words, the `isMissing*`
 *    precedent, and never prints a zero for a thing nobody counted.
 */

export interface QuarterlyCard {
  quarter: { from: string; to: string; label: string }
  /** One row per subject, each a quarter-on-quarter Verdict. */
  rows: { label: string; verdict: Verdict }[]
  /** The bars' series, from the WINDOW tables — never a sum of month rows. */
  series: { label: string; value: Counted }[]
  readings: number
  /** `quarterGateSentence(readings)` — "your 3rd monthly reading · the quarter
   *  view needs 6". */
  gate: string
  /** The "Q2 read at setup / April below the floor" caveat, when it applies. */
  note: string | null
  /** Below the gate, the one line that stands in for the rows: when the first
   *  quarter-on-quarter comparison lands, as a reading MONTH (never a day —
   *  see `ready`). Null once the gate is open. */
  firstComparison: string | null
  href: string
  /** Never a promised date. */
  ready: null
}

/** What the pure half is handed. Every field is something a caller read; none
 *  of it is derived twice. */
export interface QuarterlyCardInput {
  quarter: Quarter
  prior: Quarter
  /** Active subjects, id → the name the client confirmed. A PROPOSED subject
   *  measures nothing and is not here (`loadActiveSubjects` filters on
   *  `status = 'active'`). */
  subjects: readonly { id: string; name: string }[]
  thisQuarter: WindowReading
  lastQuarter: WindowReading
  subjectsNow: SubjectWindowReading[] | null
  subjectsBefore: SubjectWindowReading[] | null
  /** Months in the quarter that carried a denominator row at all, with the
   *  videos behind each — what the caveat is computed from. */
  monthsInQuarter: readonly { month: string; videos: number | null; backRead: boolean }[]
  /** Monthly readings behind the tenant, on Overview's own rule: months of the
   *  GATHERED era carrying a denominator row. */
  readings: number
  /** The month the card is read in (`monthStartOf(readingAt)`) — what
   *  `firstQuarterVerdictMonth` counts forward from. */
  readingMonth?: string | null
  href?: string
}

/** Which audience the card's rows are read on. The CATEGORY: it is the only
 *  side with the n to carry a banded quarter comparison on today's corpus, and
 *  a card that drew the tenant's own side would print six refusals. The
 *  artefact itself still prints both columns. */
const CARD_AUDIENCE = INDUSTRY_AUDIENCE

/**
 * The card, from counts alone.
 *
 * Null where there is no quarter to advertise — no subject named, or the
 * window pair could not be read at all. A card that renders an empty frame on
 * the Reports page is worse than no card: it tells a reader the artefact is
 * empty when what is true is that we have not read it.
 */
export function buildQuarterlyCard(input: QuarterlyCardInput): QuarterlyCard | null {
  const now = input.thisQuarter.denominators
  const before = input.lastQuarter.denominators
  if (input.subjects.length === 0) return null

  const gate = quarterGateSentence(input.readings)
  const href = input.href ?? '/dashboard/reports?kind=quarterly'
  const base = {
    quarter: { from: input.quarter.from, to: input.quarter.to, label: quarterLabel(input.quarter, false) },
    readings: input.readings,
    gate,
    href,
    ready: null as null,
  }

  // M3 UNAPPLIED IS NOT AN EMPTY QUARTER. The window pair answers null when
  // the functions are not there; the card then carries its rows as
  // `baseline_forming` with no counts rather than pretending a reading of zero.
  if (!now || !before) {
    return {
      ...base,
      rows: [],
      series: [],
      note: 'The quarter-on-quarter reading is not recorded for this workspace yet, so there is nothing to compare across it.',
      firstComparison: null,
    }
  }

  const denomNow = new Map(now.map((d) => [d.audience, d.videos]))
  const denomBefore = new Map(before.map((d) => [d.audience, d.videos]))
  const nowBySubject = new Map((input.subjectsNow ?? []).map((s) => [`${s.audience}:${s.subject_id}`, s]))
  const beforeBySubject = new Map((input.subjectsBefore ?? []).map((s) => [`${s.audience}:${s.subject_id}`, s]))

  // A MISSING ROW IS A ZERO, NOT AN ABSENCE — once the side was read at all.
  // `window_subject_readings` groups over the videos a subject's members cite,
  // so a subject no category video mentioned in a window has NO ROW rather
  // than a row of 0. The first cut read "no row" as "not read" and dropped the
  // subject, and on Sealand (Q2 2026 against a Q1 of seven category videos)
  // that kept Price, the one subject any of those seven mentioned, and dropped
  // the other six without a word. Where the subject side was not read at all
  // (`subjectsNow`/`subjectsBefore` null — M4 unapplied) there is still no row,
  // and the note says so; and a side with no denominator still has no share.
  const subjectsRead = input.subjectsNow != null && input.subjectsBefore != null
  const n = denomNow.get(CARD_AUDIENCE)
  const priorN = denomBefore.get(CARD_AUDIENCE)
  const rows: { label: string; verdict: Verdict }[] = []
  const series: { label: string; value: Counted }[] = []
  for (const subject of input.subjects) {
    if (!subjectsRead || !n || !priorN) continue
    const value = { videos: nowBySubject.get(`${CARD_AUDIENCE}:${subject.id}`)?.videos ?? 0 }
    const baseline = { videos: beforeBySubject.get(`${CARD_AUDIENCE}:${subject.id}`)?.videos ?? 0 }
    rows.push({
      label: subject.name,
      verdict: quarterChange({
        object: { kind: 'subject', id: subject.id, label: subject.name },
        audience: CARD_AUDIENCE,
        window: { kind: 'quarter', from: input.quarter.from, to: input.quarter.to },
        basis: { from: input.prior.from, to: input.prior.to },
        value: { k: value.videos, n },
        baseline: { k: baseline.videos, n: priorN },
        readings: input.readings,
      }),
    })
    // THE BARS ARE THE LEVEL, NOT THE CHANGE, and they carry the same n the
    // verdict divides by — so a bar and the badge beside it cannot be read off
    // two different denominators.
    series.push({ label: subject.name, value: { k: value.videos, n } })
  }

  return {
    ...base,
    rows,
    series,
    note: quarterCaveat(input.monthsInQuarter, rows.length === 0, !subjectsRead),
    firstComparison: firstComparisonLine(input.readings, input.readingMonth ?? null),
  }
}

/**
 * The card's whole body below the gate (Heinrich's three-month-user test):
 * every row there reads "not enough months yet", so the rows say nothing a
 * single line cannot, and the line says the one thing a reader wants — when.
 *
 * A MONTH, NOT A DATE. It is the artefact's own arithmetic
 * (`firstQuarterVerdictMonth`, one reading a month), the same the quarterly's
 * last page prints; the quarterly itself still fires on an update, not a day.
 */
export function firstComparisonLine(readings: number, readingMonth: string | null): string | null {
  if (readings >= QUARTER_READINGS_NEEDED) return null
  const month = firstQuarterVerdictMonth(readings, readingMonth)
  const have = `it needs six monthly readings and you have ${readings}`
  return month
    ? `The first quarter-on-quarter comparison arrives with the ${monthWithYear(month)} reading: ${have}.`
    : `The first quarter-on-quarter comparison arrives once six monthly readings stand behind it: you have ${readings}.`
}

/**
 * The mock's "Q2 read at setup · April below the floor" line, measured rather
 * than written.
 *
 * TWO DIFFERENT FACTS ABOUT A MONTH AND THE CARD SAYS BOTH. A month before the
 * tenant's first update was READ BACK at setup — it is history, not something
 * we gathered — and a month whose denominator is under `SHARE_BAND.minN`
 * carries too little to band. A quarter holding either is a quarter whose
 * comparison a reader should discount, and neither fact is visible from the
 * verdict alone.
 */
export function quarterCaveat(
  months: readonly { month: string; videos: number | null; backRead: boolean }[],
  noRows: boolean,
  subjectsUnread: boolean,
): string | null {
  const parts: string[] = []
  const backRead = months.filter((m) => m.backRead).map((m) => monthWithYear(m.month))
  const thin = months.filter((m) => !m.backRead && m.videos != null && m.videos < SHARE_BAND.minN).map((m) => monthWithYear(m.month))
  if (backRead.length > 0) parts.push(`${list(backRead)} ${backRead.length === 1 ? 'was' : 'were'} read back at setup rather than gathered`)
  if (thin.length > 0) parts.push(`${list(thin)} carried under ${fmtInt(SHARE_BAND.minN)} videos`)
  if (subjectsUnread) parts.push('your subjects are not counted as one window for this workspace yet')
  else if (noRows) parts.push('no subject carried a reading on both sides of this quarter')
  if (parts.length === 0) return null
  return `${capitalise(parts[0])}${parts.length > 1 ? `; ${parts.slice(1).join('; ')}` : ''}.`
}

/** "April 2026". `longMonth` alone is "April", and a quarter card can span a
 *  year boundary — Q1's caveat would name a month twice with no way to tell
 *  which year it meant. */
const monthWithYear = (month: string): string =>
  `${longMonth(month)} ${new Date(`${month.slice(0, 10)}T00:00:00.000Z`).getUTCFullYear()}`

const list = (items: readonly string[]): string =>
  items.length <= 1 ? items[0] ?? '' : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`

const capitalise = (s: string): string => (s.length === 0 ? s : s[0].toUpperCase() + s.slice(1))

/**
 * The I/O half. Six reads, all of them small, and every one of them degrades
 * in words rather than throwing: the Reports page renders with or without this
 * card, and a card that threw would take the page's archive down with it.
 */
export async function loadQuarterlyCard(scope: Scope): Promise<QuarterlyCard | null> {
  const admin = scope.reading.client as SupabaseClient
  const clientId = scope.clientId
  const readingAt = new Date().toISOString()
  const quarter = quarterToReview(readingAt)
  const prior = previousQuarter(quarter)

  const subjects = await loadActiveSubjects(admin, clientId).catch(() => [])
  if (subjects.length === 0) return null

  const [thisQuarter, lastQuarter, subjectsNow, subjectsBefore, era] = await Promise.all([
    loadWindowReading(admin, clientId, { from: quarter.from, to: nextDay(quarter.to) }).catch(guardWindow),
    loadWindowReading(admin, clientId, { from: prior.from, to: nextDay(prior.to) }).catch(guardWindow),
    readSubjectWindow(admin, clientId, { from: quarter.from, to: nextDay(quarter.to) }).catch(guardSubjects),
    readSubjectWindow(admin, clientId, { from: prior.from, to: nextDay(prior.to) }).catch(guardSubjects),
    readEra(admin, clientId, quarter, readingAt),
  ])

  return buildQuarterlyCard({
    quarter,
    prior,
    subjects: subjects.map((s) => ({ id: s.id, name: s.name })),
    thisQuarter,
    lastQuarter,
    subjectsNow,
    subjectsBefore,
    monthsInQuarter: era.monthsInQuarter,
    readings: era.readings,
    readingMonth: monthStartOf(readingAt),
  })
}

const guardWindow = (error: unknown): WindowReading => {
  if (!isMissingMonthlyReading(error)) console.error(`[reports-card] window read: ${(error as { message?: string })?.message ?? String(error)}`)
  return { denominators: null, themes: null }
}

const guardSubjects = (error: unknown): SubjectWindowReading[] | null => {
  if (!isMissingSubjects(error)) console.error(`[reports-card] subject window: ${(error as { message?: string })?.message ?? String(error)}`)
  return null
}

const nextDay = (day: string): string => {
  const d = new Date(`${day}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/**
 * The tenant's gathered era, and what each month of the quarter carried.
 *
 * `readings` is OVERVIEW'S OWN RULE, deliberately: months of the gathered era
 * carrying a denominator row, from the first update to the month in hand. A
 * card that counted them a second way would put a different number beside the
 * same gate sentence the artefact prints, on a page a reader reaches both
 * from.
 *
 * AND THE MONTH IN HAND IS THE READING'S, NOT THE QUARTER'S. `quarter` is the
 * PREVIOUS quarter — the one under review — so bounding the series at
 * `quarter.to` stopped the count at June while the artefact counted through
 * September, and the card printed "you have 4" beside the same gate sentence
 * the artefact printed "you have 7" under, one click away. Worse, it could
 * hold every row at `baseline_forming` on a workspace whose artefact draws
 * banded verdicts. The series therefore runs to the month the reading is
 * taken in, which is Overview's `month` (`lib/pages/overview.ts`).
 */
async function readEra(
  admin: SupabaseClient,
  clientId: string,
  quarter: Quarter,
  readingAt: string,
): Promise<{ readings: number; monthsInQuarter: { month: string; videos: number | null; backRead: boolean }[] }> {
  const empty = { readings: 0, monthsInQuarter: [] as { month: string; videos: number | null; backRead: boolean }[] }
  try {
    const runRes = await admin
      .from('pipeline_runs')
      .select('started_at')
      .eq('client_id', clientId)
      .order('started_at', { ascending: true })
      .limit(1)
    const firstRun = (runRes.data?.[0] as { started_at?: string } | undefined)?.started_at ?? null
    if (!firstRun) return empty
    const firstRunMonth = monthStartOf(firstRun)
    const set = await loadMonthSeries(admin, clientId, { from: firstRunMonth, to: eraTo(firstRunMonth, readingAt) })
    return { readings: countReadings(set.denominators, firstRunMonth), monthsInQuarter: quarterMonths(set.denominators, quarter) }
  } catch (error) {
    if (!isMissingMonthlyReading(error)) console.error(`[reports-card] era: ${(error as { message?: string })?.message ?? String(error)}`)
    return empty
  }
}

/**
 * The last month the era's series is read to: the month the card is read in.
 *
 * NOT THE QUARTER'S LAST MONTH — that is the bug this replaced: the quarter
 * under review is the PREVIOUS one, so its `to` stops the count up to three
 * months short of the number the artefact prints from the same rule.
 *
 * NEVER BACKWARDS either: a first update inside the month the card is read in
 * gives `firstRunMonth === to`, which is one month and not none.
 */
export function eraTo(firstRunMonth: string, readingAt: string): string {
  const readingMonth = monthStartOf(readingAt)
  return readingMonth >= firstRunMonth ? readingMonth : firstRunMonth
}

/** Overview's rule, verbatim: months of the gathered era carrying a
 *  denominator row, pooled across audiences (a video sits in exactly one). */
export function countReadings(denominators: readonly DenominatorPoint[], firstRunMonth: string): number {
  const months = new Set<string>()
  for (const d of denominators) {
    const m = monthStartOf(d.month)
    if (m >= firstRunMonth) months.add(m)
  }
  return months.size
}

/** Each month of the quarter, with what it carried and whether it was read
 *  back rather than gathered. `origin` is the ROW's own answer to that — not a
 *  date comparison, which would call a live month back-read on a tenant whose
 *  first run happened to land mid-month. */
export function quarterMonths(
  denominators: readonly DenominatorPoint[],
  quarter: Quarter,
): { month: string; videos: number | null; backRead: boolean }[] {
  const videos = new Map<string, number>()
  const live = new Set<string>()
  const seen = new Set<string>()
  for (const d of denominators) {
    const m = monthStartOf(d.month)
    seen.add(m)
    videos.set(m, (videos.get(m) ?? 0) + (d.videos ?? 0))
    if (d.origin !== 'back_read') live.add(m)
  }
  return monthsBetween(quarter.from, quarter.to).map((month) => ({
    month,
    videos: videos.get(month) ?? null,
    // A month nobody read is not back-read; it is unread, and `videos: null`
    // is what says so.
    backRead: seen.has(month) && !live.has(month),
  }))
}

/** Every month start between two days, inclusive. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = []
  let cursor = monthStartOf(from)
  const last = monthStartOf(to)
  while (cursor <= last && out.length < 24) {
    out.push(cursor)
    const d = new Date(`${cursor}T00:00:00.000Z`)
    d.setUTCMonth(d.getUTCMonth() + 1)
    cursor = d.toISOString().slice(0, 10)
  }
  return out
}
