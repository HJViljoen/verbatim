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
//   4. And not while an update is running for one of the workspaces: its
//      passes may have read the comments already and write prose from them
//      after the scrubs, and once the comments are deleted nothing can find
//      those words again (the scrubs search by them). The delete waits, the
//      comments stay, and a re-run after the update scrubs what it wrote.

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
