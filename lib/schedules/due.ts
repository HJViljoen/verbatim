import { REVIEW_TZ, quarterOfIn } from '../reports/quarterly'
import { sendsWeeklyRead } from './artefact'
import type { ScheduleCadence, ScheduleRow } from './types'

/** Calendar month of an instant in a timezone, as "YYYY-MM". */
export function monthKey(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit' }).format(new Date(iso))
}

/**
 * Calendar quarter of an instant in a timezone, as "YYYY-Qn".
 *
 * THE ARTEFACT'S OWN ARITHMETIC, not a second copy of it. `quarterOfIn` is
 * what `quarterToReview` names the reviewed quarter with; while the schedule
 * counted its quarter here and the artefact counted one in UTC there, the two
 * disagreed for two hours at every boundary — and once a send reviews the
 * quarter BEHIND the one it fires in, that disagreement is a whole quarter
 * wrong, not a label.
 */
export function quarterKey(iso: string, tz: string): string {
  const q = quarterOfIn(iso, tz)
  return `${q.year}-Q${q.q}`
}

/**
 * Whether a schedule fires for the update dated `runDate`. A schedule never has
 * its own clock — it rides the scheduled update (pipeline/run.requested with
 * sendReport), so "every update" is simply "active", and "monthly" is "active
 * and nothing sent yet in this calendar month" (SAST, like the scheduler).
 */
export function scheduleDue(
  s: { cadence: ScheduleCadence; active: boolean },
  lastSentAt: string | null,
  runDate: string,
  tz = REVIEW_TZ,
): boolean {
  if (!s.active) return false
  if (s.cadence === 'every_update') return true
  if (!lastSentAt) return true
  if (s.cadence === 'quarterly') return quarterKey(lastSentAt, tz) !== quarterKey(runDate, tz)
  return monthKey(lastSentAt, tz) !== monthKey(runDate, tz)
}

/** One schedule an update fires, and whether its build may email anyone. */
export interface ReportTarget {
  id: string
  name: string
  /** The build emails nobody, not the list and not a reviewer: a weekly read
   *  is built and put in the client's past issues, and any other artefact is
   *  not built at all (`runSchedule`'s `noEmail`). */
  noEmail?: true
}

/**
 * WHICH SCHEDULES AN UPDATE FIRES (5 Oct; Heinrich: "a finished run reaches
 * the platform by itself; review holds ONLY the email").
 *
 *   A SCHEDULED update (`sendReport`): every due schedule, exactly as before,
 *   each free to email as it always has; and every ACTIVE weekly-read schedule
 *   that is not due, with `noEmail`, so the run's issue still reaches the
 *   client's past issues.
 *   A MANUAL update (trigger-run without `sendReport`): the active weekly-read
 *   schedules alone, each with `noEmail`. Nothing else fires (a legacy digest,
 *   the monthly, the briefs), and nobody is emailed.
 *
 * Pure: `inngest/functions/report.ts` asks it in `find-due-schedules`.
 */
export function reportTargets(
  schedules: readonly (Pick<ScheduleRow, 'id' | 'name' | 'cadence' | 'active' | 'last_sent_at' | 'starter_key'> & { artefact?: string | null })[],
  runDate: string,
  opts: { manual?: boolean } = {},
): ReportTarget[] {
  const out: ReportTarget[] = []
  for (const s of schedules) {
    if (!opts.manual && scheduleDue(s, s.last_sent_at, runDate)) out.push({ id: s.id, name: s.name })
    else if (s.active && sendsWeeklyRead(s)) out.push({ id: s.id, name: s.name, noEmail: true })
  }
  return out
}
