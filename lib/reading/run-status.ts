// A run's status as the rules that judge the UPDATE read it (9 Nov).
//
// Since b30ccd90 a product step out of retries is noteError'd, so a run whose
// only fault is Your products' placements and month rows closes `partial`,
// says so on its row and emails the partial-run alert. Nothing else depends
// on those tables: no gather, no analysis and no other reading. So every rule
// that reads a run's status as "how well did this update go" reads such a run
// as it closed before then, `completed`: a Studio document's thin week
// (lib/reports/documents/compose.ts `thinWeek`), the gathers' run health
// (lib/provenance/searches.ts `gathersOf`: comparability rule 6's `gather`
// reason and the gathers that decide what ran unchanged), the same-age line's
// cadence (lib/reading/week-line.ts `weekCadence`) and the owned-events
// window (lib/pipeline/owned-events.ts). Any other counted error, from any
// step, keeps the run `partial` for all of them, exactly as before: this
// changes no answer for a run that closed before 9 Nov.
//
// It reads `error_message`, never `errors`: the message names the COUNTED
// errors' steps alone (`summariseRunErrors`, lib/pipeline/run-errors.ts),
// while `errors` also carries the sub-threshold findings once a run is
// partial (`closingErrors`). A message cut at the cap ("first 50 recorded")
// or in a shape this does not know keeps the run's own status. Imports
// nothing, so the pipeline, the readings and the reports can all read it.

/** The steps that write only their own tables (Your products). Both are in
 *  AFTER_GATHER_STEPS (lib/reading/week-line.ts); a test pins that. */
export const OWN_TABLE_STEPS: readonly string[] = ['plan-product-readings', 'product-readings']

/** The step labels `summariseRunErrors` names in an `error_message`
 *  ("2 step errors: product-readings ×2"), or null for a message cut at the
 *  cap, a clean run's null, or any other shape. Pure. */
export function countedStepLabels(errorMessage: string | null | undefined): string[] | null {
  const m = /^\d+ step errors?: (.+)$/.exec(errorMessage ?? '')
  if (!m) return null
  return m[1].split(', ').map((part) => part.replace(/ ×\d+$/, '').trim())
}

/** The run's status as the update rules read it: `completed` for a run that
 *  closed partial with every counted error from OWN_TABLE_STEPS, else its
 *  own status. Pure. */
export function updateStatus<S extends string | null>(run: { status: S; error_message?: string | null }): S | 'completed' {
  if (run.status !== 'partial') return run.status
  const labels = countedStepLabels(run.error_message)
  return labels != null && labels.length > 0 && labels.every((l) => OWN_TABLE_STEPS.includes(l)) ? 'completed' : run.status
}
