import type { SupabaseClient } from '@supabase/supabase-js'

import { selectAll } from '../supabase-admin'
import type { NumeratorSide } from '../reading/monthly'
import {
  MONTH_SUBJECT_TABLE,
  RPC_SUBJECT_READINGS,
  RPC_WINDOW_SUBJECT_READINGS,
} from '../reading/types'
import { JUDGE_VERSION, type SubjectReading, type SubjectWindowReading } from './types'

// A subject's months — the same reading as a theme's, over a different
// membership, written into a sibling table by the same freeze.
//
// WHY A SIBLING TABLE AND NOT A COLUMN. `month_theme_readings.theme_id` is
// `references theme_registry(id)` AND part of the primary key, so it can hold
// neither a subject id nor a NULL; widening it would mean dropping the primary
// key, adding a `num_nonnulls` CHECK, and making every reader of that table
// remember to write `theme_id is not null` or silently mix two kinds of object
// into one series. The failure would be silent and the migration could not
// catch it. What IS shared is the shape — the same freeze columns, the same two
// guards, the same merge, the same stale sweep — and that sharing is now a
// descriptor (`MonthTable`) rather than a copied block of code.
//
// WHAT DIFFERS, AND IT IS ONE COLUMN'S MEANING. A theme row records the RUN
// whose clustering produced it, because that is what makes two theme months
// comparable. A subject row records the JUDGE. `run_id` still rides along as
// bookkeeping — which update wrote this — but a reader compares on
// `judge_version`, and the two are not the same question: a subject's months
// stay comparable across a clustering boundary that a theme's do not.
//
// AND ONE THING A READER HAS TO CARRY. A back-read subject month decays faster
// than a theme's. A theme month loses evidence only as the Pass A prune takes
// citations; a subject month loses it that way AND through re-read insights
// that nobody has re-judged yet. The unit saves most of it — the reading counts
// distinct VIDEOS, so a re-worded insight about the same subject on the same
// video leaves the number alone — but it does not save all of it, and
// `origin = 'back_read'` is what says so on the row.

/** The stored months, read as the record. */
export async function readSubjectMonths(
  admin: SupabaseClient,
  clientId: string,
  window: { from: string; to: string },
): Promise<SubjectReading[]> {
  return selectAll<SubjectReading>(() =>
    admin
      .rpc(RPC_SUBJECT_READINGS, { p_client: clientId, p_from: window.from, p_to: window.to })
      .order('month', { ascending: true })
      .order('audience', { ascending: true })
      .order('subject_id', { ascending: true }),
  )
}

/**
 * The same reading over a whole window, as ONE row per audience per subject.
 *
 * Not a sum of the month rows, and the difference is not small: a video whose
 * comment thread spans two months belongs to both months' sets, so adding them
 * counts it twice — measured +28% on a crossing week and +91% on Össur's own
 * audience since its first stored month. Comments sum exactly; videos do not,
 * and videos are what every share divides by.
 */
export async function readSubjectWindow(
  admin: SupabaseClient,
  clientId: string,
  window: { from: string; to: string },
): Promise<SubjectWindowReading[]> {
  return selectAll<SubjectWindowReading>(() =>
    admin
      .rpc(RPC_WINDOW_SUBJECT_READINGS, { p_client: clientId, p_from: window.from, p_to: window.to })
      .order('audience', { ascending: true })
      .order('subject_id', { ascending: true }),
  )
}

/**
 * The subject side of a freeze visit, as `freezeMonths` wants it.
 *
 * Handed to `freezeMonths` rather than run beside it, for a reason the database
 * enforces: the denominator's freeze is what closes an audience-month to new
 * rows, so every numerator of a visit has to be written BEFORE it. A separate
 * subject freeze running after the theme freeze would write behind a
 * denominator that had just frozen, and `month_reading_frozen_insert_guard`
 * would refuse it — correctly, and for ever, because the month would never be
 * revisited.
 *
 * `clustering` is false: a subject's membership is not a clustering artefact,
 * so its rows carry no clustering fingerprint and are comparable across a
 * boundary a theme's are not. `judge_version` is stamped instead, and it is the
 * column a cross-month comparison has to match on.
 */
export function subjectMonthSide(
  admin: SupabaseClient,
  clientId: string,
  judgeVersion: string = JUDGE_VERSION,
): NumeratorSide {
  return {
    table: MONTH_SUBJECT_TABLE,
    clustering: false,
    stamp: { judge_version: judgeVersion },
    read: async (window: { from: string; to: string }) =>
      (await readSubjectMonths(admin, clientId, window)) as unknown as ({ month: string; audience: string } & Record<string, unknown>)[],
  }
}
