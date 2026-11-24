import { SCHEDULE_CLAIM_STALE_MS } from '../config'
import type { EmailAttachment } from '../email'
import { sendsBlockArtefact, sendsWeeklyRead } from './artefact'
import type { ScheduleRow } from './types'

/** The pure rules of the runner (lib/schedules/run.ts), kept apart from it
 *  so they can be tested without the render and email modules. */

export interface ExistingSend { id: string; status: string; claimed_at: string; ready_at?: string | null }
export type ClaimDecision = 'already_sent' | 'waiting' | 'skipped' | 'takeover'

/** What to do with the row that already exists for (schedule, run): sent →
 *  never again; ready → it is built and waiting for a person, which is not
 *  abandoned work (taking it over would throw away a reviewed brief, and its
 *  edits with it, and pay to write another); a claim younger than the stale
 *  window → someone is on it; failed / skipped / a stale claim → take over. */
export function claimDecision(row: ExistingSend, now = Date.now()): ClaimDecision {
  if (row.status === 'sent') return 'already_sent'
  if (row.status === 'ready') return 'waiting'
  if (row.status === 'claimed' && now - new Date(row.claimed_at).getTime() < SCHEDULE_CLAIM_STALE_MS) return 'skipped'
  return 'takeover'
}

/**
 * A CLAIM LEFT BY AN ATTEMPT THAT DIED (22 Nov: Sealand's weekly issue). The
 * route that claimed it was killed at its 300 s without marking the row, the
 * `send:<scheduleId>` step's retry found the claim young, answered skipped
 * (200), and Inngest recorded success: nothing ever looked at the row again.
 *
 * The runner's answer to a young claim, then, where it may come back for it:
 * 'in_progress' (the route answers 409, and the step retries at
 * `claimRetryAt`, when `claimDecision` calls the claim stale and every route
 * that could hold it, 300 s at most, is long dead). Only where coming back
 * can email nobody twice (`holds`): a schedule that stands its build `ready`
 * before any email to anyone (every weekly read, and a block artefact under
 * review), on a row that never stood `ready`, so the dead attempt emailed
 * nobody. A row that stood ready and is claimed again is a delivery, which
 * may have emailed the list before it died: never rebuilt here, young or
 * stale (the Studio offers its Send once the claim is cold). Every other
 * schedule (a document build holds its claim for many minutes in Inngest and
 * fails it itself; a digest or a block artefact without review emails the list
 * before its row records anything) answers exactly as before. Pure.
 */
export type RunnerClaimDecision = ClaimDecision | 'in_progress'

export function runnerClaimDecision(row: ExistingSend, holds: boolean, now = Date.now()): RunnerClaimDecision {
  const decision = claimDecision(row, now)
  if (!holds || row.status !== 'claimed') return decision
  if (row.ready_at) return 'skipped'
  return decision === 'skipped' ? 'in_progress' : decision
}

/** Whether a schedule's every email waits on its build standing `ready`
 *  (`runnerClaimDecision`): the weekly read on every path, a block artefact
 *  under review. Never a document or a digest: those need their report. */
export function holdsBeforeEmail(schedule: Pick<ScheduleRow, 'starter_key' | 'review'> & { artefact?: string | null }): boolean {
  return sendsWeeklyRead(schedule) || (schedule.review && sendsBlockArtefact(schedule))
}

/** When a claim made at `claimedAt` is stale for `claimDecision`, and a
 *  minute more for the clocks: the time a retry may come back and take it. */
export function claimRetryAt(claimedAt: string | number): string {
  return new Date(new Date(claimedAt).getTime() + SCHEDULE_CLAIM_STALE_MS + 60_000).toISOString()
}

/**
 * HOW ONE RUN'S WEEKLY READ GOES OUT (5 Oct; Heinrich: "a finished run
 * reaches the platform by itself; review holds ONLY the email"). Every path
 * builds the issue and puts it in the client's past issues at once
 * (`publishSend`), before any email; what differs is who is emailed:
 *
 *   'send'   review off, a list, an update allowed to email: the list gets it
 *            (through `deliverSend`, after the publish, so a refused email
 *            leaves it on the platform and waiting for Send);
 *   'review' review on, a list, an update allowed to email: the review email
 *            to the reviewer (`reviewAudience`), and the list waits for Send;
 *   'hold'   nobody is emailed at all: an update that may email nobody (a
 *            manual run, or a schedule that is not due), or a schedule with
 *            nobody on its list, where there is nothing for Send to do.
 *
 * Pure: the runner asks it once (lib/schedules/run.ts).
 */
export type WeeklyReadPath = 'send' | 'review' | 'hold'

export function weeklyReadPath(schedule: { review: boolean; recipients: readonly string[] }, noEmail = false): WeeklyReadPath {
  if (noEmail || schedule.recipients.length === 0) return 'hold'
  return schedule.review ? 'review' : 'send'
}

/** Inline images the email did not reference (a tile that rendered its
 *  honest empty line has no picture to show) must not travel as stray
 *  attachments. */
export function pruneInlineImages(html: string, attachments: EmailAttachment[]): EmailAttachment[] {
  return attachments.filter((a) => !a.contentId || html.includes(`cid:${a.contentId}`))
}
