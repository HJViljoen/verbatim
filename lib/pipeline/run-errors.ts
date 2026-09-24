/**
 * Run-error bookkeeping for the pipeline's non-fatal steps.
 *
 * A pipeline run degrades rather than dies: a step that exhausts its retries is
 * caught, counted, and the run closes 'partial'. Until 2026-08-16 that count was
 * the ONLY record — the reason lived in a console line that the host's log
 * retention dropped within the hour, so a partial run was indistinguishable from
 * any other partial run after the fact. These helpers shape what close-run
 * persists to `pipeline_runs.errors` / `.error_message`.
 */

/**
 * How a run that reached close-run reports itself: any recorded step error
 * demotes 'completed' to 'partial'.
 *
 * The rule was always this, but it lived as a bare ternary written twice in
 * pipeline.ts (the status write and the function's return value), so "did this
 * run close honestly?" could only be answered by reading the orchestrator. It is
 * named and tested here because it is the load-bearing half of the 2026-09-13
 * finding: run d346b0f7 closed 'completed' with errors: [] while six writes and
 * three Apify batches failed inside its window — the rule was right and the
 * catch sites simply never told it anything.
 */
export function runCloseStatus(totalErrors: number): 'completed' | 'partial' {
  return totalErrors > 0 ? 'partial' : 'completed'
}

/** Hard cap on stored error strings. A pathological run (every comment batch
 *  failing) must not write an unbounded jsonb blob; the count in
 *  error_message stays honest past the cap. */
export const RUN_ERROR_CAP = 50

/**
 * One-line summary of a run's step errors, grouped by step label.
 *
 * `total` is the true error count, which can exceed `recorded.length` once the
 * cap bites — the summary says so rather than under-reporting.
 * Returns null for a clean run so error_message stays NULL.
 */
export function summariseRunErrors(total: number, recorded: string[]): string | null {
  if (total <= 0) return null

  const counts = new Map<string, number>()
  for (const entry of recorded) {
    const label = entry.split(': ')[0]
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }

  const parts = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([label, n]) => (n > 1 ? `${label} ×${n}` : label))

  const noun = total === 1 ? 'step error' : 'step errors'
  if (!parts.length) return `${total} ${noun}`

  const truncated = total > recorded.length ? ` (first ${recorded.length} recorded)` : ''
  return `${total} ${noun}${truncated}: ${parts.join(', ')}`
}

/**
 * What close-run writes to `pipeline_runs.errors`: the counted step errors,
 * plus the sub-threshold FINDINGS a degraded run should carry with them.
 *
 * A finding is something a step decided not to count — a handful of caption
 * batches the isolation pass recovered, say. The ratio gates that produce them
 * exist so a whole run is not called `partial` over an ordinary Apify day, and
 * that judgement is kept: a finding never reaches `totalErrors` and so never
 * changes the status. What it does now is ride along once the run is ALREADY
 * partial for some other reason, because that is the run someone is about to
 * read, and on 2026-09-20 they read one line about an Instagram census while
 * nine caption actor runs had failed inside the same window with nothing on
 * the row to say so.
 *
 * A CLEAN RUN STAYS SILENT. `errors` non-empty beside `status = 'completed'`
 * is the inversion run d346b0f7 was found for, read backwards; a finding on a
 * run with nothing wrong belongs in the log, where the step already put it.
 */
export function closingErrors(totalErrors: number, recorded: string[], findings: string[]): string[] {
  if (totalErrors <= 0 || findings.length === 0) return recorded
  return [...recorded, ...findings].slice(0, RUN_ERROR_CAP)
}

/** How many recorded errors the partial-run alert lists inline. The full
 *  (RUN_ERROR_CAP-bounded) list is always in pipeline_runs.errors; the email
 *  only needs enough to name the failing step(s) at a glance. */
export const ALERT_ERROR_LIST_CAP = 15

/**
 * What a closed run failed to leave behind, as sentences.
 *
 * The rule the ops check has applied to 'completed' runs since WP2, lifted out
 * of `assessPipelineHealth` unchanged so the partial-run alert can state the
 * same thing (`lib/ops/health.ts` imports it back and is its only other
 * caller). Deliberately here rather than there: `lib/ops/health.ts` already
 * imports from `lib/pipeline`, so the rule living at the bottom is the
 * direction that does not close a circle.
 *
 * It is stated for a 'partial' run too, and that is the 2026-09-20 finding.
 * `run_incomplete` fires on 'completed' only, on the reasoning that a partial
 * run has already emailed — but the email said nothing about rows, so a run
 * that closed partial for one reason and ALSO wrote no recommendations
 * announced only the first. The finding stays 'completed'-only; the alert
 * carries the counts.
 *
 * `themeRegistry` gates the observations arm: before the flag, observations
 * were not written at all, and a feature's age is not an incident.
 */
export function missingRunRows(
  counts: {
    observations: number
    recommendations: number
    costs: number
    ungroundedRecommendations?: number
  },
  opts: { themeRegistry?: boolean } = {},
): string[] {
  const missing: string[] = []
  if (opts.themeRegistry === true && counts.observations === 0) {
    missing.push('no theme observations — the trend series has no point for this update')
  }
  if (counts.recommendations === 0) missing.push('no recommendations')
  // Presence is not groundedness. A retried synthesis that fails at D-b keeps
  // the previous attempt's recommendations, whose `based_on` ids point at
  // market insights this run deleted and reinserted under fresh ids — a
  // non-zero count of rows the client reads with no evidence behind any of
  // them. Only when ALL of them are dangling: one recommendation whose
  // references the parser rejected is an ordinary bad day for the model, not
  // an incomplete run.
  else if (
    counts.ungroundedRecommendations !== undefined &&
    counts.ungroundedRecommendations === counts.recommendations
  ) {
    missing.push(
      `${counts.recommendations} recommendations that cite no insight this run has — ` +
      'a retried synthesis left the previous attempt\'s rows behind, and they render ungrounded',
    )
  }
  // Written after close-run and .catch()-ed, so its absence cannot show up in
  // the status: a run that cost money and recorded none looks free.
  if (counts.costs === 0) missing.push('no run_costs row — what this update spent is unrecorded')
  return missing
}

/**
 * Operator alert for a run that closed 'partial'.
 *
 * Until 2026-08-16 only 'failed' and zero-video runs alerted, so a degraded
 * run — report delivered, side-layer silently dead — looked identical to a
 * clean one in the inbox. That is exactly how the first scheduled run's dead
 * owned layer went unnoticed. The email carries the same summary close-run
 * persists, so the operator sees the failing step without opening the DB.
 */
export function partialRunAlert(input: {
  runId: string
  clientName: string
  total: number
  recorded: string[]
  reportSent: boolean
  /** Sub-threshold findings (`closingErrors`). Listed under their own heading
   *  rather than folded into `recorded`, so "N step errors" keeps counting
   *  steps that failed and a thing a ratio gate forgave is not dressed up as
   *  one that did. */
  findings?: string[]
  /** What the run left behind, counted at close (`missingRunRows`). Absent
   *  means the counts could not be read — said out loud rather than printed as
   *  zeroes, because "we did not look" and "there is nothing there" are the
   *  two answers this email exists to tell apart. */
  rows?: { observations: number; recommendations: number; costs: number; ungroundedRecommendations?: number } | null
  /** The run's own flag, for the observations arm of that rule. */
  themeRegistry?: boolean
}): { subject: string; text: string } {
  const { runId, clientName, total, recorded, reportSent } = input
  const listed = recorded.slice(0, ALERT_ERROR_LIST_CAP).map((e) => `- ${e}`)
  const rest = recorded.length - listed.length
  if (rest > 0) listed.push(`…and ${rest} more in pipeline_runs.errors`)

  // The row counts, always — a partial run whose steps all reported one thing
  // while the record came out empty is exactly the run this section is for,
  // and an unconditional line means "nothing missing" is also stated.
  const missing = input.rows ? missingRunRows(input.rows, { themeRegistry: input.themeRegistry }) : null
  const rowLines = input.rows === undefined || input.rows === null
    ? ['- (not counted — reading them failed; check pipeline_runs by hand)']
    : missing && missing.length
      ? missing.map((m) => `- ${m}`)
      : [
        `- nothing missing (${input.rows.observations} theme observations, ` +
        `${input.rows.recommendations} recommendations, ${input.rows.costs} run_costs row)`,
      ]

  const text = [
    `Run ${runId} for ${clientName} completed but closed PARTIAL: ${total} step${total === 1 ? '' : 's'} failed after retries.`,
    reportSent
      ? 'The client report was still sent — the core loop finished; the steps below degraded silently.'
      : 'No client report was requested for this run.',
    '',
    `Summary: ${summariseRunErrors(total, recorded) ?? `${total} step errors`}`,
    '',
    'Errors:',
    ...(listed.length ? listed : ['- (none recorded)']),
    ...(input.findings?.length
      ? ['', 'Also seen, under their ratio and not counted:', ...input.findings.map((f) => `- ${f}`)]
      : []),
    '',
    'What the run left behind:',
    ...rowLines,
    '',
    'Full list: pipeline_runs.errors / error_message. Owned-layer step named? → scripts/diagnose-owned.ts.',
  ].join('\n')

  return { subject: `Verbatim run PARTIAL — ${clientName}`, text }
}

/**
 * Recovered caption batches, ratio-gated the way per-video translate/OCR
 * failures are (2026-09-13). A run-failed caption batch that the isolation pass
 * re-fetched id-by-id cost Apify money but lost no data, and a few of them is an
 * ordinary Apify day (3 of 37 on run d346b0f7) — closing such a run 'partial'
 * would tell the client their update is thin when it is whole. Past `ratio` the
 * actor itself is suspect, and that the run should say.
 */
export function isolatedBatchDegradation(isolated: number, total: number, ratio: number): string | null {
  if (isolated <= 0) return null
  const share = total > 0 ? isolated / total : 1
  if (share <= ratio) return null
  return `${isolated} of ${total} caption batches run-failed and were recovered id-by-id (${Math.round(share * 100)}%)`
}

/**
 * Pass A degradation rule (Tier 0, 2026-08-18): the run is degraded when any
 * live call died on a 429, or when failed calls exceed `ratio` of attempts.
 * Returns the one-line reason to record via noteError, or null when the run
 * may still close clean (the failed videos are simply re-read next run).
 */
export function passADegradation(
  a: { attempted: number; errored: number; rateLimited: boolean; firstError?: string },
  ratio: number,
): string | null {
  if (a.errored <= 0) return null
  const share = a.attempted > 0 ? a.errored / a.attempted : 1
  const degraded = a.rateLimited || share > ratio
  if (!degraded) return null
  const pct = Math.round(share * 100)
  const why = a.rateLimited ? ' incl. a 429 (rate limit / credits)' : ''
  const first = a.firstError ? ` — first: ${a.firstError}` : ''
  return `${a.errored} of ${a.attempted} video calls failed (${pct}%)${why}${first}`
}
