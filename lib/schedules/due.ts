import { REVIEW_TZ, quarterOfIn } from '../reports/quarterly'
import type { ScheduleCadence } from './types'

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
