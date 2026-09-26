import type { StoredCheck } from '../pages/overview-market/change'
import type { Verdict } from '../reading/verdicts'

// Sealand's re-check of August against September, as scripts/comparability-checks.ts
// planned it on staging on 26 Sep (exec/logs/stg-mf2-checks-plan-2026-09-26.json:
// 114 rows, read through the 20 Sep update, b67b56de). Staging refused the
// write ("2026-09 has not been read past its end"), so these rows exist only
// in that plan; every figure below is copied from it, none invented. The
// outcomes are recheck_v2's (the deploy-3 review): on the same counts, a
// well-read fall must be at most half the whole market's to follow depth, so
// "Asking how it works" (whole market 231 of 377 to 334 of 654, -10.2 pts;
// well-read -6.6) and "Leaving for something else" (36 of 377 to 32 of 654,
// -4.6; well-read -6.1) read no_clear_change, where v1 planned follows_depth.
//
// The populations (the plan's `populations`): on the searches both months ran,
// 78 videos in August and 103 in September once 90 + 131 makers and 35 + 15
// off-topic videos were left out (0.4889 makers, 0.1106 off-topic over both
// months); with 20 or more dated comments, 200 and 271 (0.2866, 0.2102). The
// buyers-only counts are MF1 `market_segment_counts`' 'market' segment on
// staging: July 6, August 146, September 381.

export const RECHECK_RUN = 'b67b56de-17b6-429d-b5f7-e53a3c37f7d4'
/** The 20 Sep update's finish (the dry run's "latest update … of"). */
export const RECHECK_READ_WITH = '2026-09-20T08:33:47.358Z'
export const RECHECK_COMPUTED_AT = '2026-09-26T18:42:46.092Z'
export const RECHECK_BUYERS = { july: 6, august: 146, september: 381 } as const

const AUG = '2026-08-01'
const SEP = '2026-09-01'

type Row = [population: string, kind: string, id: string, label: string, kPrev: number, nPrev: number, kCurr: number, nCurr: number,
  makers: number, noise: number, outcome: string, state: Verdict['state'], changePts: number, bandPts: number]

const ROWS: readonly Row[] = [
  ['same_searches_clean', 'kind', 'question', 'Asking how it works', 50, 78, 52, 103, 0.4889, 0.1106, 'too_few', 'too_little_data', -13.6, 14.7],
  ['same_searches_clean', 'kind', 'pain_point', 'Hitting a problem', 44, 78, 43, 103, 0.4889, 0.1106, 'too_few', 'too_little_data', -14.7, 14.9],
  ['same_searches_clean', 'kind', 'praise', 'Saying it worked', 62, 78, 63, 103, 0.4889, 0.1106, 'too_few', 'too_little_data', -18.3, 13.3],
  ['same_searches_clean', 'kind', 'purchase_intent', 'Ready to buy', 46, 78, 54, 103, 0.4889, 0.1106, 'too_few', 'too_little_data', -6.5, 14.9],
  ['same_searches_clean', 'kind', 'objection', 'Pushing back', 16, 78, 16, 103, 0.4889, 0.1106, 'too_few', 'too_little_data', -5, 11.6],
  ['same_searches_clean', 'kind', 'feature_request', 'Asking for something', 13, 78, 24, 103, 0.4889, 0.1106, 'too_few', 'too_little_data', 6.6, 11.9],
  ['same_searches_clean', 'mood', 'positive', 'Positive', 55, 78, 69, 103, 0.4889, 0.1106, 'too_few', 'too_little_data', -3.5, 13.9],
  ['dense20', 'kind', 'question', 'Asking how it works', 143, 200, 176, 271, 0.2866, 0.2102, 'no_clear_change', 'no_clear_change', -6.6, 8.6],
  ['dense20', 'kind', 'pain_point', 'Hitting a problem', 111, 200, 149, 271, 0.2866, 0.2102, 'no_clear_change', 'no_clear_change', -0.5, 9.3],
  ['dense20', 'kind', 'praise', 'Saying it worked', 178, 200, 233, 271, 0.2866, 0.2102, 'follows_depth', 'no_clear_change', -3, 6.1],
  ['dense20', 'kind', 'purchase_intent', 'Ready to buy', 111, 200, 209, 271, 0.2866, 0.2102, 'moved', 'moved', 21.6, 8.7],
  ['dense20', 'kind', 'objection', 'Pushing back', 63, 200, 75, 271, 0.2866, 0.2102, 'follows_depth', 'no_clear_change', -3.8, 8.5],
  ['dense20', 'kind', 'feature_request', 'Asking for something', 37, 200, 93, 271, 0.2866, 0.2102, 'moved', 'moved', 15.8, 8],
  ['dense20', 'kind', 'switching_signal', 'Leaving for something else', 30, 200, 24, 271, 0.2866, 0.2102, 'no_clear_change', 'no_clear_change', -6.1, 6.1],
  ['dense20', 'mood', 'positive', 'Positive', 122, 200, 202, 271, 0.2866, 0.2102, 'moved', 'moved', 13.5, 8.7],
  ['all_but_noise', 'kind', 'question', 'Asking how it works', 155, 257, 311, 601, 0.321, 0.1678, 'moved', 'moved', -8.6, 7.3],
  ['all_but_noise', 'kind', 'feature_request', 'Asking for something', 53, 257, 144, 601, 0.321, 0.1678, 'no_clear_change', 'no_clear_change', 3.3, 6.1],
]

const verdictOf = (r: Row): Verdict => ({
  objectKind: r[1] as Verdict['objectKind'],
  objectId: r[2],
  objectLabel: r[3],
  audience: 'market',
  window: { kind: 'month', from: SEP, to: '2026-10-01' },
  basis: { from: AUG, to: SEP },
  value: { k: r[6], n: r[7] },
  baseline: { k: r[4], n: r[5] },
  changePts: r[12],
  bandPts: r[13],
  state: r[11],
  flags: [],
})

/** The rows as the page reads them back through PostgREST: the numeric
 *  shares as strings, as `numeric` columns arrive. */
export function recheckRows(over: { computedAt?: string; run?: string | null } = {}): StoredCheck[] {
  return ROWS.map((r) => ({
    prev_month: AUG,
    month: SEP,
    population: r[0],
    object_kind: r[1],
    object_id: r[2],
    k_prev: r[4],
    n_prev: r[5],
    k_curr: r[6],
    n_curr: r[7],
    population_makers: String(r[8]),
    population_noise: String(r[9]),
    verdict: verdictOf(r),
    outcome: r[10],
    read_through_run: over.run === undefined ? RECHECK_RUN : over.run,
    computed_at: over.computedAt ?? RECHECK_COMPUTED_AT,
  }))
}

export const recheckRunFinish = (): Map<string, string> => new Map([[RECHECK_RUN, RECHECK_READ_WITH]])
