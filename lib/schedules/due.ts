import { REVIEW_TZ, quarterOfIn } from '../reports/quarterly'
import { gatheredNothing } from '../pipeline/run-bookkeeping'
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
 * A RUN THAT IS A TEST, whose weekly read must not become an issue by itself
 * (the lead's call, 5 Oct: test runs do not publish): a rehearsal that
 * gathered nothing (`gatheredNothing`, lib/pipeline/run-bookkeeping.ts), a
 * capped run (`options.videoLimit` or `options.maxVideos` set), or one told
 * not to (`options.publish === false`). A real manual run, a full gather such
 * as Össur's 4 Oct `555af400`, is not one. A run row that is not there counts
 * as one: fail closed, nothing is published on a guess. Pure.
 */
export function isTestRun(run: { id: string; options?: unknown } | null): boolean {
  if (!run) return true
  if (gatheredNothing(run)) return true
  const o = (run.options && typeof run.options === 'object' ? run.options : {}) as { videoLimit?: unknown; maxVideos?: unknown; publish?: unknown }
  return o.videoLimit != null || o.maxVideos != null || o.publish === false
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
 *   the monthly, the briefs), and nobody is emailed. A manual TEST run
 *   (`isTestRun`: a rehearsal, a capped run, `publish: false`) fires nothing.
 *
 * Pure: `inngest/functions/report.ts` asks it in `find-due-schedules`.
 */
export function reportTargets(
  schedules: readonly (Pick<ScheduleRow, 'id' | 'name' | 'cadence' | 'active' | 'last_sent_at' | 'starter_key'> & { artefact?: string | null })[],
  runDate: string,
  opts: { manual?: boolean; testRun?: boolean } = {},
): ReportTarget[] {
  if (opts.manual && opts.testRun) return []
  const out: ReportTarget[] = []
  for (const s of schedules) {
    if (!opts.manual && scheduleDue(s, s.last_sent_at, runDate)) out.push({ id: s.id, name: s.name })
    else if (s.active && sendsWeeklyRead(s)) out.push({ id: s.id, name: s.name, noEmail: true })
  }
  return out
}
