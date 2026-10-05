import { sendAlertEmail } from '../email'
import type { ScheduleRow } from './types'

/**
 * THE OPERATOR HEARS AT ONCE (writing back, review L1). Before this, a weekly
 * read that failed on its way out, on the review path or the send path, was
 * marked `failed` on its send row and logged; the operator heard only from the
 * next morning's ops check (`report_missed`), a day late on the one report a
 * client waits for. Every outcome below goes to ALERT_EMAIL straight away,
 * through the same alert email every operator alert uses. Never throws: an
 * alert that cannot be sent must not mask the failure it reports.
 */

export type WeeklyReadAlertKind =
  /** No ready read for the update: nothing was sent (the send rule). */
  | 'not_sent'
  /** Building, holding for review or emailing it failed. */
  | 'failed'
  /** Held for review, but the review email did not go out. */
  | 'review_unsent'
  /** The operator's Send (or the delivery after it) failed; it waits again. */
  | 'delivery_failed'
  /** Built and held, and it could not be put in the client's past issues. */
  | 'unpublished'

const SUBJECT: Record<WeeklyReadAlertKind, string> = {
  not_sent: 'Verbatim weekly read not sent',
  failed: 'Verbatim weekly read failed on its way out',
  review_unsent: 'Verbatim weekly read waiting for review (the review email did not go)',
  delivery_failed: 'Verbatim weekly read did not reach its list',
  unpublished: 'Verbatim weekly read built, and not in the past issues',
}

const NEXT: Record<WeeklyReadAlertKind, string> = {
  not_sent: 'To send this week\'s read once it exists: from verbatim-hotfix, node --env-file=.env.local --import tsx scripts/week-read.ts --client {client} --run {run} (dry), then again with --write; then Send now on this schedule in the Studio.',
  failed: 'Nothing reached the list. Open the schedule in the Studio (view the workspace first): Send now builds it again and holds it for review.',
  review_unsent: 'It is built and held. Open the schedule in the Studio (view the workspace first), read the email and press Send.',
  delivery_failed: 'It is held again with the reason. Open the schedule in the Studio (view the workspace first) and press Send again once the cause is fixed.',
  unpublished: 'It is built and held. The update\'s step retries it twice and then nothing does (Send now in the Studio does not retry at all). If it is not in the past issues when you look, open the schedule in the Studio (view the workspace first) and press "Add to past issues (not emailed)".',
}

/** The alert's subject and text. Pure. */
export function weeklyReadAlert(kind: WeeklyReadAlertKind, a: {
  schedule: Pick<ScheduleRow, 'id' | 'name' | 'client_id' | 'recipients'>
  runId: string | null
  company?: string | null
  reason: string
}): { subject: string; text: string } {
  const who = a.company?.trim() || a.schedule.client_id
  const n = a.schedule.recipients.length
  return {
    subject: `${SUBJECT[kind]}: ${who}`,
    text: [
      a.reason,
      '',
      `Schedule: ${a.schedule.name} (${a.schedule.id}), ${n} recipient${n === 1 ? '' : 's'}.${kind === 'delivery_failed' ? '' : ' Nobody on the list was emailed.'}`,
      `Run: ${a.runId ?? 'unknown'}`,
      `Client: ${who} (${a.schedule.client_id})`,
      '',
      NEXT[kind].replace('{client}', a.schedule.client_id).replace('{run}', a.runId ?? '<run id>'),
    ].join('\n'),
  }
}

/** Send it. Never throws. */
export async function alertWeeklyRead(kind: WeeklyReadAlertKind, a: Parameters<typeof weeklyReadAlert>[1]): Promise<void> {
  const { subject, text } = weeklyReadAlert(kind, a)
  await sendAlertEmail(subject, text).catch(() => ({ sent: false }))
}
