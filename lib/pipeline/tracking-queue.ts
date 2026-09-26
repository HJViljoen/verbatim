import type { SupabaseClient } from '@supabase/supabase-js'

import { pipelineActor, updateWithActor } from '../config-log'
import { selectAll } from '../supabase-admin'

// Queued tracking edits, applied by the run's open-run (market-first decision
// I; plan WP3.10). While a tenant's tracking is locked, an owner's or admin's
// term, rival or handle edit is not refused but queued (mf/s3-settings writes
// tracking_config_queue, MF3, through the admin client with an actor); a
// change then lands on the 1st of a month, announced as a dated break, and
// never before January 2027, when the October to December reading is whole.
//
// DUE: not applied yet, and the run opens on or after its effective month's
// 1st and on or after 1 January 2027 (QUEUE_EARLIEST), whatever month the row
// names. Of the due edits to one field the newest queued wins; the older are
// stamped as the same application (a change of mind is a newer queued edit,
// and the queue is its own history).
//
// APPLIED WITH AN ACTOR: each field is one tracking_configs UPDATE through
// updateWithActor, stamped with the run and the name the edit was queued by,
// so the audit trigger logs the change of ours with who asked and when it
// landed; then applied_at is stamped, once (the MF3 trigger refuses a second).
// Inside open-run, before the config snapshot, so the run gathers what it
// applied. Never fatal: a failure is logged and the run opens on the config
// as it stands. Inert today: nothing is due before 1 January 2027.

export const QUEUE_TABLE = 'tracking_config_queue'
export const QUEUE_EARLIEST = '2027-01-01'

export interface QueuedEdit {
  id: string
  field: string
  after: unknown
  effective_month: string
  queued_by: string | null
  queued_label: string
  queued_at: string
  applied_at: string | null
}

/** The day an edit may land: its effective month's 1st, never before 1 Jan 2027. */
export const landsOn = (e: Pick<QueuedEdit, 'effective_month'>): string => {
  const first = `${e.effective_month.slice(0, 7)}-01`
  return first < QUEUE_EARLIEST ? QUEUE_EARLIEST : first
}

/** The edits due at `now`: per field the newest queued (applied), and the
 *  older due ones (superseded, stamped with it). PURE. */
export function dueEdits(rows: readonly QueuedEdit[], now: string): { apply: QueuedEdit[]; superseded: QueuedEdit[] } {
  const today = now.slice(0, 10)
  const due = rows.filter((r) => !r.applied_at && landsOn(r) <= today)
    .sort((a, b) => a.queued_at.localeCompare(b.queued_at) || a.id.localeCompare(b.id))
  const newest = new Map<string, QueuedEdit>()
  for (const r of due) newest.set(r.field, r)
  const apply = [...newest.values()]
  const applied = new Set(apply.map((r) => r.id))
  return { apply, superseded: due.filter((r) => !applied.has(r.id)) }
}

export interface QueueResult {
  status: 'not_applied' | 'nothing_due' | 'applied' | 'failed'
  applied: { id: string; field: string; queuedBy: string }[]
  superseded: number
  note: string
}

const isMissing = (e: unknown): boolean => {
  const text = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e)
  return text.includes(QUEUE_TABLE) && /schema cache|does not exist|Could not find/i.test(text)
}

/** Apply what is due. Throws only on an unexpected failure; open-run catches it. */
export async function applyQueuedEdits(admin: SupabaseClient, args: { clientId: string; runId: string; now: string }): Promise<QueueResult> {
  let rows: QueuedEdit[]
  try {
    rows = await selectAll<QueuedEdit>(() => admin.from(QUEUE_TABLE)
      .select('id, field, after, effective_month, queued_by, queued_label, queued_at, applied_at')
      .eq('client_id', args.clientId).is('applied_at', null).order('queued_at').order('id'))
  } catch (e) {
    if (isMissing(e)) return { status: 'not_applied', applied: [], superseded: 0, note: `${QUEUE_TABLE} is not there (MF3 not applied)` }
    throw e
  }
  const { apply, superseded } = dueEdits(rows, args.now)
  if (apply.length === 0) {
    const next = rows.map(landsOn).sort()[0]
    return { status: 'nothing_due', applied: [], superseded: 0, note: rows.length ? `${rows.length} queued, the first lands on ${next}` : 'nothing queued' }
  }
  const applied: QueueResult['applied'] = []
  for (const e of apply) {
    const { error } = await updateWithActor(
      (payload) => admin.from('tracking_configs').update(payload).eq('client_id', args.clientId),
      { [e.field]: e.after },
      // run_id null: open-run applies the edit before this run's own row is
      // inserted, and config_changes.run_id references pipeline_runs; the
      // label names the run instead.
      { ...pipelineActor(args.runId, `queued tracking edit · run ${args.runId} · asked by ${e.queued_label} on ${e.queued_at.slice(0, 10)}`), run_id: null },
    )
    if (error) throw new Error(`queued ${e.field} (${e.id}) not applied: ${(error as { message?: string }).message ?? String(error)}`)
    const ids = [e.id, ...superseded.filter((s) => s.field === e.field).map((s) => s.id)]
    const stamp = await admin.from(QUEUE_TABLE).update({ applied_at: args.now }).eq('client_id', args.clientId).in('id', ids).is('applied_at', null)
    if (stamp.error) throw new Error(`queued ${e.field} applied, but applied_at not stamped: ${stamp.error.message}`)
    applied.push({ id: e.id, field: e.field, queuedBy: e.queued_label })
  }
  return {
    status: 'applied', applied, superseded: superseded.length,
    note: `applied ${applied.map((a) => `${a.field} (asked by ${a.queuedBy})`).join(', ')}${superseded.length ? `; ${superseded.length} older edits to the same fields superseded` : ''}`,
  }
}
