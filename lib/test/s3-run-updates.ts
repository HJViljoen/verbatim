import type { KeywordRow } from '../provenance/searches'
import type { RunReadRow } from '../provenance/load'
import type { UpdateRun } from '../reading/pairs'

// Sealand's Sunday updates from 27 Sep to 6 Dec (plan §3.0): a run starts at
// 06:00 SAST (04:00 UTC) and takes about 4.5 hours, so an update finishes near
// 08:30 UTC. Every date is the plan's calendar; ids are labels. The search set
// is the one that has run unchanged since 20 Sep (decision I): the six era-A
// terms kept on 9 Sep, the 9 and 13 Sep additions, and the three communities
// (GC F28; the WP0.1 staging export's keyword_performance).

export const SUNDAYS = [
  '2026-09-27', '2026-10-04', '2026-10-11', '2026-10-18', '2026-10-25',
  '2026-11-01', '2026-11-08', '2026-11-15', '2026-11-22', '2026-11-29', '2026-12-06',
] as const

export const runId = (day: string): string => `run-${day}`
export const startedAt = (day: string): string => `${day}T04:00:00.000Z`
export const finishedAt = (day: string): string => `${day}T08:30:00.000Z`
/** When the run's gather wrote its first keyword row. */
export const gatheredAt = (day: string): string => `${day}T04:12:00.000Z`

export const KEPT = ['#sealandgear', 'eco backpack', 'recycled bag', 'sealand gear', 'sustainable backpack', 'upcycled bag']
export const ADDED_9 = ['cotopaxi backpack', 'freitag bag', 'rareform bag', 'recycled sailcloth', 'sailcloth bag', 'sealand bag', 'upcycled backpack']
export const ADDED_13 = ['frtg', 'handmade bag', 'sustainable fashion', 'travel gear']
export const COMMUNITIES = ['r/backpacks', 'r/onebag', 'r/travelgear']
export const SEARCH_SET = [...KEPT, ...ADDED_9, ...ADDED_13]

/** The keyword rows of one Sunday's gather (two platforms keep it small). */
export function gatherRows(day: string, terms: readonly string[] = SEARCH_SET): KeywordRow[] {
  return [
    ...['tiktok', 'reddit'].flatMap((platform) => terms.map((keyword) => ({ run_id: runId(day), platform, keyword, created_at: gatheredAt(day) }))),
    ...COMMUNITIES.map((keyword) => ({ run_id: runId(day), platform: 'reddit', keyword, created_at: gatheredAt(day) })),
  ]
}

/** The runs through `last`, each completed, and `last` itself running (the
 *  run in flight) when `inFlight`. */
export function runsThrough(last: string, inFlight: boolean): RunReadRow[] {
  return SUNDAYS.filter((d) => d <= last).map((d) => ({
    id: runId(d),
    status: inFlight && d === last ? 'running' : 'completed',
    started_at: startedAt(d),
    completed_at: inFlight && d === last ? null : finishedAt(d),
    config_snapshot: null,
  }))
}

export function updatesThrough(last: string): UpdateRun[] {
  return SUNDAYS.filter((d) => d <= last).map((d) => ({ id: runId(d), finishedAt: finishedAt(d) }))
}
