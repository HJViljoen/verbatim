import { describe, expect, it } from 'vitest'

import { baselineStepOf, comparableBaseline, comparableBaselineLabel } from '../reading/anomaly'
import { CHANGES, SEALAND_LOG } from '../test/sealand-pairs'
import { AUG_SEP, SEP_OCT, sameWay, storedPair } from '../test/s3-run-pairs'
import { fakeAdmin } from '../test/s3-run-fake-admin'
import { runAnomalyCheck } from './anomaly-check'

// The unusual-week check on comparable months only (decision D; WP3.4). On
// Sealand's real change log (lib/test/sealand-pairs.ts) and its pair rows
// (lib/test/s3-run-pairs.ts: August against September real, later pairs
// HYPOTHETICAL and named so), the baseline reads "forming" until October to
// December are comparable, as the plan's calendar has it (§2.11).

const OCT_NOV = sameWay('2026-10-01', '2026-11-01', 'run-2026-11-08', '2026-11-08T07:10:00.000Z')
const NOV_DEC = sameWay('2026-11-01', '2026-12-01', 'run-2026-12-06', '2026-12-06T07:10:00.000Z')
const DEC_JAN = sameWay('2026-12-01', '2027-01-01', 'run-2027-01-10', '2027-01-10T07:10:00.000Z')
const ROWS = [AUG_SEP, SEP_OCT, OCT_NOV, NOV_DEC, DEC_JAN]

describe('the comparable-only baseline', () => {
  const step = baselineStepOf(ROWS, CHANGES)

  it('the 8 Nov update (the week from 1 Nov): August and September are refused against November, so 1 of 3', () => {
    const b = comparableBaseline(['2026-08-01', '2026-09-01', '2026-10-01'], '2026-11-01', step)
    expect(b).toEqual({ kept: ['2026-10-01'], dropped: ['2026-08-01', '2026-09-01'] })
    expect(comparableBaselineLabel(b.kept.length)).toBe('forming: 1 of 3 comparable months')
  })

  it('the 13 Dec update: September is still refused, so 2 of 3', () => {
    const b = comparableBaseline(['2026-09-01', '2026-10-01', '2026-11-01'], '2026-12-01', step)
    expect(b.kept).toEqual(['2026-10-01', '2026-11-01'])
    expect(comparableBaselineLabel(b.kept.length)).toBe('forming: 2 of 3 comparable months')
  })

  it('from the first January update whose week starts in January: October to December, ready', () => {
    const b = comparableBaseline(['2026-10-01', '2026-11-01', '2026-12-01'], '2027-01-01', step)
    expect(b.kept).toEqual(['2026-10-01', '2026-11-01', '2026-12-01'])
    expect(comparableBaselineLabel(b.kept.length)).toBe('baseline ready')
  })

  it('a pair nothing has measured is refused: no pair rows, no baseline', () => {
    expect(comparableBaseline(['2026-08-01', '2026-09-01', '2026-10-01'], '2026-11-01', baselineStepOf([], CHANGES)).kept).toEqual([])
  })

  it('a change of ours measured over a tenth of a month refuses its step, depth does not', () => {
    const shallow = { ...OCT_NOV, depth: { prevMedian: 23, currMedian: 9 } }
    expect(baselineStepOf([shallow], CHANGES)('2026-10-01', '2026-11-01')).toBe(true)
    const touched = { ...OCT_NOV, codeChanges: [{ changeId: 'gate-fix', surface: 'gate_rule' as const, prev: { k: 0, n: 377 }, curr: { k: 63, n: 377 } }] }
    expect(baselineStepOf([touched], CHANGES)('2026-10-01', '2026-11-01')).toBe(false)
  })
})

describe('the check prints it', () => {
  const SEALAND = 'ac16988e-c4f3-4baf-b388-73895852a554'
  const t = <T extends object>(rows: T[]) => rows.map((r) => ({ client_id: SEALAND, ...r }))
  // Real denominators: the market's 377 August and 655 September videos
  // (decision E); October's is HYPOTHETICAL, August's 377 re-dated.
  const denominators = t([
    { month: '2026-08-01', audience: 'industry-other', videos: 377, status: 'frozen' },
    { month: '2026-09-01', audience: 'industry-other', videos: 655, status: 'filling' },
    { month: '2026-10-01', audience: 'industry-other', videos: 377, status: 'filling' },
  ])

  it('the 8 Nov update on Sealand: "forming: 1 of 3 comparable months", nothing flagged', async () => {
    const f = fakeAdmin({
      tables: {
        pipeline_runs: t([
          { id: 'run-2026-11-08', status: 'running', stalled: false, videos_scraped: null, started_at: '2026-11-08T04:00:00Z' },
          ...['2026-10-04', '2026-10-11', '2026-10-18', '2026-10-25', '2026-11-01'].map((d) => ({ id: `run-${d}`, status: 'completed', stalled: false, videos_scraped: 655, started_at: `${d}T04:00:00Z` })),
        ]),
        config_changes: SEALAND_LOG.map((r) => ({ ...r, client_id: SEALAND })),
        month_pair_comparability: ROWS.map((r) => storedPair(r, SEALAND)),
        month_denominators: denominators,
        month_kind_readings: [], month_subject_readings: [], month_theme_readings: [],
        subjects: [], theme_registry: [], anomaly_checks: [],
      },
      rpc: { window_denominators: () => [{ audience: 'industry-other', videos: 244 }], window_kind_readings: () => [], window_subject_readings: () => [], window_theme_readings: () => [] },
    })
    const r = await runAnomalyCheck({
      clientId: SEALAND, runId: 'run-2026-11-08', admin: f.client, updateVideos: 655,
      window: { start: '2026-11-01T08:30:00.000Z', end: '2026-11-08T07:00:00.000Z' }, now: '2026-11-08T07:20:00.000Z',
      explainer: async () => { throw new Error('no model call on a forming baseline') },
    })
    expect(r.status).toBe('nothing_unusual')
    expect(r.note).toBe('forming: 1 of 3 comparable months')
    expect(r.baseline).toEqual({ weekMonth: '2026-11-01', kept: ['2026-10-01'], dropped: ['2026-08-01', '2026-09-01'] })
    expect(f.tables.anomaly_checks.map((c) => c.note)).toEqual(['forming: 1 of 3 comparable months'])
  })
})
