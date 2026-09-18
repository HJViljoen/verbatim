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
  previousQuarter,
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
    }
  }

  const denomNow = new Map(now.map((d) => [d.audience, d.videos]))
  const denomBefore = new Map(before.map((d) => [d.audience, d.videos]))
  const nowBySubject = new Map((input.subjectsNow ?? []).map((s) => [`${s.audience}:${s.subject_id}`, s]))
  const beforeBySubject = new Map((input.subjectsBefore ?? []).map((s) => [`${s.audience}:${s.subject_id}`, s]))

  const rows: { label: string; verdict: Verdict }[] = []
  const series: { label: string; value: Counted }[] = []
  for (const subject of input.subjects) {
    const value = nowBySubject.get(`${CARD_AUDIENCE}:${subject.id}`)
    const baseline = beforeBySubject.get(`${CARD_AUDIENCE}:${subject.id}`)
    const n = denomNow.get(CARD_AUDIENCE)
    const priorN = denomBefore.get(CARD_AUDIENCE)
    if (!value || !baseline || !n || !priorN) continue
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
    note: quarterCaveat(input.monthsInQuarter, rows.length === 0, input.subjectsNow == null),
  }
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
    readEra(admin, clientId, quarter),
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
 */
async function readEra(
  admin: SupabaseClient,
  clientId: string,
  quarter: Quarter,
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
    const set = await loadMonthSeries(admin, clientId, { from: firstRunMonth, to: quarter.to })
    return { readings: countReadings(set.denominators, firstRunMonth), monthsInQuarter: quarterMonths(set.denominators, quarter) }
  } catch (error) {
    if (!isMissingMonthlyReading(error)) console.error(`[reports-card] era: ${(error as { message?: string })?.message ?? String(error)}`)
    return empty
  }
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
