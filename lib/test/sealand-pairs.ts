import type { ConfigChange } from '../config-log'
import { changesFromLog } from '../reading/comparability'
import { pairJudge, type PairJudge, type UpdateRun } from '../reading/pairs'
import { scheduledUpdateAfter } from '../reading/reading-month'
import type { OurChange, PairRow } from '../reading/comparability'

// Sealand's real change log, updates and schedule, for the month-pair rule's
// tests (market-first decision D, WP1.3). Every date, surface and count is the
// research's; ids are labels.

// SEALAND'S CHANGE LOG, the rows GC F2 lists (staging, a production copy to
// about 20 Sep): the 6 Jul term set, the 9 Sep rival cut, re-tag and term swap,
// the 13 Sep hand-SQL terms, the 17 Sep script (terms, rivals), and the 20 Sep
// discovery probe (20 communities before and after, the searched three
// unchanged). Ids are labels.
let seq = 0
export function row(over: Partial<ConfigChange> & Pick<ConfigChange, 'changed_at' | 'surface'>): ConfigChange {
  seq += 1
  return {
    id: over.id ?? `row-${seq}`,
    client_id: 'sealand',
    field: null,
    before: null,
    after: null,
    actor_kind: 'reconstructed',
    actor_user_id: null,
    actor_label: null,
    run_id: null,
    source: 'reconstructed',
    rows_affected: null,
    note: null,
    affects_audiences: null,
    affects_months: null,
    ...over,
  }
}
const ACTIVE = ['backpacks', 'travelgear', 'onebag']
const communities = (probed: boolean): Record<string, unknown>[] => [
  ...ACTIVE.map((name) => ({ name, status: 'active' })),
  ...Array.from({ length: 17 }, (_, i) => ({
    name: `known_${i + 1}`,
    status: probed && i === 0 ? 'rejected' : 'candidate',
    ...(probed && i === 0 ? { probe: { at: '2026-09-20', sampled: 20, kept: 0 } } : {}),
  })),
]
export const PROBE_0920 = row({
  id: 'subreddits-0920', changed_at: '2026-09-20T04:04:00.000Z', surface: 'subreddits', field: 'subreddits',
  source: 'trigger', actor_kind: 'pipeline', before: communities(false), after: communities(true),
})
export const SEALAND_LOG: ConfigChange[] = [
  row({ id: 'terms-0706', changed_at: '2026-07-06T04:19:00.000Z', surface: 'terms', after: ['upcycled bag'] }),
  row({ id: 'rivals-0909', changed_at: '2026-09-09T16:24:15.000Z', surface: 'rivals', field: 'competitor_names' }),
  row({ id: 'retag-0909', changed_at: '2026-09-09T18:10:00.000Z', surface: 'entity_retag', rows_affected: 253 }),
  row({ id: 'terms-0909', changed_at: '2026-09-09T18:17:56.000Z', surface: 'terms', after: ['rareform bag'] }),
  row({ id: 'terms-0913', changed_at: '2026-09-13T10:00:58.000Z', surface: 'terms', field: 'industry_keywords', after: ['handmade bag', 'sustainable fashion', 'travel gear'] }),
  row({ id: 'terms-0917', changed_at: '2026-09-17T16:02:56.000Z', surface: 'terms', field: 'industry_keywords', source: 'trigger' }),
  row({ id: 'rivals-0917', changed_at: '2026-09-17T16:02:56.000Z', surface: 'rivals', field: 'competitor_names', source: 'trigger' }),
  PROBE_0920,
]
export const CHANGES = changesFromLog(SEALAND_LOG)

// SEALAND'S UPDATES (DR F21; reading-month.test.ts): completed runs on 28 Jun,
// 9 Jul, 17 Aug, 9 and 10 Sep, a partial on 20 Sep, the 24 Sep update, then
// Sunday 06:00 SAST from 27 Sep (finished about 08:30 UTC).
const sundays = (from: string, to: string): string[] => {
  const out: string[] = []
  for (let t = Date.parse(`${from}T08:30:00.000Z`); t <= Date.parse(`${to}T08:30:00.000Z`); t += 7 * 86_400_000) out.push(new Date(t).toISOString())
  return out
}
export const SEALAND_UPDATES: UpdateRun[] = [
  '2026-06-28T12:00:00.000Z', '2026-07-09T12:00:00.000Z', '2026-08-17T12:00:00.000Z', '2026-09-09T12:00:00.000Z',
  '2026-09-10T12:00:00.000Z', '2026-09-20T12:00:00.000Z', '2026-09-24T12:00:00.000Z', ...sundays('2026-09-27', '2027-01-03'),
].map((finishedAt) => ({ id: `run-${finishedAt.slice(0, 10)}`, finishedAt }))
export const SEALAND_SCHEDULE = scheduledUpdateAfter({ report_period: 'weekly', report_day: 'sunday' })

// ÖSSUR: first run 6 Apr 2026, last 13 Sep, paused since (reading-month.test.ts).
export const OSSUR_UPDATES: UpdateRun[] = [
  { id: 'ossur-0406', finishedAt: '2026-04-06T12:00:00.000Z' },
  { id: 'ossur-0913', finishedAt: '2026-09-13T12:00:00.000Z' },
]

/** Sealand's judge at a clock, over the given pair rows (none: MF1 not yet
 *  applied, which is deploy 1's state) and its real change log. */
export function sealandJudge(now: string, rows: readonly PairRow[] = [], changes: readonly OurChange[] = CHANGES, updates: readonly UpdateRun[] = SEALAND_UPDATES): PairJudge {
  return pairJudge({ now, changes, rows, updates, nextUpdateAfter: SEALAND_SCHEDULE })
}
