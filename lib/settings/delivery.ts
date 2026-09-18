import { fmtInt, fullDate, longMonth, shortDate } from '../format'
import { longestGapDays } from '../readiness/compute'
import type { UpdateInput } from '../readiness/types'

/**
 * The delivery record (Phase 1 WP16, design ST6's delivery half).
 *
 * "N updates since {date} · longest gap {n} days · last on {date}", and — once
 * `pipeline_runs.scheduled_for` is applied — "N of M scheduled". The counting
 * rule is `lib/readiness/compute.ts`'s, and `longestGapDays` is imported rather
 * than re-implemented: readiness row 9 and this panel are two readings of one
 * table and must never disagree about how many updates a workspace has had.
 *
 * AN UPDATE IS COUNTED WHEN IT SETTLED, NOT WHEN IT STARTED. A run that failed
 * still happened and is still in the record — the honest count is "21 updates,
 * 6 of the last 8 finished", not "18 updates" with three quietly dropped.
 *
 * SLOTS. `slotsRecorded` is false until 20260915090000 is applied, and then
 * "N of M scheduled" is unanswerable: a missed slot cannot be told from a
 * manual update. The panel says that rather than printing a ratio it cannot
 * compute — the isMissing* guard precedent.
 *
 * Pure.
 */

/** "Finished" the way readiness row 9 counts it: `completed` and `partial`
 *  both produced something, `failed` did not. The same set is spelled out in
 *  `lib/readiness/compute.ts`, where it is not exported; it is repeated rather
 *  than widened, because this panel and row 9 print the same ratio and a
 *  wider set here would make them disagree. */
const FINISHED = new Set(['completed', 'partial'])

/** The same set, for the one other reader ON THIS PAGE: the monthly-readings
 *  strip counts DELIVERED updates per month, because that is what Overview's
 *  counter and `thinMonth`'s updates arm count, and the two surfaces must not
 *  disagree about how many updates a month had. Exported rather than copied a
 *  third time — the delivery record counts every run that settled, failures
 *  included, and the strip counts the ones that produced something; two
 *  different questions, one list of statuses. */
export const DELIVERED_STATUSES: ReadonlySet<string> = FINISHED

export interface DeliveryRecord {
  total: number
  /** The first update, `YYYY-MM-DD`. */
  since: string | null
  /** The most recent update that started, `YYYY-MM-DD`. */
  lastOn: string | null
  /** Days between the two furthest-apart consecutive updates, or null with
   *  fewer than two. */
  longestGapDays: number | null
  /** Of the most recent `recent` updates, how many finished — the ratio
   *  readiness row 9 prints, computed the same way. */
  recentSettled: number
  recent: number
  /** Of the updates on record, how many served a scheduled slot and how many
   *  were run by hand. Null until the slot bookkeeping is applied — a split
   *  nobody can compute is not a split of zero. */
  scheduledServed: { scheduled: number; byHand: number } | null
  /** The one-line summary. */
  line: string
  /** What the record cannot say, where it cannot say it. Empty when it can. */
  caveats: string[]
}

export function deliveryRecord(args: {
  updates: readonly UpdateInput[]
  slotsRecorded: boolean
  recent?: number
}): DeliveryRecord {
  const { updates, slotsRecorded, recent = 8 } = args
  // Oldest first for the ends; the loader hands them newest first.
  const byTime = [...updates].sort((a, b) => (a.startedAt < b.startedAt ? -1 : a.startedAt > b.startedAt ? 1 : 0))
  const total = byTime.length
  const since = byTime[0]?.startedAt.slice(0, 10) ?? null
  const lastOn = byTime[total - 1]?.startedAt.slice(0, 10) ?? null
  const head = [...updates].sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1)).slice(0, recent)
  const recentSettled = head.filter((u) => FINISHED.has(u.status)).length

  // What the column can and cannot answer. A run carrying `scheduled_for`
  // served a slot; a run without one was started by hand. A slot that was
  // MISSED produces no run at all, so "N of M scheduled" in the design's sense
  // — M being the slots that should have fired — is still not derivable from
  // this table, and the caveat below says so even once the column lands.
  const scheduledServed = slotsRecorded
    ? {
        scheduled: byTime.filter((u) => u.scheduledFor != null).length,
        byHand: byTime.filter((u) => u.scheduledFor == null).length,
      }
    : null

  const caveats: string[] = []
  if (!slotsRecorded) {
    caveats.push('Which scheduled slot each update served is not recorded yet, so a missed slot cannot be told from an update run by hand.')
  } else {
    caveats.push('A slot nothing ran for leaves no trace here, so this counts the updates that happened and not the ones that should have.')
  }

  const line = total === 0
    ? 'No update has run for this workspace yet.'
    : [
        `${total} update${total === 1 ? '' : 's'}${since ? ` since ${fullDate(since)}` : ''}`,
        args.updates.length >= 2 ? `longest gap ${longestGapDays(byTime.map((u) => ({ status: u.status, startedAt: u.startedAt })))} days` : null,
        lastOn ? `last on ${fullDate(lastOn)}` : null,
      ].filter(Boolean).join(' · ')

  return {
    total,
    since,
    lastOn,
    longestGapDays: total >= 2 ? longestGapDays(byTime.map((u) => ({ status: u.status, startedAt: u.startedAt }))) : null,
    recentSettled,
    recent: head.length,
    scheduledServed,
    line,
    caveats,
  }
}

/** The updates of one calendar month, newest first — the mock's dated chip row
 *  under the delivery stats. */
export function updatesInMonth(updates: readonly UpdateInput[], month: string): UpdateInput[] {
  return [...updates]
    .filter((u) => u.startedAt.slice(0, 7) === month)
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
}

// ---- The artboard's four stat cells ------------------------------------------
//
// SettingsRecord.dc.html draws the delivery record as four 24px mono figures
// over 11.5px captions — "6 Apr / tracking since", "23 / updates delivered",
// "5 / weeks · longest gap, in May", "27 Sep / last update · next 4 Oct" — and
// the build printed one running sentence in their place. The figures are the
// same `DeliveryRecord`; these compose the CELLS, and they are where the two
// honest departures from the artboard are made:
//
//   · "TRACKING SINCE" IS NOT A START DATE (mock-gap §6 D14). `since` is the
//     first update on record, which is the earliest evidence we hold that we
//     were reading at all — not the day the client asked for it, which nothing
//     recorded. Settings › Tracking already prints that caveat about the rival
//     rows; the caption here says it rather than repeating the mock's claim.
//   · "NEXT 4 OCT" HAS NO FIELD AT ALL. Nothing in the product knows when the
//     next gather runs — `report_schedules` knows when an artefact SENDS — so
//     the fourth cell carries the last update alone and the chip row carries no
//     ghost pill. A hollow "next" pill is a promise the scheduler never made.

/** One of the four stat cells: a mono figure, an optional unit beside it, and
 *  the caption under it. */
export interface DeliveryStat {
  id: 'since' | 'delivered' | 'gap' | 'last'
  figure: string
  /** The 12px word set beside the figure ("updates", "weeks"). */
  unit: string | null
  caption: string
}

/**
 * The longest gap, in the artboard's unit.
 *
 * ONE CONVERSION, HERE (mock-gap §6 deviation 9). `longestGapDays` is days by
 * construction and is shared with readiness row 9, so the two surfaces cannot
 * disagree about how long the longest gap was; rendering it as weeks on one
 * surface and days on the other is exactly the drift that shared import exists
 * to prevent. So the conversion happens in one place, from the one answer, and
 * anything under a fortnight stays in days — "1.7 weeks" is a worse sentence
 * than "12 days" and rounds a real number into a vague one.
 */
export function gapFigure(days: number | null): { figure: string; unit: string } | null {
  if (days == null) return null
  if (days < 14) return { figure: String(days), unit: days === 1 ? 'day' : 'days' }
  const weeks = Math.round((days / 7) * 10) / 10
  return { figure: String(weeks), unit: weeks === 1 ? 'week' : 'weeks' }
}

/**
 * The month the longest gap ENDED in — the artboard's "longest gap, in May".
 *
 * DERIVED FROM THE SHARED ANSWER, NEVER COMPUTED A SECOND TIME. It walks the
 * same settled updates in the same order and returns the month of the update
 * that closed the pair whose length equals `longestGapDays`. Where no pair
 * matches — which can only happen if the two counting rules ever part company —
 * it returns null and the caption drops the clause rather than naming a month
 * off a different count.
 */
export function gapMonth(updates: readonly UpdateInput[], days: number | null): string | null {
  if (days == null) return null
  const times = [...updates]
    .filter((u) => FINISHED.has(u.status))
    .map((u) => u.startedAt)
    .sort()
  for (let n = 1; n < times.length; n++) {
    const span = Math.round((Date.parse(times[n]) - Date.parse(times[n - 1])) / 86_400_000)
    if (span === days) return times[n].slice(0, 7)
  }
  return null
}

/** The four cells, in the artboard's order. Empty where no update has ever
 *  run — a record of nothing is a sentence, not four dashes. */
export function deliveryStats(record: DeliveryRecord, updates: readonly UpdateInput[]): DeliveryStat[] {
  if (record.total === 0) return []
  const out: DeliveryStat[] = []
  if (record.since) {
    out.push({
      id: 'since',
      figure: shortDate(record.since),
      unit: null,
      // D14: earliest evidence, worded as such.
      caption: 'first update on record',
    })
  }
  out.push({
    id: 'delivered',
    figure: fmtInt(record.total),
    unit: record.total === 1 ? 'update' : 'updates',
    caption: 'delivered',
  })
  const gap = gapFigure(record.longestGapDays)
  if (gap) {
    const month = gapMonth(updates, record.longestGapDays)
    out.push({
      id: 'gap',
      figure: gap.figure,
      unit: gap.unit,
      caption: month ? `longest gap, in ${longMonth(`${month}-01`)}` : 'longest gap between updates',
    })
  }
  if (record.lastOn) {
    // No "next 4 Oct": nothing records when the next gather runs.
    out.push({ id: 'last', figure: shortDate(record.lastOn), unit: null, caption: 'last update' })
  }
  return out
}
