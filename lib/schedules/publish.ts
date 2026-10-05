import type { SupabaseClient } from '@supabase/supabase-js'

import { recordConfigChange, type ConfigActor } from '../config-log'
import { snapshotWeeklyRead, WeeklyReadNotReadyError } from '../reports/weekly-read-build'
import { sendsWeeklyRead } from './artefact'
import { isMissingPublishColumns } from './platform-state'
import type { ScheduleRow } from './types'

/**
 * ON THE PLATFORM, NOT EMAILED (the backfill, 1 Oct evening; lead's ruling 3;
 * migration 20261106090000_platform_publish.sql).
 *
 * A review schedule's build stands as a `ready` send until Heinrich presses
 * Send, and its email reaches nobody until then. Its READS do not wait: the
 * pages print the newest ready read as soon as the run writes it
 * (`loadPublishedWeekRead` / `loadPublishedLongRun`, 5 Oct). Publishing puts
 * the held build itself on the client's platform, an issue in the Studio's
 * past issues with its viewer, PDF and share link, WITHOUT emailing anyone.
 *
 * THE RUNNER DOES IT ITSELF SINCE 5 OCT (Heinrich: "a finished run reaches
 * the platform by itself; review holds ONLY the email"). Every weekly read
 * `runSchedule` builds, scheduled or manual, review on or off, with a list or
 * without, is published here the moment it is held, with the pipeline as the
 * actor (or the person or script that fired it), before any review email. By
 * hand it is the operator's alone (the route asks `mayBuildReports`; the
 * script is his paste), for a build held before then or one whose publishing
 * failed.
 *
 * A RECORDED STATE OF ITS OWN, NEVER A FAKE SEND. `published_at` and
 * `published_by` on the send row; the status stays `ready`, so Send still
 * emails it exactly as before and every rule that reads the status (the
 * claim, the cadence check, the ops check) reads what it read before. A
 * build is ON THE PLATFORM when it was emailed (`sent`) or published
 * (`onPlatform`, lib/schedules/platform-state.ts).
 */

// ---- Publishing --------------------------------------------------------------------------

export type PublishOutcome =
  | { status: 'published'; sendId: string; publishedAt: string }
  /** On the platform already (published before, or emailed): nothing moved. */
  | { status: 'already'; sendId: string; why: 'published' | 'sent' }
  | { status: 'refused'; error: string }

/** The send row fields publishing reads. */
interface PublishRow {
  id: string
  client_id: string
  schedule_id: string | null
  run_id: string | null
  snapshot_id: string | null
  status: string
  subject: string | null
  published_at: string | null
}

/** Why a send row may not be published, or null where it may. Pure: the
 *  route and the script both ask it before the write.
 *   · only a BUILT build (a snapshot behind it): there is nothing else to show;
 *   · only one that is held (`ready`): a `sent` one is on the platform already,
 *     and a `claimed`, `failed` or `skipped` one is not a finished build;
 *   · only a weekly read's: that is what the pages print (the briefs are not
 *     built, and an arranged report has no page of its own). */
export function publishRefusal(row: Pick<PublishRow, 'status' | 'snapshot_id'>, schedule: Pick<ScheduleRow, 'starter_key'> & { artefact?: string | null } | null): string | null {
  if (!schedule) return 'The schedule this send belonged to was removed.'
  if (!sendsWeeklyRead(schedule)) return 'Only the weekly read can be put on the platform without its email.'
  if (!row.snapshot_id) return 'This send did not build, so there is nothing to publish.'
  if (row.status === 'claimed') return 'It is being sent right now.'
  if (row.status !== 'ready' && row.status !== 'sent') return 'Only a build that is ready for review can be put on the platform.'
  return null
}

/**
 * Put one held weekly build on the platform, without an email. Idempotent:
 * a build already published or already emailed is `already`, and nothing is
 * written. The write is a compare-and-set on `ready` and `published_at is
 * null`, so two presses publish once. The actor is recorded twice: on the row
 * (`published_by`, the operator's user id; null for a script) and in
 * `config_changes` (surface `schedule`, field `published`), which carries the
 * script's command where there is no user.
 */
export async function publishSend(
  admin: SupabaseClient,
  a: { clientId: string; sendId: string; scheduleId?: string; by: string | null; actor: ConfigActor; now?: Date },
): Promise<PublishOutcome> {
  const res = await admin.from('report_sends')
    .select('id, client_id, schedule_id, run_id, snapshot_id, status, subject, published_at')
    .eq('id', a.sendId).eq('client_id', a.clientId).maybeSingle()
  if (res.error) {
    if (isMissingPublishColumns(res.error)) return { status: 'refused', error: 'The platform state is not in this database yet (migration 20261106090000_platform_publish.sql).' }
    return { status: 'refused', error: `The send could not be read: ${res.error.message}` }
  }
  const row = res.data as PublishRow | null
  if (!row || (a.scheduleId && row.schedule_id !== a.scheduleId)) return { status: 'refused', error: 'No such send.' }
  if (row.published_at) return { status: 'already', sendId: row.id, why: 'published' }
  if (row.status === 'sent') return { status: 'already', sendId: row.id, why: 'sent' }

  const sched = row.schedule_id
    ? await admin.from('report_schedules').select('id, starter_key, artefact').eq('id', row.schedule_id).eq('client_id', a.clientId).maybeSingle()
    : { data: null, error: null }
  if (sched.error) return { status: 'refused', error: `The schedule could not be read: ${sched.error.message}` }
  const refusal = publishRefusal(row, sched.data as (Pick<ScheduleRow, 'starter_key'> & { artefact?: string | null }) | null)
  if (refusal) return { status: 'refused', error: refusal }

  const publishedAt = (a.now ?? new Date()).toISOString()
  const upd = await admin.from('report_sends')
    .update({ published_at: publishedAt, published_by: a.by })
    .eq('id', row.id).eq('client_id', a.clientId).eq('status', 'ready').is('published_at', null)
    .select('id').maybeSingle()
  if (upd.error) return { status: 'refused', error: `The send could not be published: ${upd.error.message}` }
  if (!upd.data) return { status: 'refused', error: 'It changed while publishing (sent, or published by someone else). Look again.' }

  await recordConfigChange(admin, {
    clientId: a.clientId,
    surface: 'schedule',
    field: 'published',
    before: { status: row.status, published_at: null },
    after: { status: row.status, published_at: publishedAt },
    actor: a.actor,
    runId: row.run_id,
    note: `"${row.subject ?? 'The weekly read'}" put on the platform without its email (send ${row.id}).`,
  })
  return { status: 'published', sendId: row.id, publishedAt }
}

// ---- A held build, without the review email (the backfill) --------------------------------

export type HoldOutcome =
  | { status: 'held'; sendId: string; snapshotId: string; subject: string }
  /** Built already: the row for (schedule, run) stands, in this status. */
  | { status: 'exists'; sendId: string; sendStatus: string }
  | { status: 'skipped'; sendId?: string; error: string }
  | { status: 'failed'; sendId?: string; error: string }

/**
 * The review path's build for one run, WITHOUT its review email: claim the
 * (schedule, run) send, freeze the run's stored week read into its snapshot
 * (`snapshotWeeklyRead`, no model call, no render), and stand it as `ready`.
 * Exactly what `runSchedule` does for a weekly read under review (a review
 * build renders no PDF and mints no share link), minus `readyForReview`'s
 * email: the operator who runs the backfill reads every line of it in the dry
 * run, and nobody else is told anything.
 *
 * Idempotent: a row that exists for (schedule, run) is left as it is
 * (`exists`). A read that may not go out (thin, failed, missing) builds
 * nothing and marks the claim skipped, as the schedule would. A failure after
 * the snapshot exists deletes it (the orphan rule) and marks the send failed.
 */
export async function holdWeeklyRead(
  admin: SupabaseClient,
  a: { schedule: ScheduleRow; runId: string; company: string; now?: Date },
): Promise<HoldOutcome> {
  if (!sendsWeeklyRead(a.schedule)) return { status: 'failed', error: 'This schedule does not send the weekly read.' }
  const existing = await admin.from('report_sends').select('id, status').eq('schedule_id', a.schedule.id).eq('run_id', a.runId).maybeSingle()
  if (existing.error) return { status: 'failed', error: `The send could not be read: ${existing.error.message}` }
  if (existing.data) return { status: 'exists', sendId: String((existing.data as { id: string }).id), sendStatus: String((existing.data as { status: string }).status) }

  // Imported here, not at the top: the runner pulls in the renderers, which
  // nothing else in this module (or its tests) needs.
  const { claimSend } = await import('./run')
  const claim = await claimSend(admin, a.schedule, a.runId)
  if (claim.status !== 'claimed') return { status: 'exists', sendId: claim.id, sendStatus: claim.status }
  const sendId = claim.id
  const mark = (status: 'failed' | 'skipped', error: string) =>
    admin.from('report_sends').update({ status, error: error.slice(0, 500) }).eq('id', sendId)

  let snapshotId: string | null = null
  try {
    const built = await snapshotWeeklyRead({ admin, clientId: a.schedule.client_id, runId: a.runId, company: a.company, userId: null })
    snapshotId = built.snapshotId
    const up = await admin.from('report_sends')
      .update({ snapshot_id: built.snapshotId, status: 'ready', ready_at: (a.now ?? new Date()).toISOString(), error: null, subject: built.data.subject })
      .eq('id', sendId)
    if (up.error) throw new Error(`the send could not be held: ${up.error.message}`)
    return { status: 'held', sendId, snapshotId: built.snapshotId, subject: built.data.subject }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    if (e instanceof WeeklyReadNotReadyError) {
      await mark('skipped', error)
      return { status: 'skipped', sendId, error }
    }
    if (snapshotId) await admin.from('report_snapshots').delete().eq('id', snapshotId)
    await mark('failed', error)
    return { status: 'failed', sendId, error }
  }
}
