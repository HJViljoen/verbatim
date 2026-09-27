import { describe, expect, it } from 'vitest'

import type { ConfigChange } from '../config-log'
import type { LensRow } from '../reading/recheck'
import { row } from '../test/sealand-pairs'
import { finishedAt, gatherRows, runId, runsThrough, SUNDAYS, updatesThrough } from '../test/s3-run-updates'
import type { VideoRow } from './load'
import {
  equalAgeCut, freshCheckRows, freshPairRows, freshReachRows, measureContext, measurePairs, PAIR_METHOD_VERSION, reachRowsOf,
  recheckPair, type ChecksIO, type PairIO,
} from './measure'
import type { MonthVideo } from './searches'

// The one copy of the pair measure and the re-check (WP3.4), on Sealand's
// Sunday updates and its search set since 20 Sep (lib/test/s3-run-updates.ts).
// Video ids are labels; which search found each is the staging eras'.

const video = (id: string, terms: string[], firstSeen: string, over: Partial<VideoRow> = {}): VideoRow => ({
  id, platform: 'tiktok', video_id: `tt-${id}`, source_keywords: terms, first_seen: firstSeen, source: 'search',
  is_client: false, is_competitor: false, competitor_name: null, analyzed_lane: 'full', ...over,
})
const VIDEOS: VideoRow[] = [
  video('v-upcycled', ['upcycled bag'], '2026-10-04T04:20:00.000Z'),
  video('v-handmade', ['handmade bag'], '2026-10-11T04:20:00.000Z'),
  // found by nothing we still hold: outside
  video('v-none', [], '2026-10-18T04:20:00.000Z'),
  video('v-cotopaxi', ['cotopaxi backpack'], '2026-11-01T04:20:00.000Z', { is_competitor: true, competitor_name: 'Cotopaxi' }),
]
const mv = (id: string, dated: number, audience = 'industry-other'): MonthVideo => ({ id, platform: 'tiktok', audience, dated })
const MONTHS: Record<string, MonthVideo[]> = {
  '2026-10-01': [mv('v-upcycled', 23), mv('v-handmade', 15), mv('v-none', 4)],
  '2026-11-01': [mv('v-upcycled', 9), mv('v-handmade', 12), mv('v-cotopaxi', 20, 'competitor:Cotopaxi')],
}
const io: PairIO = {
  monthVideos: async (m) => MONTHS[m] ?? [],
  monthComments: async (m) => (m === '2026-10-01'
    ? [
        { platform: 'tiktok', video_id: 'tt-v-upcycled', created_at: '2026-10-11T04:30:00.000Z' },
        { platform: 'tiktok', video_id: 'tt-v-upcycled', created_at: '2026-11-01T04:30:00.000Z' },
        { platform: 'tiktok', video_id: 'tt-v-cotopaxi', created_at: '2026-11-01T04:30:00.000Z' },
      ]
    : []),
}
const keywordRows = SUNDAYS.filter((d) => d <= '2026-11-08').flatMap((d) => gatherRows(d))
const NOW = '2026-11-08T07:10:00.000Z'

function ctxAt(opts: { inFlight: boolean; changes?: ConfigChange[] }) {
  return measureContext({
    clientId: 'sealand', now: NOW, changes: opts.changes ?? [], videos: VIDEOS, verdicts: [], keywordRows,
    runs: runsThrough('2026-11-08', opts.inFlight), provenance: null,
    inFlight: opts.inFlight ? { runId: runId('2026-11-08') } : null,
  })
}

describe('the pair measure, inside the run and in a paste', () => {
  it('reads the pair through the run in flight, so the row is current once that run completes', async () => {
    const [m] = await measurePairs(ctxAt({ inFlight: true }), io, [['2026-10-01', '2026-11-01']])
    expect(m.row?.read_through_run).toBe(runId('2026-11-08'))
    expect(m.row?.method_version).toBe(PAIR_METHOD_VERSION)
    // every search has run unchanged since 20 Sep: only the video no search holds is outside
    expect([m.row?.search_outside_prev, m.row?.videos_prev, m.row?.search_outside_curr, m.row?.videos_curr]).toEqual([1, 3, 0, 2])
    expect([m.row?.depth_prev_median, m.row?.depth_curr_median]).toEqual([15, 12])
    // the late-capture figure counts October's category comments first captured after it ended
    expect(m.row?.late_capture).toEqual({ month: '2026-10-01', comments: 1, of: 2 })
    expect(m.row?.gather.map((g) => `${g.month} ${g.runs}`)).toEqual(['2026-10-01 4', '2026-11-01 2'])
  })

  it('a paste reads through the latest completed update instead', async () => {
    const ctx = measureContext({
      clientId: 'sealand', now: NOW, changes: [], videos: VIDEOS, verdicts: [], keywordRows: keywordRows.filter((r) => r.run_id !== runId('2026-11-08')),
      runs: runsThrough('2026-11-01', false), provenance: null,
    })
    const [m] = await measurePairs(ctx, io, [['2026-10-01', '2026-11-01']])
    expect(m.row?.read_through_run).toBe(runId('2026-11-01'))
  })

  it('refuses a pair no update has read yet, and writes no row', async () => {
    const [m] = await measurePairs(ctxAt({ inFlight: true }), io, [['2026-11-01', '2026-12-01']])
    expect(m.row).toBeNull()
    expect(m.lines.join('\n')).toContain('REFUSED: no update has read 2026-12 yet')
  })

  it('measures an attribution change in the span on both populations, and plans its reach once per month', async () => {
    const change = row({ id: 'attribution-v3', changed_at: '2026-10-10T09:00:00.000Z', surface: 'attribution' as ConfigChange['surface'] })  // an MF1 surface (lib/config-surfaces-mf1.ts)
    const ctx = ctxAt({ inFlight: true, changes: [change] })
    const measures = await measurePairs(ctx, io, [['2026-10-01', '2026-11-01']])
    const entry = measures[0].row?.code_changes.find((c) => c.population === 'market')
    // videos first stored after the change: the 11 Oct and 18 Oct finds in October; three of November's
    expect(entry).toMatchObject({ change_id: 'attribution-v3', surface: 'attribution', prev: { k: 2, n: 3 }, curr: { k: 2, n: 3 } })
    const { rows } = reachRowsOf(measures, ctx.updates)
    expect(rows.map((r) => `${r.month}|${r.population}|${r.videos_touched}/${r.videos_in_month}`)).toEqual([
      '2026-10-01|market|2/3', '2026-11-01|market|2/3', '2026-10-01|category|2/3', '2026-11-01|category|1/2',
    ])
  })
})

describe('append-only writes: only what is not held as it is', () => {
  it('a pair row identical to the newest held one is not written again; any difference is', async () => {
    const [m] = await measurePairs(ctxAt({ inFlight: true }), io, [['2026-10-01', '2026-11-01']])
    const r = m.row!
    // jsonb hands keys back in its own order, numerics as strings
    const held = { ...r, depth_prev_median: '15', depth_curr_median: '12', late_capture: { of: 2, month: '2026-10-01', comments: 1 }, computed_at: '2026-11-08T07:00:00Z' }
    expect(freshPairRows([held], [r])).toEqual([])
    expect(freshPairRows([held], [{ ...r, read_through_run: runId('2026-11-15') }])).toHaveLength(1)
    expect(freshPairRows([held, { ...held, videos_curr: 1 }], [r])).toHaveLength(1)
  })

  it('a reach row identical to the newest held one is not written again', () => {
    const r = { change_id: 'c', month: '2026-10-01', population: 'market' as const, videos_touched: 2, videos_in_month: 3, read_through_run: 'x' }
    expect(freshReachRows([{ ...r, month: '2026-10-01T00:00:00' }], [r])).toEqual([])
    expect(freshReachRows([{ ...r, videos_touched: 1 }], [r])).toEqual([r])
  })
})

describe('the same-age cut (decision D, the third population)', () => {
  // the run in flight counts as finishing now (measureContext's inFlight)
  const at = (day: string) => finishedAt(day)
  it('October against November at the 6 Dec update: one update after each ended', () => {
    const cut = equalAgeCut(updatesThrough('2026-12-06'), '2026-10-01', '2026-11-01', at('2026-12-06'))
    expect(cut).toEqual({ age: 1, prevCut: finishedAt('2026-11-01'), currCut: finishedAt('2026-12-06') })
  })
  it('September against October at the 8 Nov update: two updates after each ended', () => {
    expect(equalAgeCut(updatesThrough('2026-11-08'), '2026-09-01', '2026-10-01', at('2026-11-08')))
      .toEqual({ age: 2, prevCut: finishedAt('2026-10-11'), currCut: finishedAt('2026-11-08') })
  })
  it('none while the later month has not ended', () => {
    expect(equalAgeCut(updatesThrough('2026-11-29'), '2026-10-01', '2026-11-01', at('2026-11-29'))).toBeNull()
  })
  it('none when the earlier month had fewer updates after its end than the later one', () => {
    expect(equalAgeCut(updatesThrough('2026-11-08').filter((u) => u.id !== runId('2026-10-04') && u.id !== runId('2026-10-11')
      && u.id !== runId('2026-10-18') && u.id !== runId('2026-10-25')), '2026-09-01', '2026-10-01', at('2026-11-08'))).toBeNull()
  })
})

describe('the re-check of a pair, every population', () => {
  const lens = (month: string, k: number, n: number): LensRow[] => [
    { audience: 'industry-other', object_kind: 'denominator', object_id: 'videos', k: n, n },
    { audience: 'industry-other', object_kind: 'kind', object_id: 'praise', k, n },
  ]
  const seen: string[] = []
  const checksIO = (withLens: boolean): ChecksIO => ({
    monthVideos: io.monthVideos,
    segments: async () => new Map([['v-none', 'noise' as const]]),
    lens: async (population, month, _ids, _min, capturedBefore) => {
      seen.push(`${population}|${month}|${capturedBefore ?? '-'}`)
      return withLens ? lens(month, 3, 3) : null
    },
    subjects: async () => [],
    themeRun: async () => 'theme-run',
    labels: async () => new Map(),
  })

  it('is pending, with nothing written, when lens_readings is not there', async () => {
    const r = await recheckPair(ctxAt({ inFlight: true }), checksIO(false), '2026-09-01', '2026-10-01')
    expect(r.state).toBe('pending')
    expect(r.rows).toEqual([])
  })

  it('adds equal_age rows once both months have ended, each month read at its own cut', async () => {
    seen.length = 0
    const r = await recheckPair(ctxAt({ inFlight: true }), checksIO(true), '2026-10-01', '2026-11-01')
    // November has not ended at the 8 Nov update: the three re-check populations only
    expect(r.equalAge).toBeNull()
    expect([...new Set(r.rows.map((x) => x.population))]).toEqual(['same_searches_clean', 'dense20', 'all_but_noise'])

    seen.length = 0
    const aged = await recheckPair(ctxAt({ inFlight: true }), checksIO(true), '2026-09-01', '2026-10-01')
    expect(aged.equalAge).toEqual({ age: 2, prevCut: finishedAt('2026-10-11'), currCut: NOW })
    expect([...new Set(aged.rows.map((x) => x.population))]).toEqual(['same_searches_clean', 'dense20', 'all_but_noise', 'equal_age'])
    expect(seen).toContain(`equal_age|2026-09-01|${finishedAt('2026-10-11')}`)
    expect(aged.rows.every((x) => x.read_through_run === runId('2026-11-08'))).toBe(true)
  })

  it('refuses to check a later month not read past its end when asked to', async () => {
    const r = await recheckPair(ctxAt({ inFlight: true }), checksIO(true), '2026-10-01', '2026-11-01', { requireReadToEnd: true })
    expect(r.state).toBe('not_read_to_end')
  })

  it('writes a check row only when it differs from the newest held one', async () => {
    const r = await recheckPair(ctxAt({ inFlight: true }), checksIO(true), '2026-09-01', '2026-10-01')
    expect(freshCheckRows(r.rows, r.rows)).toEqual([])
    const [first] = r.rows
    expect(freshCheckRows([{ ...first, k_curr: first.k_curr + 1 }], [first])).toEqual([first])
  })
})
