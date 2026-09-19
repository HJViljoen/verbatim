/**
 * What a reader is told when a stored artefact names something this build can
 * no longer draw (fix pass, reports-6).
 *
 * THE SENTENCE EXISTED AND THE PAGES DID NOT USE IT. `staleWeeklySnapshot`
 * already answers this question for a snapshot whose VERSION has moved on, in
 * client wording. Three other sites answered the same question in the
 * developer's — "This report names no section this build knows how to draw",
 * "This section names a block this build does not know how to draw" — and
 * "build" and "block" are both on the jargon list (lib/calibration.ts). On
 * `weekly-deck.tsx` the two sat in ONE expression, `{stale ?? '…this build…'}`,
 * so one reader on one page met one voice or the other depending on which
 * internal version check happened to trip.
 *
 * Both states are reachable and the repo tests them: `weeklyBlocksFor` and
 * `monthlyBlocksFor` each have a test named "drops a key this build no longer
 * knows".
 *
 * NO PIPELINE VOCABULARY, AND NO PROMISE THE PRODUCT CANNOT KEEP. The artefact
 * line names the next SCHEDULED update, which is the thing that will in fact
 * be readable; the section line promises nothing at all, because a brief is
 * built when someone asks for one and nothing rebuilds it on a cadence
 * (`BRIEFS_META`).
 */

/** A whole stored artefact this build cannot redraw. */
export const STALE_ARTEFACT_LINE =
  'This update was built by an older version of Verbatim and cannot be redrawn here. The next scheduled update will be readable.'

/** One section inside an artefact that is otherwise fine. */
export const STALE_SECTION_LINE =
  'This section was built by an older version of Verbatim and cannot be drawn here.'
