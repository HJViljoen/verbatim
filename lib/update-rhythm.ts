/**
 * Every workspace is updated weekly, on Sunday (Heinrich, 27 Sep 2026: "remove
 * cadence from settings, and always have it weekly on sunday").
 *
 * WHAT WENT. Settings › Tracking had a Cadence section: weekly or monthly, and
 * the day it lands. A client can no longer choose either. The section is gone,
 * the save no longer writes `report_period` or `report_day`, and a POST that
 * tries to move them off what is stored is refused before anything is written
 * (`cadenceEditIn`, app/dashboard/settings/actions.ts).
 *
 * WHY THE TWO COLUMNS STAY. The dispatcher (inngest/functions/scheduler.ts)
 * reads them at 06:00 SAST every morning and starts a workspace's update when
 * they match the day (lib/pipeline/schedule-due.ts), and the reading pages work
 * the next update's date out from the same rule. That code sits in the
 * pipeline's import closure, which does not change before the 4 Oct run. So
 * the columns are still the truth, and what changed is who may write them:
 *   - no client, from any page;
 *   - the operator's CLI (scripts/set-cadence.ts): weekly on Sunday, or paused;
 *   - a new workspace: sign-up writes weekly on Sunday (the column's default is
 *     Monday), and provisioning weekly on Sunday or paused.
 * A line that reads the stored schedule therefore reads Sunday, and one that
 * only names the rhythm in words says it from here.
 *
 * THE PAUSE IS THE OPERATOR'S, AND IT IS `report_period = 'paused'`. Nothing in
 * schedule-due.ts matches it, so a paused workspace is never dispatched and
 * nothing is spent on it (Össur, since 13 Sep). No client control shows it or
 * can move it: the Settings save does not write `report_period` at all. Only
 * scripts/set-cadence.ts (the service role, stamped) pauses or resumes, and a
 * resume lands on Sunday.
 *
 * Pure: no database, no clock.
 */

/** The one rhythm every workspace that is not paused is updated on. */
export const UPDATE_PERIOD = 'weekly' as const
export const UPDATE_DAY = 'sunday' as const
/** The operator's pause, as `tracking_configs.report_period` stores it. */
export const PAUSED_PERIOD = 'paused' as const

/** What an unpaused workspace stores. */
export const WEEKLY_ON_SUNDAY = { report_period: UPDATE_PERIOD, report_day: UPDATE_DAY } as const
/** What a paused workspace stores: never due, and the day a resume lands on. */
export const PAUSED_ON_SUNDAY = { report_period: PAUSED_PERIOD, report_day: UPDATE_DAY } as const

/** The two values the operator may store in `report_period`. */
export const OPERATOR_PERIODS = [UPDATE_PERIOD, PAUSED_PERIOD] as const
export type OperatorPeriod = (typeof OPERATOR_PERIODS)[number]

/** The stored cadence columns, as any reader holds them. */
export interface StoredRhythm {
  report_period?: string | null
  report_day?: string | null
}

export const isPausedRhythm = (stored: StoredRhythm | null | undefined): boolean =>
  stored?.report_period === PAUSED_PERIOD

/** The pair to store for an operator's choice: weekly always lands on Sunday. */
export function operatorRhythm(period: OperatorPeriod): { report_period: OperatorPeriod; report_day: typeof UPDATE_DAY } {
  return { report_period: period, report_day: UPDATE_DAY }
}

/** Whether a stored pair is one this product now allows: weekly on Sunday, or
 *  paused (on any day: a pause is never due, and a resume writes Sunday). */
export function isAllowedRhythm(stored: StoredRhythm | null | undefined): boolean {
  if (!stored) return false
  if (stored.report_period === PAUSED_PERIOD) return true
  return stored.report_period === UPDATE_PERIOD && stored.report_day === UPDATE_DAY
}

// ---- The refusal --------------------------------------------------------------

/** What a save that tries to move the rhythm is told. A page opened before the
 *  Cadence section went still posts it; reloading drops it. */
export const CADENCE_REFUSAL =
  'Could not save: every workspace updates weekly, on Sunday, and that is no longer a setting. Reload the page, then save again.'

/**
 * Whether a POST would move `report_period` or `report_day` off what is stored,
 * and so must be refused. A field the POST does not carry moves nothing; one
 * that repeats the stored value moves nothing either, which is what a page
 * opened before this change posts on every save (its Cadence section sent both
 * fields, or the day alone on a paused workspace) and is let through so its
 * terms still save. Anything else is refused, whatever it is.
 */
export function cadenceEditIn(
  form: { get(name: string): FormDataEntryValue | null },
  stored: StoredRhythm | null | undefined,
): boolean {
  const moves = (field: 'report_period' | 'report_day'): boolean => {
    const posted = form.get(field)
    return posted !== null && String(posted) !== (stored?.[field] ?? '')
  }
  return moves('report_period') || moves('report_day')
}

// ---- The words ----------------------------------------------------------------

/** The rhythm, as a line of copy names it. */
export const UPDATE_RHYTHM_WORDS = 'weekly, on Sunday'

/** "Sunday's update", or, on a paused workspace, which is promised none, "the
 *  next update". For an empty state that says when something first arrives. */
export function nextUpdateWords(stored: StoredRhythm | null | undefined): string {
  return stored && !isPausedRhythm(stored) ? 'Sunday’s update' : 'the next update'
}
