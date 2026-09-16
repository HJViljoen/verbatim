/**
 * Schedules (Reports & Exports Stage 3, 2026-08-30).
 *
 * A schedule names WHAT to send — a starter template by key, or one of the
 * workspace's own templates (a `reports` row) — WHEN (after every scheduled
 * update, or the first update of each month) and TO WHOM (its own list).
 * Firing one produces an ordinary report snapshot, a PDF artifact and a share
 * link, and a `report_sends` row that records ids and timestamps — never the
 * email body (words stay live in the snapshot, as everywhere on the spine).
 */

// 'quarterly' joined the set with the quarterly review (Phase 1 WP16 M8,
// design item 14). A schedule has never had a clock of its own — it rides the
// scheduled update — so a quarter is expressed the way a month already is:
// the first update of a calendar quarter, and nothing until the next one.
export type ScheduleCadence = 'every_update' | 'monthly' | 'quarterly'

export const CADENCE_COPY: { key: ScheduleCadence; label: string; help: string }[] = [
  { key: 'every_update', label: 'Every update', help: 'Goes out after each scheduled update.' },
  { key: 'monthly', label: 'Monthly', help: 'Goes out after the first update of each month.' },
  { key: 'quarterly', label: 'Quarterly', help: 'Goes out after the first update of each quarter.' },
]

/** What the Studio's schedule form OFFERS. It was the two the product could
 *  serve while nothing built a quarterly artefact — an option that produces a
 *  schedule the builder cannot serve is a form that lies. WP20 is the review
 *  that fills it (`snapshotQuarterly`, and the quarterly branch in
 *  `lib/schedules/run.ts`), so the picker is now all three. */
export const CADENCES = CADENCE_COPY

/**
 * The word a subject line uses for a schedule's rhythm — "your {word} update"
 * (`digestSubject`, lib/email/subject.ts).
 *
 * THREE CADENCES, THREE WORDS. Three call sites each wrote
 * `cadence === 'monthly' ? 'monthly' : 'weekly'`, which called a quarterly
 * schedule "weekly". Harmless only for as long as an arranged report is the
 * one artefact that reaches `renderDigestEmail`, and a wrong word one branch
 * away from a send. `every_update` is "weekly" because that is the rhythm the
 * scheduled update actually keeps and what the product has always called it.
 */
export const CADENCE_WORD: Record<ScheduleCadence, string> = {
  every_update: 'weekly',
  monthly: 'monthly',
  quarterly: 'quarterly',
}

/** …and a cadence string off a row, which may be anything the column allows. */
export function cadenceWordOf(cadence: string | null | undefined): string {
  return CADENCE_WORD[cadence as ScheduleCadence] ?? CADENCE_WORD.every_update
}

export interface ScheduleRow {
  id: string
  client_id: string
  name: string
  /** A starter template (lib/reports/templates.ts) … */
  starter_key: string | null
  /** … or one of the workspace's own templates (reports.id). Exactly one is set. */
  report_id: string | null
  cadence: ScheduleCadence
  recipients: string[]
  attach_pdf: boolean
  /** 7 | 30 | 90 | null (never expires) */
  share_days: number | null
  active: boolean
  /** Review before sending: the build waits as a `ready` send until a member delivers it. */
  review: boolean
  /** The workspace's digest: the schedule an accepted invite joins. */
  is_default: boolean
  /** Which artefact this schedule sends — `weekly` | `monthly` | `quarterly` |
   *  `brief:<audience>` (M8, WP16). OPTIONAL because the column is not applied
   *  yet: `lib/schedules/artefact.ts` falls back to the starter key until it
   *  is, and a row that answers nothing sends exactly what it sent before. */
  artefact?: string | null
  last_sent_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type SendStatus = 'claimed' | 'ready' | 'sent' | 'failed' | 'skipped'

export interface SendRow {
  id: string
  client_id: string
  /** Null once the schedule is deleted; schedule_name keeps the archive readable. */
  schedule_id: string | null
  schedule_name: string | null
  run_id: string | null
  snapshot_id: string | null
  artifact_id: string | null
  share_link_id: string | null
  subject: string | null
  recipients: string[]
  status: SendStatus
  error: string | null
  claimed_at: string
  sent_at: string | null
  /** Who pressed Send on a review send (any member may). */
  approved_by: string | null
  ready_at: string | null
}
