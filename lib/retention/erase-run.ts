// The order an erasure request runs in (scripts/erase-commenter.ts), and what
// a failed step does to the rest. Review, 9 Nov: a scrub that threw after the
// comments were deleted skipped the suppression after it, and a re-run then
// found no comments, so it never scrubbed either.
//
// THE ORDER, AND WHY.
//   1. Suppression first: it needs only the handle, and a re-scrape must never
//      bring the handle back whatever fails after it.
//   2. Every scrub of stored text, each on its own: one that throws is logged
//      and the next one runs.
//   3. The comments are deleted LAST, and only where every scrub succeeded:
//      a scrub needs the comment's words to find them, so while one has failed
//      the comments stay and a re-run finds them and tries everything again.
//      Scrubbing twice changes nothing: the words are already replaced.
//   4. And not while an update is running for one of the workspaces, nor if
//      one started or finished since this erasure began (fresh review, 9 Nov:
//      a run live at the start could write prose after the scrubs and finish
//      before the delete's check). Its passes may have read the comments and
//      written prose from them after the scrubs, and once the comments are
//      deleted nothing can find those words again (the scrubs search by
//      them). The delete waits, the comments stay, and a re-run after the
//      update scrubs what it wrote.

import type { SupabaseClient } from '@supabase/supabase-js'

import { decideOpenRun, type RunningRow } from '../pipeline/run-guard'

export interface EraseStep {
  name: string
  run: () => Promise<void>
}

export interface EraseOutcome {
  /** The steps that threw, in order. */
  failed: string[]
  /** The comments were deleted (every scrub succeeded). */
  erased: boolean
}

export async function runErasure(
  plan: { suppress: EraseStep; scrubs: readonly EraseStep[]; erase: EraseStep },
  log: (line: string) => void = (line) => console.error(line),
): Promise<EraseOutcome> {
  const failed: string[] = []
  const attempt = async (step: EraseStep): Promise<boolean> => {
    try {
      await step.run()
      return true
    } catch (e) {
      failed.push(step.name)
      log(`FAILED: ${step.name}: ${e instanceof Error ? e.message : String(e)}`)
      return false
    }
  }
  await attempt(plan.suppress)
  let scrubbed = true
  for (const step of plan.scrubs) if (!(await attempt(step))) scrubbed = false
  if (!scrubbed) {
    log(`not deleted: the comments stay until every scrub succeeds, so a re-run can find their words (${failed.filter((f) => f !== plan.suppress.name).join(', ')})`)
    return { failed, erased: false }
  }
  const erased = await attempt(plan.erase)
  return { failed, erased }
}

/**
 * What an erasure that did not finish says, last, in place of the reply (the
 * script prints it to stderr and exits 1). Null where every step succeeded.
 * It names the steps that failed, says whether the comments were deleted, and
 * says to re-run, so a failed erasure never reads as a finished one. Pure.
 */
export function unfinishedMessage(outcome: EraseOutcome): string | null {
  if (!outcome.failed.length) return null
  return [
    `ERASURE NOT FINISHED. Failed: ${outcome.failed.join(', ')}.`,
    outcome.erased
      ? 'The comments are deleted.'
      : 'The comments were NOT deleted yet: they stay so that a re-run can find their words.',
    'Fix the cause and re-run this script with the same arguments. Send no reply until a run finishes.',
  ].join(' ')
}

/**
 * The updates running now for these workspaces, by the pipeline's own rule
 * (lib/pipeline/run-guard.ts): a `running` row newer than the stale line. A
 * row past it is an update that died, and does not hold the delete. Pure.
 */
export function updatesInFlight(
  running: readonly (RunningRow & { client_id: string })[],
  now: Date = new Date(),
): { clientId: string; runId: string }[] {
  const byClient = new Map<string, RunningRow[]>()
  for (const r of running) byClient.set(r.client_id, [...(byClient.get(r.client_id) ?? []), { id: r.id, started_at: r.started_at }])
  const out: { clientId: string; runId: string }[] = []
  for (const [clientId, rows] of byClient) {
    const d = decideOpenRun(rows, now)
    if (d.action === 'skip') out.push({ clientId, runId: d.blockingRunId })
  }
  return out
}

export interface RunRow { id: string; client_id: string; status: string; started_at: string; completed_at: string | null }

/** How far before the script's own clock "since the erasure began" reaches:
 *  a run's times are another machine's clock, so the margin errs on the side
 *  of waiting. */
export const ERASURE_CLOCK_MARGIN_MS = 2 * 60_000

/**
 * The updates that hold the delete back (rule 4): one running now (by the
 * pipeline's stale rule), or one that started or finished at or after
 * `since`. Once each. Pure.
 */
export function deleteHeldBy(
  runs: readonly RunRow[],
  since: string,
  now: Date = new Date(),
): { clientId: string; runId: string; why: 'running' | 'started' | 'finished' }[] {
  const out = new Map<string, { clientId: string; runId: string; why: 'running' | 'started' | 'finished' }>()
  const live = new Set(updatesInFlight(runs.filter((r) => r.status === 'running'), now).map((u) => u.runId))
  const at = new Date(since).getTime()
  for (const r of runs) {
    if (out.has(r.id)) continue
    const why = live.has(r.id) ? 'running'
      : new Date(r.started_at).getTime() >= at ? 'started'
      : r.completed_at && new Date(r.completed_at).getTime() >= at ? 'finished'
      : null
    if (why) out.set(r.id, { clientId: r.client_id, runId: r.id, why })
  }
  return [...out.values()]
}

/** These workspaces' runs that are running, or started or finished since
 *  `since`: what `deleteHeldBy` decides over. */
export async function loadRunsSince(admin: SupabaseClient, clientIds: readonly string[], since: string): Promise<RunRow[]> {
  if (!clientIds.length) return []
  const sel = 'id, client_id, status, started_at, completed_at'
  const ids = [...clientIds]
  const reads = await Promise.all([
    admin.from('pipeline_runs').select(sel).in('client_id', ids).eq('status', 'running'),
    admin.from('pipeline_runs').select(sel).in('client_id', ids).gte('started_at', since),
    admin.from('pipeline_runs').select(sel).in('client_id', ids).gte('completed_at', since),
  ])
  const out: RunRow[] = []
  for (const r of reads) {
    if (r.error) throw new Error(`read pipeline_runs: ${(r.error as { message?: string }).message ?? r.error}`)
    out.push(...((r.data ?? []) as RunRow[]))
  }
  return out
}
