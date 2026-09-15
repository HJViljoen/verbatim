import type { SupabaseClient } from '@supabase/supabase-js'

import { selectAll } from '../supabase-admin'
import type { NumeratorSide } from '../reading/monthly'
import {
  MONTH_SUBJECT_TABLE,
  RPC_SUBJECT_READINGS,
  RPC_WINDOW_SUBJECT_READINGS,
} from '../reading/types'
import type { SubjectMembershipResult } from './membership'
import {
  JUDGE_VERSION,
  type SubjectReading,
  type SubjectStatus,
  type SubjectWindowReading,
} from './types'

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
// THE BACK-READ IS ONE-SHOT, AND ITS ORDER IS NOT OPTIONAL. 201 audience-months
// were already frozen across the two tenants before this table existed
// (2026-09-15: Ossur 113, Sealand 88). Decision K lets the FIRST write into
// such a month through and freezes it on arrival as `back_read`; from then on
// `mergeMonthRows` refuses every later new subject in that month and the
// database's insert guard refuses it again. Nothing in the pipeline ever
// revisits it — `monthsToRefresh` walks the clock and the stored `filling`
// rows, and a frozen audience-month has neither — so the only path that reads
// history at all is `scripts/monthly-reading.ts --write`.
//
// Which makes the order a one-way door:
//
//   1. every subject the tenant wants is NAMED and CONFIRMED (status 'active');
//   2. the membership backfill has RUN and is complete for each of them
//      (`scripts/subject-membership.ts --apply`: no budget stop, no refusal);
//   3. then, once, `scripts/monthly-reading.ts --write`.
//
// A subject that has no members at that instant writes no row, and its history
// is refused for ever afterwards. `backReadBlockers` below is what the seed
// asks before it spends the one shot, and the seed drops the subject side
// rather than spending it badly.
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
    read: (window: { from: string; to: string }) => readSubjectMonths(admin, clientId, window),
  }
}

// ---- The one-shot back-read ---------------------------------------------------

/** What the seed needs to know about one subject before it writes history. */
export interface SubjectBackReadState {
  id: string
  name: string
  status: SubjectStatus
  /** Membership pairs decided for it at the CURRENT judge version — members and
   *  judged non-members alike. Zero means nothing has judged this subject yet,
   *  so its reading today is not a short reading, it is no reading. */
  decided: number
  /** Pairs still waiting to be decided at this judge version — `subject_band`'s
   *  own answer. Anything above zero is a backfill that has not finished: a
   *  pass that stopped at its ceiling, a batch the model would not answer, or
   *  simply an --apply that was never run. The reading would be short by
   *  whatever they turn out to be, and short is what a frozen month keeps. */
  undecided: number
}

/**
 * Why a one-shot subject back-read must not be spent yet, in sentences.
 *
 * Empty means go. Anything else is a reason the history written now would be
 * the history the tenant is stuck with: every frozen audience-month accepts a
 * subject row exactly once (decision K), and the frozen guard refuses the
 * correction afterwards. A subject that is proposed but not confirmed, or
 * confirmed but never judged, contributes nothing to that write and loses its
 * whole history to it — which is why the seed would rather write no subject
 * months at all than write the wrong ones.
 */
export function backReadBlockers(subjects: readonly SubjectBackReadState[]): string[] {
  const live = subjects.filter((s) => s.status !== 'retired')
  const active = live.filter((s) => s.status === 'active')
  const proposed = live.filter((s) => s.status === 'proposed')
  const out: string[] = []
  if (active.length === 0) {
    out.push(
      'no subject is confirmed yet — a back-read now would write no subject months, ' +
      'and every subject confirmed afterwards would start at the first month still open',
    )
  }
  if (proposed.length > 0) {
    out.push(
      `${proposed.length} named but not confirmed (${proposed.map((s) => s.name).join(', ')}) — ` +
      'confirm the whole set first, because a subject confirmed after the back-read has no history at all',
    )
  }
  const unjudged = active.filter((s) => s.decided === 0)
  if (unjudged.length > 0) {
    out.push(
      `${unjudged.length} confirmed but never judged (${unjudged.map((s) => s.name).join(', ')}) — ` +
      'run scripts/subject-membership.ts --apply to completion first; a subject with no members writes no row, ' +
      'and a month that closes without its row refuses it for ever',
    )
  }
  const partial = active.filter((s) => s.decided > 0 && s.undecided > 0)
  if (partial.length > 0) {
    out.push(
      `${partial.length} judged only in part (` +
      partial.map((s) => `${s.name}: ${s.undecided} pair(s) still undecided`).join(', ') +
      ') — finish scripts/subject-membership.ts --apply; a reading taken now is short by whatever they turn out to be, ' +
      'and short is exactly what a frozen month keeps',
    )
  }
  return out
}

// ---- The link between the judgement and the record ----------------------------

/** What `subjectFreezeHold` needs of a membership pass — the shape of a step's
 *  result, or `null` for a step that ran out of retries. */
export type MembershipOutcome =
  | Pick<SubjectMembershipResult, 'subjectName' | 'skipped' | 'budgetStopped' | 'unanswered'>
  | null

/**
 * Must this visit leave the subject side unwritten?
 *
 * `judgeSubject` refuses rather than under-counts: short embedding coverage
 * writes no membership row at all. That protects the MEMBERSHIP table, and on
 * its own it protects nothing else — memberships persist across runs, so the
 * month reading taken minutes later is not empty, it is SHORT, and freeze-months
 * writes it down and freezes it if the month has passed its 30-day line. The
 * theme side cannot do this: `readThemeReadings(runId)` comes back empty when
 * its pass failed, which trips the emptyReading hold. A subject reading has no
 * such tell.
 *
 * So the tell is this: the pass says what it knows it did not decide, and a
 * visit that hears any of it writes no subject rows at all. The cost is that
 * the months still filling are not refreshed until the next run, which fixes
 * itself; the cost of the other answer is a permanently frozen number that is
 * low by an unknown amount, which does not.
 */
export function subjectFreezeHold(results: readonly MembershipOutcome[]): string | null {
  const reasons: string[] = []
  const failed = results.filter((r) => r === null).length
  if (failed > 0) reasons.push(`${failed} subject(s) ran out of retries`)
  const named = results.filter((r): r is Exclude<MembershipOutcome, null> => r !== null)
  const say = (rows: typeof named, what: string) =>
    rows.length > 0 ? reasons.push(`${what}: ${rows.map((r) => r.subjectName || '(unnamed)').join(', ')}`) : undefined
  say(named.filter((r) => r.skipped === 'coverage_short'), 'refused because the corpus is not embedded enough')
  say(named.filter((r) => r.skipped === 'no_vector'), 'has no phrase vector')
  say(named.filter((r) => r.budgetStopped), 'stopped at the pass ceiling with pairs still undecided')
  const unanswered = named.filter((r) => r.unanswered > 0)
  if (unanswered.length > 0) {
    reasons.push(
      'left pairs undecided (' +
      unanswered.map((r) => `${r.subjectName || '(unnamed)'}: ${r.unanswered}`).join(', ') +
      ')',
    )
  }
  if (reasons.length === 0) return null
  return (
    `${reasons.join('; ')}. The membership on file is short by an amount nobody can state, ` +
    'and a month frozen around it could never be corrected — the frozen guard refuses the UPDATE. ' +
    'Nothing was written for the subjects this visit; the pairs come back next run.'
  )
}
