import { longMonth, shortDate } from '../format'
import { monthStartOf } from '../reading/month-key'
import type { MonthSeries } from '../reading/series'

// WAS THIS SUBJECT READ IN THIS MONTH AT ALL? (WP1.1 review, finding 1.)
//
// `monthly_subject_readings` groups by the videos that cite a subject, so an
// audience-month where it is cited on no video writes NO row, and the month
// series fills a 0 wherever the audience has a denominator row
// (lib/reading/series.ts). That 0 is true for a subject the month's update
// read. It is invented for a subject named after that update: nothing looked,
// and "0 of 654 in your market" is a measurement nobody made. Staging holds the
// case: Community & purpose was named 24 Sep at 12:41, after the 24 Sep update
// wrote September's rows at 12:15, and it has no row in any month, while the
// Reports card reads it at 12 of 875 category videos in Q3 off its live
// membership.
//
// THE TEST. A subject was read in a month when it was counted before the
// month's rows were last written: its confirmation (or its creation, when it
// was inserted already counted) is earlier than the latest `read_at` of the
// month's denominator rows. A subject that has a row in the month was read,
// whatever the clocks say. A month with no denominator row was read for nobody,
// and every side is already null there, so it is not this test's case.
//
// WHY THE CHANGE LOG. `subjects.named_at` is a date, and a subject named on the
// day of an update cannot be placed before or after it; and a subject is named
// PROPOSED and counted only once somebody confirms it (`activateSubject`), so
// its `created_at` can be days before it was first read. The confirmation is a
// `config_changes` row on the `subjects` surface (the status trigger,
// migration 20260924091000), which every loader here already holds through
// `loadChanges` (memoised), so the test costs no read.

/** The fields the test reads off a subject row. `created_at` is a timestamp
 *  (the loaders that select `*` carry it); `named_at` is a date. */
export interface CountedSubject {
  id: string
  named_at: string
  created_at?: string | null
}

/** The fields the test reads off a change-log row. */
export interface SubjectChange {
  changed_at: string
  surface: string
  after: unknown
}

const ms = (iso: string | null | undefined): number | null => {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : null
}

const DAY_MS = 24 * 60 * 60 * 1000

function afterOf(after: unknown): { id?: unknown; status?: unknown } | null {
  if (after == null) return null
  if (typeof after === 'string') {
    try {
      const parsed = JSON.parse(after) as unknown
      return parsed && typeof parsed === 'object' ? (parsed as { id?: unknown; status?: unknown }) : null
    } catch {
      return null
    }
  }
  return typeof after === 'object' ? (after as { id?: unknown; status?: unknown }) : null
}

/**
 * The instant a subject started being counted, in ms: the later of its latest
 * confirmation in the change log (a `subjects` row whose `after` names it
 * `active`) and its creation. Neither known: the end of the day it was named,
 * because a date alone cannot say which side of that day's update it fell on,
 * and the later reading never invents a zero. Null only when not even
 * `named_at` parses.
 */
export function subjectCountedFrom(s: CountedSubject, changes: readonly SubjectChange[]): number | null {
  let confirmed: number | null = null
  for (const c of changes) {
    if (c.surface !== 'subjects') continue
    const after = afterOf(c.after)
    if (!after || after.id !== s.id || after.status !== 'active') continue
    const at = ms(c.changed_at)
    if (at != null && (confirmed == null || at > confirmed)) confirmed = at
  }
  const created = ms(s.created_at ?? null)
  const known = [confirmed, created].filter((v): v is number => v != null)
  if (known.length > 0) return Math.max(...known)
  const named = s.named_at?.length === 10 ? ms(`${s.named_at}T00:00:00.000Z`) : ms(s.named_at)
  if (named == null) return null
  return s.named_at.length === 10 ? named + DAY_MS : named
}

/**
 * Each month's latest `read_at` over its denominator rows, in ms: the last time
 * an update wrote the month. `audiences`, when given, keeps only those rows
 * (the market's). A row with no parseable `read_at` is skipped.
 */
export function monthsWrittenAt(
  denominators: readonly { month: string; audience: string; read_at?: string | null }[],
  audiences?: ReadonlySet<string>,
): Map<string, number> {
  const out = new Map<string, number>()
  for (const d of denominators) {
    if (audiences && !audiences.has(d.audience)) continue
    const at = ms(d.read_at ?? null)
    if (at == null) continue
    const month = monthStartOf(d.month)
    const was = out.get(month)
    if (was == null || at > was) out.set(month, at)
  }
  return out
}

/**
 * Was the subject read in the month?
 *
 * `'no_month'`: the month has no denominator row, so nobody was read in it
 * (every side is already null there). `'read'`: the subject has a row in the
 * month (`cited`), or it was counted before the month was last written.
 * `'unread'`: the month was written before the subject was counted, so its
 * zeros are not a reading.
 */
export function subjectReadIn(input: {
  countedFrom: number | null
  writtenAt: number | null | undefined
  cited: boolean
}): 'read' | 'unread' | 'no_month' {
  if (input.writtenAt == null) return 'no_month'
  if (input.cited) return 'read'
  if (input.countedFrom == null) return 'unread'
  return input.countedFrom < input.writtenAt ? 'read' : 'unread'
}

/**
 * What a row prints for a subject the month was not read for, in place of its
 * figures: the preview's "first reading with the 27 Sep update" while the
 * updates to come still read the month (it is filling: `freezeStateFor`), and
 * "not read in {Month}" once none will (it has frozen), or while no update is
 * scheduled (paused).
 */
export function unreadWords(r: { month: string; filling: boolean; nextUpdate: string | null }): string {
  if (r.filling && r.nextUpdate) return `first reading with the ${shortDate(r.nextUpdate)} update`
  return `not read in ${longMonth(r.month)}`
}

/**
 * A subject's line with the months it was not read in taken out: each such
 * point keeps its month, its audience and its denominator, and loses its k, its
 * comments and its share, which is "no reading" (null), never 0. A line that
 * loses nothing is returned as it came.
 */
export function withoutUnreadMonths(series: MonthSeries, unread: (month: string) => boolean): MonthSeries {
  if (!series.points.some((p) => unread(monthStartOf(p.month)) && p.k != null)) return series
  return {
    ...series,
    points: series.points.map((p) =>
      unread(monthStartOf(p.month)) ? { ...p, k: null, kComments: null, pct: null } : p,
    ),
  }
}
