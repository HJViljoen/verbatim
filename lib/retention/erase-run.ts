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
