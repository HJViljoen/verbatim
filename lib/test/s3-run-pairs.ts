import type { PairRow } from '../reading/comparability'

// Sealand's month pairs as the deploy-4 comparability step stores them, for
// the comparable-only anomaly baseline (WP3.4). August against September is
// real; the later rows are HYPOTHETICAL, built from real counts and named so
// (the lib/test/pair-fixture.ts convention): no pair after September has been
// measured yet.

/** August against September, the real WP1.4 measure: 81 of 351 and 206 of
 *  625 category videos outside the searches both months ran (CQ F27, GC F29);
 *  depth 23 against 15 (DR F39). Refused on the searches. */
export const AUG_SEP: PairRow = {
  prevMonth: '2026-08-01', month: '2026-09-01',
  searchOutside: { prev: { k: 81, n: 351 }, curr: { k: 206, n: 625 } },
  codeChanges: [], depth: { prevMedian: 23, currMedian: 15 }, gather: [], lateCapture: null,
  readThroughRun: 'run-2026-10-04', methodVersion: 'mf1_v1', computedAt: '2026-10-05T09:00:00.000Z',
}

/** September against October. HYPOTHETICAL: the 187 September videos found
 *  only by the 13 Sep terms (CQ F27, by last surfacing), which did not run
 *  through the whole of September, stay outside; October's side borrows
 *  August's real 377 market videos with none outside (no search changed
 *  since 20 Sep). Refused on the searches. */
export const SEP_OCT: PairRow = {
  prevMonth: '2026-09-01', month: '2026-10-01',
  searchOutside: { prev: { k: 187, n: 625 }, curr: { k: 0, n: 377 } },
  codeChanges: [], depth: { prevMedian: 15, currMedian: 23 }, gather: [], lateCapture: null,
  readThroughRun: 'run-2026-11-01', methodVersion: 'mf1_v1', computedAt: '2026-11-01T07:10:00.000Z',
}

/** A pair read the same way, as lib/test/pair-fixture.ts's
 *  HYPOTHETICAL_SAME_WAY: August's real 377 videos and 23-comment median
 *  re-dated to both months, and ZERO outside the searches (HYPOTHETICAL: what
 *  a month with no search change should show). */
export function sameWay(prevMonth: string, month: string, readThroughRun: string, computedAt: string): PairRow {
  return {
    prevMonth, month,
    searchOutside: { prev: { k: 0, n: 377 }, curr: { k: 0, n: 377 } },
    codeChanges: [], depth: { prevMedian: 23, currMedian: 23 }, gather: [], lateCapture: null,
    readThroughRun, methodVersion: 'mf1_v1', computedAt,
  }
}

/** A PairRow as month_pair_comparability stores it (measure-comparability's
 *  insert shape), for the in-memory admin client. */
export function storedPair(r: PairRow, clientId: string): Record<string, unknown> {
  return {
    client_id: clientId, prev_month: r.prevMonth, month: r.month,
    search_outside_prev: r.searchOutside.prev.k, videos_prev: r.searchOutside.prev.n,
    search_outside_curr: r.searchOutside.curr.k, videos_curr: r.searchOutside.curr.n,
    code_changes: r.codeChanges.map((c) => ({ change_id: c.changeId, surface: c.surface, prev: c.prev, curr: c.curr })),
    depth_prev_median: r.depth.prevMedian, depth_curr_median: r.depth.currMedian,
    gather: [], late_capture: null, read_through_run: r.readThroughRun, method_version: r.methodVersion, computed_at: r.computedAt,
  }
}
