import type { ScheduleRow } from './types'

/**
 * Which artefact a schedule sends (Phase 1 WP17).
 *
 * THE COLUMN ARRIVES WITH M8, WHICH IS WP16's AND IS NOT APPLIED. The plan
 * gives `report_schedules.artefact` (`weekly` | `monthly` | `quarterly` |
 * `brief:<audience>`) to the Settings package's migration; this package needs
 * to know which schedule sends the weekly report before that lands, and must
 * not author a second migration for the same column.
 *
 * So the answer is read in two steps, and the order matters: the COLUMN when it
 * is there, and otherwise the STARTER KEY, which is a stored `text` that has
 * carried what a schedule sends since 2026-08-30. `weekly_report` is the new
 * weekly artefact's key; `weekly_digest` is the retiring one and deliberately
 * does NOT answer 'weekly', because a workspace whose schedule still names the
 * digest should keep receiving the digest until an operator migrates it. That
 * is what `scripts/migrate-schedule-keys.ts` is for, and it is why this is a
 * migration rather than a rename.
 *
 * A schedule that answers `null` is sent exactly as it was before this package
 * existed. No live schedule changes shape because this file was added.
 */

export type Artefact = 'weekly' | 'monthly' | 'quarterly' | (string & {})

/** The starter key the weekly report is sent under. */
export const WEEKLY_STARTER_KEY = 'weekly_report'

/** And the monthly one's (Phase 1 WP18). A schedule names its artefact through
 *  `report_schedules.artefact` the moment M8 lands, and that column is what
 *  `scheduleArtefact` reads first; the starter key is the FALLBACK, and it is
 *  what a stored row still says if that column is ever rolled back under it. */
export const MONTHLY_STARTER_KEY = 'monthly_report'

/** The starter key it replaces. Still resolvable — stored rows name it. */
export const RETIRED_DIGEST_KEY = 'weekly_digest'

export const isWeeklyArtefact = (a: Artefact | null): boolean => a === 'weekly'
export const isMonthlyArtefact = (a: Artefact | null): boolean => a === 'monthly'

/** The starter key the quarterly review is sent under, for a workspace whose
 *  `report_schedules.artefact` column (M8) is not applied yet — the same two
 *  steps the weekly report reads, for the same reason. */
export const QUARTERLY_STARTER_KEY = 'quarterly_review'

export const isQuarterlyArtefact = (a: Artefact | null): boolean => a === 'quarterly'

/**
 * The starter key a schedule for this artefact is stored under.
 *
 * WRITTEN, NOT ONLY DEFINED. Settings wrote `DEFAULT_SCHEDULE_STARTER` —
 * 'weekly_report' — on every new row whatever artefact it was for, so
 * `MONTHLY_STARTER_KEY`'s own docblock described a migration path no writer in
 * the product took, and a monthly row's only correct answer lived in a column
 * M8 adds. lib/settings/artefacts.ts names what that costs if the column is
 * ever absent under a row that has one: the row "would send THE WEEKLY REPORT,
 * monthly, to those addresses, under the monthly reading's name". The fallback
 * now agrees with the column.
 *
 * An artefact with no starter of its own keeps the default: it has no builder
 * either, so its row is recorded and inert until one lands.
 */
export function starterKeyFor(artefact: Artefact | null): string {
  if (artefact === 'monthly') return MONTHLY_STARTER_KEY
  if (artefact === 'quarterly') return QUARTERLY_STARTER_KEY
  return WEEKLY_STARTER_KEY
}

/** What this schedule sends, or null where nothing has said. */
export function scheduleArtefact(schedule: Pick<ScheduleRow, 'starter_key'> & { artefact?: string | null }): Artefact | null {
  const stored = typeof schedule.artefact === 'string' ? schedule.artefact.trim() : ''
  if (stored) return stored
  if (schedule.starter_key === WEEKLY_STARTER_KEY) return 'weekly'
  if (schedule.starter_key === MONTHLY_STARTER_KEY) return 'monthly'
  if (schedule.starter_key === QUARTERLY_STARTER_KEY) return 'quarterly'
  return null
}

/** Does this schedule send the weekly report? */
export function sendsWeekly(schedule: Pick<ScheduleRow, 'starter_key'> & { artefact?: string | null }): boolean {
  return isWeeklyArtefact(scheduleArtefact(schedule))
}

/** The monthly one (Phase 1 WP18). */
export function sendsMonthly(schedule: Pick<ScheduleRow, 'starter_key'> & { artefact?: string | null }): boolean {
  return isMonthlyArtefact(scheduleArtefact(schedule))
}

/** And the quarterly review (Phase 1 WP20). */
export function sendsQuarterly(schedule: Pick<ScheduleRow, 'starter_key'> & { artefact?: string | null }): boolean {
  return isQuarterlyArtefact(scheduleArtefact(schedule))
}

/** ANY of the block-arranged artefacts — the weekly report, the monthly reading
 *  and the quarterly review. All three take the same transport and differ only
 *  in the reading they freeze and the body they render; none has a `reports`
 *  row to resolve or a tile to render into an email. The send path asks this
 *  once rather than asking three questions in six places. A brief is NOT one:
 *  it is a written document with its own build. */
export function sendsBlockArtefact(schedule: Pick<ScheduleRow, 'starter_key'> & { artefact?: string | null }): boolean {
  return sendsWeekly(schedule) || sendsMonthly(schedule) || sendsQuarterly(schedule)
}

/**
 * What to call an artefact schedule on a screen.
 *
 * An artefact schedule has no `reports` row, so there is no title to read off
 * one — and the Studio, which is the only place a schedule can be read or
 * edited, builds its list out of `reports`. Until WP16's delivery screen lands,
 * this is the name the Studio lists it under; without it a migrated schedule
 * has no recipients field, no Preview, no Send now and no Active toggle, and
 * SQL is the only door to the list of people it emails.
 */
export function artefactTitle(artefact: Artefact | null): string {
  if (!artefact) return 'Sending'
  if (artefact === 'weekly') return 'Weekly report'
  if (artefact === 'monthly') return 'Monthly report'
  if (artefact === 'quarterly') return 'Quarterly review'
  if (artefact.startsWith('brief:')) {
    const who = artefact.slice('brief:'.length).replace(/[_-]+/g, ' ').trim()
    return who ? `${who.charAt(0).toUpperCase()}${who.slice(1)} brief` : 'Brief'
  }
  return `${artefact.charAt(0).toUpperCase()}${artefact.slice(1)} report`
}

/** A schedule that sends an artefact rather than one of the workspace's own
 *  templates — the rows the Studio would otherwise never draw. */
export function sendsArtefact(schedule: Pick<ScheduleRow, 'starter_key' | 'report_id'> & { artefact?: string | null }): boolean {
  return !schedule.report_id && scheduleArtefact(schedule) != null
}
