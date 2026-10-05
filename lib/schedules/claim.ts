import { SCHEDULE_CLAIM_STALE_MS } from '../config'
import type { EmailAttachment } from '../email'

/** The pure rules of the runner (lib/schedules/run.ts), kept apart from it
 *  so they can be tested without the render and email modules. */

export interface ExistingSend { id: string; status: string; claimed_at: string }
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
