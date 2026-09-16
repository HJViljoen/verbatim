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

/** The starter key it replaces. Still resolvable — stored rows name it. */
export const RETIRED_DIGEST_KEY = 'weekly_digest'

export const isWeeklyArtefact = (a: Artefact | null): boolean => a === 'weekly'

/** What this schedule sends, or null where nothing has said. */
export function scheduleArtefact(schedule: Pick<ScheduleRow, 'starter_key'> & { artefact?: string | null }): Artefact | null {
  const stored = typeof schedule.artefact === 'string' ? schedule.artefact.trim() : ''
  if (stored) return stored
  return schedule.starter_key === WEEKLY_STARTER_KEY ? 'weekly' : null
}

/** Does this schedule send the weekly report? */
export function sendsWeekly(schedule: Pick<ScheduleRow, 'starter_key'> & { artefact?: string | null }): boolean {
  return isWeeklyArtefact(scheduleArtefact(schedule))
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
  if (artefact === 'quarterly') return 'Quarterly report'
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
