import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import type { OurChange } from '../reading/comparability'
import type { MarketWeekRowRaw } from '../reading/weeks'
import type { WeekReadDataV1, WeekReadDataV2 } from '../written/types'
import type { RecCopy } from './market-surface'
import {
  adviceCount, competitiveTile, homeAxis, homeNumbers, homeTiles, homeWeeks, homeWeeksFrame, INSUFFICIENT, isFailOpenFix, movesTile, overviewTile, standingLevel, tileInsufficient, weeksDrawable,
  subjectsTile, voiceTile, weekTile, MOVES_NONE, WEEK_COLUMNS, type HomeTheme,
} from './home'
import { HOME_READ } from './home-fixture'

// The Dashboard's rules (lib/pages/home.ts), on the artboard's Sealand
// September (lib/pages/home-fixture.ts).

describe('Your market in numbers', () => {
  it('prints the four figures the read froze, under the read’s own dates', () => {
    expect(homeNumbers(HOME_READ)).toEqual({
      week: { heading: 'This week, 21 to 27 September', videos: '262', comments: '4,528' },
      month: { heading: 'September so far', videos: '852', comments: '21,468' },
    })
  })

  it('names the month in total once the week has carried past its end', () => {
    const read: WeekReadDataV2 = { ...HOME_READ, window: { from: '2026-09-27T04:03:00Z', to: '2026-10-04T04:02:00Z' }, monthComplete: true }
    const n = homeNumbers(read)
    expect(n?.week?.heading).toBe('This week, 28 September to 4 October')
    expect(n?.month?.heading).toBe('September in total')
  })

  it('prints a half only where both its figures were read, and nothing without either', () => {
    const weekOnly = homeNumbers({ ...HOME_READ, market: { week: { videos: 262, comments: 4528 }, month: { videos: 852, comments: null } } })
    expect(weekOnly?.month).toBeNull()
    expect(weekOnly?.week?.videos).toBe('262')
    expect(homeNumbers({ ...HOME_READ, market: { week: { videos: null, comments: 1 }, month: { videos: 1, comments: null } } })).toBeNull()
    expect(homeNumbers({ ...HOME_READ, market: null })).toBeNull()
    expect(homeNumbers(null)).toBeNull()
  })

  it('draws nothing from an older read, which froze no market figures', () => {
    const v1: WeekReadDataV1 = { ...HOME_READ, version: 1, inShort: 'x', promptVersion: 'week_read_v2' }
    expect(homeNumbers(v1)).toBeNull()
  })
})

describe('Week by week', () => {
  const row = (week: string, videos: number, comments: number, extra: Partial<MarketWeekRowRaw> = {}): MarketWeekRowRaw => ({
    week, audience: 'industry-other', videos, comments, comments_next_month: 0, under_5: 0,
    median_dated: 6, mean_dated: 9, older_videos: 0, unchecked: 0, ...extra,
  })
  const rows = [row('2026-09-14', 345, 5918), row('2026-09-21', 262, 4528), row('2026-09-28', 281, 4902), row('2026-10-05', 254, 4210), row('2026-10-12', 120, 1500)]
  const sundays = ['2026-10-04T06:10:00Z', '2026-10-11T06:10:00Z', '2026-10-18T06:10:00Z', '2026-10-25T06:10:00Z']
  // Sealand's log: the last search change of September (17 Sep, the week of 14 Sep).
  const searchChange: OurChange = { id: 's17', surface: 'terms', changedAt: '2026-09-17T16:02:00Z', note: null, affects: [] }
  const base = { rows, rivalAudiences: [], changes: [searchChange] as OurChange[] }

  it('the axis is the last eight weeks to now: no constant decides the first week', () => {
    expect(homeAxis('2026-10-01T08:00:00Z')).toEqual(['2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28'])
  })

  it('the chart frames that axis, ENDING NOW: the last column is always the current week, and a drawn week sits at its own place on it (Heinrich, 5 Oct: "have the bars on the graph go all the way to the right")', () => {
    for (const [now, current] of [['2026-10-01T08:00:00Z', '2026-09-28'], ['2026-10-05T07:00:00Z', '2026-10-05'], ['2026-10-26T08:00:00Z', '2026-10-26']]) {
      const w = homeWeeks({ ...base, updates: [], now })!
      expect(w.columns.map((c) => c.week)).toEqual(homeAxis(now))
      expect(w.columns[WEEK_COLUMNS - 1].week).toBe(current)
      // The empty frame is the same eight weeks.
      expect(homeWeeksFrame(now).columns.map((c) => c.week)).toEqual(homeAxis(now))
    }
    // On 5 Oct the current week is drawn, faint, on the right edge.
    expect(homeWeeks({ ...base, updates: [], now: '2026-10-05T07:00:00Z' })!.columns[WEEK_COLUMNS - 1]).toMatchObject({ week: '2026-10-05', label: '5 Oct', videos: 254, settled: false })
    // One week drawn, five weeks back: it stays in its place, every week after it to now an empty column.
    const one = homeWeeks({ ...base, rows: [row('2026-09-21', 262, 4528)], updates: sundays, now: '2026-10-26T08:00:00Z' })!
    expect(one.columns.map((c) => c.videos)).toEqual([null, null, 262, null, null, null, null, null])
    expect(one.columns[2]).toMatchObject({ week: '2026-09-21', label: '21 Sep', settled: true })
    expect(one.columns[WEEK_COLUMNS - 1]).toMatchObject({ week: '2026-10-26', label: '26 Oct', videos: null })
  })

  it('draws from ONE clean week, the first the data shows, a week still filling marked as such (Heinrich, 1 Oct)', () => {
    // On 1 October: the week of 14 September holds the 17 Sep search change;
    // the weeks of 21 and 28 September are read one way, both still filling.
    const one = homeWeeks({ ...base, updates: [], now: '2026-10-01T08:00:00Z' })
    expect(one!.columns.map((c) => c.videos)).toEqual([null, null, null, null, null, null, 262, 281])
    expect(one!.columns.map((c) => c.label).slice(-2)).toEqual(['21 Sep', '28 Sep'])
    expect(one!.columns.map((c) => c.settled).slice(-2)).toEqual([false, false])
    // On 19 October (31 Aug to 19 Oct): 21 Sep to 12 Oct drawn, the current week not yet.
    const three = homeWeeks({ ...base, updates: sundays.slice(0, 3), now: '2026-10-19T08:00:00Z' })
    expect(three!.columns.map((c) => c.videos)).toEqual([null, null, null, 262, 281, 254, 120, null])
    expect(three!.columns.map((c) => c.settled)).toEqual([false, false, false, true, true, false, false, false])
  })

  it('the week of 21 September is drawn by its DATA: off while it holds unchecked videos, on once they are judged', () => {
    const held = [row('2026-09-21', 264, 4597, { unchecked: 3 }), row('2026-09-28', 281, 4902)]
    expect(homeWeeks({ ...base, rows: held, updates: [], now: '2026-10-01T08:00:00Z' })!.columns.map((c) => c.videos).slice(-2)).toEqual([null, 281])
    // Kept by the operator and the regate written: unchecked 0, and the same code draws it.
    const judged = [row('2026-09-21', 264, 4597, { unchecked: 0 }), row('2026-09-28', 281, 4902)]
    expect(homeWeeks({ ...base, rows: judged, updates: [], now: '2026-10-01T08:00:00Z' })!.columns.map((c) => c.videos).slice(-2)).toEqual([264, 281])
    // Nothing gathered after it yet (1 Oct, before Sunday): the week of 21 September alone.
    const alone = homeWeeks({ ...base, rows: [row('2026-09-21', 264, 4597)], updates: [], now: '2026-10-01T08:00:00Z' })!
    expect(alone.columns[6]).toMatchObject({ label: '21 Sep', videos: 264, settled: false })
    expect(alone.columns[7]).toMatchObject({ label: '28 Sep', videos: null })
    expect(homeWeeks({ ...base, rows: [row('2026-09-21', 264, 4597, { unchecked: 3 })], updates: [], now: '2026-10-01T08:00:00Z' })).toBeNull()
  })

  it('never draws a week up to the latest search change on the axis, and is omitted where no clean week exists', () => {
    const w = homeWeeks({ ...base, updates: [], now: '2026-10-01T08:00:00Z' })
    // The week of 14 Sep (345 videos in the rows) and every week before it stand empty.
    expect(w!.columns.filter((c) => c.week <= '2026-09-14').map((c) => c.videos)).toEqual([null, null, null, null, null, null])
    expect(w!.columns[5]).toMatchObject({ label: '14 Sep', videos: null, comments: null })
    expect(homeWeeks({ ...base, rows: [], updates: sundays, now: '2026-10-26T08:00:00Z' })).toBeNull()
    expect(homeWeeks({ ...base, rows: [row('2026-09-14', 345, 5918)], updates: [], now: '2026-09-20T08:00:00Z' })).toBeNull()
  })

  it('with no week to draw, the page gets the empty frame (Heinrich, 1 Oct): the eight weeks ending at the current one, all blank (Heinrich, 5 Oct)', () => {
    const frame = homeWeeksFrame('2026-10-01T08:00:00Z')
    expect(frame.columns.map((c) => c.label)).toEqual(['10 Aug', '17 Aug', '24 Aug', '31 Aug', '7 Sep', '14 Sep', '21 Sep', '28 Sep'])
    expect(frame.columns.every((c) => c.videos == null && c.comments == null && !c.settled)).toBe(true)
    expect(weeksDrawable(frame)).toBe(false)
    expect(weeksDrawable(homeWeeks({ ...base, updates: [], now: '2026-10-01T08:00:00Z' })!)).toBe(true)
  })

  it('frames the eight weeks ending at the current one (Heinrich, 5 Oct); settled weeks solid, the filling one faint', () => {
    const w = homeWeeks({ ...base, updates: sundays, now: '2026-10-26T08:00:00Z' })
    expect(w).not.toBeNull()
    expect(w!.columns).toHaveLength(WEEK_COLUMNS)
    expect(w!.columns.map((c) => c.label)).toEqual(['7 Sep', '14 Sep', '21 Sep', '28 Sep', '5 Oct', '12 Oct', '19 Oct', '26 Oct'])
    expect(w!.columns.map((c) => c.videos)).toEqual([null, null, 262, 281, 254, 120, null, null])
    expect(w!.columns.map((c) => c.comments)).toEqual([null, null, 4528, 4902, 4210, 1500, null, null])
    expect(w!.columns.map((c) => c.settled)).toEqual([false, false, true, true, true, false, false, false])
    expect(w!.maxVideos).toBe(281)
    expect(w!.maxComments).toBe(4902)
  })

  it('pools the market (the category and the tracked brands), never the client’s own posts', () => {
    const pooled = [
      ...rows,
      row('2026-09-28', 10, 100, { audience: 'competitor:Patagonia' }),
      row('2026-09-28', 99, 999, { audience: 'client' }),
    ]
    const w = homeWeeks({ ...base, rows: pooled, rivalAudiences: ['competitor:Patagonia'], updates: sundays, now: '2026-10-26T08:00:00Z' })
    expect(w!.columns[3]).toMatchObject({ label: '28 Sep', videos: 291, comments: 5002 })
  })

  it('never spans a change to our searches: its week and the weeks before it are not drawn, and stand empty on the frame', () => {
    const change: OurChange = { id: 'c1', surface: 'terms', changedAt: '2026-10-07T10:00:00Z', note: null, affects: [] }
    const w = homeWeeks({ ...base, changes: [searchChange, change], updates: sundays, now: '2026-10-26T08:00:00Z' })
    expect(w!.columns.map((c) => c.videos)).toEqual([null, null, null, null, null, 120, null, null])
    expect(w!.columns[5]).toMatchObject({ label: '12 Oct', settled: false })
  })

  it('the fail-open fixes cut no week by themselves (their whole effect is `unchecked`); any other relevance change does', () => {
    expect(isFailOpenFix({ surface: 'gate_rule', field: 'relevance_gate' })).toBe(true)
    expect(isFailOpenFix({ surface: 'gate_rule', field: 'relevance_prompt' })).toBe(false)
    expect(isFailOpenFix({ surface: 'regate', field: null })).toBe(false)
    expect(isFailOpenFix({ surface: 'terms', field: null })).toBe(false)
    // Had the loader passed it on, the regate's record (a gate_rule change
    // dated in the week of 28 September) would cut that week and the one
    // before it: that is why the loader leaves the fixes out
    // (`changeRows.filter((r) => !isFailOpenFix(r))`) and nothing else.
    const regate: OurChange = { id: 'g2', surface: 'gate_rule', changedAt: '2026-10-02T18:00:00Z', note: null, affects: [] }
    const cut = homeWeeks({ ...base, changes: [searchChange, regate], updates: sundays, now: '2026-10-26T08:00:00Z' })
    expect(cut!.columns.map((c) => c.videos)).toEqual([null, null, null, null, 254, 120, null, null])
    expect(homeWeeks({ ...base, updates: sundays, now: '2026-10-26T08:00:00Z' })!.columns[2]).toMatchObject({ label: '21 Sep', videos: 262 })
  })

  it('the loader leaves the fail-open fixes out of the cut, and only them', () => {
    const src = readFileSync(resolve(__dirname, 'home.ts'), 'utf8')
    expect(src).toMatch(/changes: ourChangesWithoutGatherFlags\(changeRows\.filter\(\(r\) => !isFailOpenFix\(r\)\)\)/)
    expect(src).not.toMatch(/HOME_FIRST_WEEK|WEEK_LINE_FIRST_WEEK/)
  })

  it('draws only weeks on the one weekly cadence, and a run that gathered nothing is not one: on Sealand the week of 21 Sep is drawn (Heinrich, 5 Oct)', () => {
    // Production's runs: two analysis-only rehearsals on Thu 24 Sep (fresh
    // skipGather runs, which searched nothing) and the 27 Sep update, partial
    // only after its gather.
    const runs = [
      { id: 'e80e9347', status: 'partial', startedAt: '2026-09-24T15:54:51Z', finishedAt: '2026-09-24T16:16:13Z', errors: ['ocr: failed'], options: { skipGather: true } },
      { id: '03180a33', status: 'partial', startedAt: '2026-09-24T17:35:55Z', finishedAt: '2026-09-24T17:51:08Z', errors: ['ocr: failed'], options: { skipGather: true } },
      { id: 'f3646446', status: 'partial', startedAt: '2026-09-27T04:03:42Z', finishedAt: '2026-09-27T07:28:35Z', errors: ['transcript-backfill: Apify 408', 'owned-posts:instagram:rareform: 0 posts'], options: { sendReport: true } },
    ]
    const judged = [row('2026-09-21', 264, 4597), row('2026-09-28', 281, 4902)]
    // On 1 October the axis ends at the week of 28 Sep: 21 Sep is the seventh column, 28 Sep the last.
    const w = homeWeeks({ ...base, rows: judged, updates: [], runs, now: '2026-10-01T08:00:00Z' })
    expect(w!.columns[6]).toMatchObject({ label: '21 Sep', videos: 264 })
    // Read without their options (the loader before 5 Oct) the rehearsals count: three updates in the week, and 21 Sep is off.
    const unread = runs.map(({ options: _o, ...r }) => r)
    expect(homeWeeks({ ...base, rows: judged, updates: [], runs: unread, now: '2026-10-01T08:00:00Z' })!.columns.slice(-2)).toMatchObject([{ label: '21 Sep', videos: null }, { label: '28 Sep', videos: 281 }])
    // An extra run that DID gather in the week still breaks it.
    const extra = [...runs, { id: 'x1', status: 'completed', startedAt: '2026-09-24T15:00:00Z', finishedAt: '2026-09-24T16:00:00Z', errors: [], options: { sendReport: true } }]
    expect(homeWeeks({ ...base, rows: judged, updates: [], runs: extra, now: '2026-10-01T08:00:00Z' })!.columns.slice(-2)).toMatchObject([{ label: '21 Sep', videos: null }, { label: '28 Sep', videos: 281 }])
    // Without the runs (a fixture) the cadence cuts nothing.
    expect(homeWeeks({ ...base, rows: judged, updates: [], now: '2026-10-01T08:00:00Z' })!.columns[6]).toMatchObject({ label: '21 Sep', videos: 264 })
  })

  it('a rehearsal finishing after a week ends does not settle it: the week stays faint until two real updates', () => {
    const judged = [row('2026-09-21', 264, 4597), row('2026-09-28', 281, 4902)]
    const sunday = (id: string, day: string) => ({ id, status: 'completed', startedAt: `${day}T04:03:00Z`, finishedAt: `${day}T07:30:00Z`, errors: [], options: { sendReport: true } })
    const rehearsal = { id: 'r1', status: 'partial', startedAt: '2026-10-08T15:00:00Z', finishedAt: '2026-10-08T15:20:00Z', errors: ['ocr: failed'], options: { skipGather: true } }
    const runs = [sunday('s27', '2026-09-27'), sunday('s04', '2026-10-04'), rehearsal]
    const updates = runs.map((r) => r.finishedAt)
    const now = '2026-10-09T08:00:00Z'
    // The week of 21 Sep ended 28 Sep: one real update (4 Oct) and the rehearsal since. Filling.
    // On 9 October the axis is 17 Aug to 5 Oct, so 21 Sep is the sixth column.
    const w = homeWeeks({ ...base, rows: judged, updates, runs, now })
    expect(w!.columns[5]).toMatchObject({ label: '21 Sep', videos: 264, settled: false })
    // Counted as an update (a run not known to have gathered nothing), the same finish settles it.
    expect(homeWeeks({ ...base, rows: judged, updates, runs: runs.slice(0, 2), now })!.columns[5]).toMatchObject({ label: '21 Sep', videos: 264, settled: true })
  })

  it('the loader reads each run\'s options, which say whether it gathered', () => {
    const src = readFileSync(resolve(__dirname, '../reading/reading-view.ts'), 'utf8')
    expect(src).toMatch(/select\('id, status, started_at, completed_at, errors, window_start, window_end, options'\)/)
  })

  it('the loader reads every run for the cadence test', () => {
    const src = readFileSync(resolve(__dirname, 'home.ts'), 'utf8')
    expect(src).toMatch(/loadCadenceRuns\(supabase, clientId\)/)
    expect(src).toMatch(/runs: cadenceRuns,/)
  })

  it('leaves out a week holding videos let in without a check that still stands, and everything before it, where their comments are not known', () => {
    const dirty = [row('2026-09-21', 262, 4528), row('2026-09-28', 281, 4902, { unchecked: 3 }), row('2026-10-05', 254, 4210), row('2026-10-12', 120, 1500)]
    const w = homeWeeks({ ...base, rows: dirty, updates: sundays, now: '2026-10-26T08:00:00Z' })
    expect(w!.columns.map((c) => c.videos)).toEqual([null, null, null, null, 254, 120, null, null])
  })

  // The unchecked videos' own counts, as market_week_volumes returns them from migration 20261107090000.
  const uc = (r: MarketWeekRowRaw, n: number): MarketWeekRowRaw => ({ ...r, unchecked_comments: n, unchecked_comments_next_month: 0, unchecked_under_5: 0, unchecked_older_videos: 0 })

  it('where their counts are known, draws that week with the unchecked videos and their comments left out (5 Oct)', () => {
    const known = [uc(row('2026-09-21', 262, 4528), 0), uc(row('2026-09-28', 281, 4902, { unchecked: 3 }), 40), uc(row('2026-10-05', 254, 4210), 0), uc(row('2026-10-12', 120, 1500), 0)]
    const w = homeWeeks({ ...base, rows: known, updates: sundays, now: '2026-10-26T08:00:00Z' })
    expect(w!.columns.map((c) => c.videos)).toEqual([null, null, 262, 278, 254, 120, null, null])
    expect(w!.columns.map((c) => c.comments)).toEqual([null, null, 4528, 4862, 4210, 1500, null, null])
    expect(w!.maxVideos).toBe(278)
  })

  // Production on Mon 5 Oct (read that morning): the runs as they stand, with
  // their options (read 5 Oct, 07:50 UTC).
  const SEALAND_RUNS = [
    { id: 'b67b56de', status: 'partial', startedAt: '2026-09-20T04:02:57Z', finishedAt: '2026-09-20T08:33:47Z', windowStart: '2026-09-10T07:02:10Z', windowEnd: '2026-09-20T04:02:57Z', errors: ['owned-posts:instagram:rareform: 0 posts'], options: { sendReport: true, scheduledFor: '2026-09-20T04:00:00.000Z' } },
    { id: 'e80e9347', status: 'partial', startedAt: '2026-09-24T15:54:51Z', finishedAt: '2026-09-24T16:16:13Z', windowStart: '2026-09-20T04:02:57Z', windowEnd: '2026-09-24T15:54:51Z', errors: ['ocr: failed', 'persist-themes: failed'], options: { skipGather: true } },
    { id: '03180a33', status: 'partial', startedAt: '2026-09-24T17:35:55Z', finishedAt: '2026-09-24T17:51:08Z', windowStart: '2026-09-20T04:02:57Z', windowEnd: '2026-09-24T17:35:55Z', errors: ['ocr: failed'], options: { skipGather: true } },
    { id: 'f3646446', status: 'partial', startedAt: '2026-09-27T04:03:42Z', finishedAt: '2026-09-27T07:28:35Z', windowStart: '2026-09-20T04:02:57Z', windowEnd: '2026-09-27T04:03:42Z', errors: ['owned-posts:instagram:rareform: 0 posts', 'transcript-backfill: Apify 408', 'transcribe:youtube: 7 of 54 recovered', 'pass-a: 1 re-asked'], options: { sendReport: true, scheduledFor: '2026-09-27T04:00:00.000Z' } },
    // Resumed analysis-only the same day: its started_at is the resume's, its
    // window_end the 04:01 opening, and its options name itself (the resume
    // lever), so it is the gather it resumes.
    { id: '393b95df', status: 'completed', startedAt: '2026-10-04T11:45:46Z', finishedAt: '2026-10-04T12:13:08Z', windowStart: '2026-09-27T04:03:42Z', windowEnd: '2026-10-04T04:01:17Z', errors: [], options: { runId: '393b95df', sendReport: true, skipGather: true } },
  ]
  const OSSUR_RUNS = [
    { id: 'd346b0f7', status: 'completed', startedAt: '2026-09-13T04:06:38Z', finishedAt: '2026-09-13T06:26:49Z', windowStart: '2026-09-06T04:06:38Z', windowEnd: '2026-09-13T04:06:38Z', errors: [], options: { sendReport: true } },
    { id: '555af400', status: 'partial', startedAt: '2026-10-04T11:45:54Z', finishedAt: '2026-10-04T14:46:27Z', windowStart: '2026-09-13T04:06:38Z', windowEnd: '2026-10-04T11:45:54Z', errors: ['themes: failed', 'transcribe: failed', 'pass-a: failed'], options: {} },
  ]
  const MONDAY = '2026-10-05T07:00:00Z'

  it('Sealand, 5 Oct: the chart starts at the week of 21 Sep (301 videos, 4,990 comments), then 28 Sep with its one unchecked video left out (265, 5,028), both faint', () => {
    const rows = [uc(row('2026-09-21', 301, 4990), 0), uc(row('2026-09-28', 266, 5029, { unchecked: 1 }), 1)]
    // On Monday 5 Oct the axis is 17 Aug to 5 Oct: 21 Sep and 28 Sep are the sixth and seventh columns, the current week the last.
    const w = homeWeeks({ ...base, rows, updates: SEALAND_RUNS.map((r) => r.finishedAt), runs: SEALAND_RUNS, now: MONDAY })
    expect(w!.columns[5]).toEqual({ week: '2026-09-21', label: '21 Sep', videos: 301, comments: 4990, settled: false })
    expect(w!.columns[6]).toEqual({ week: '2026-09-28', label: '28 Sep', videos: 265, comments: 5028, settled: false })
    expect([...w!.columns.slice(0, 5), w!.columns[7]].every((c) => c.videos == null)).toBe(true)
    expect(w!.columns[7]).toMatchObject({ week: '2026-10-05', label: '5 Oct' })
    // The week of 14 Sep stays off: the 17 Sep search change, and two runs in it.
    const withEarlier = [uc(row('2026-09-14', 332, 5426), 0), ...rows]
    const earlier = homeWeeks({ ...base, rows: withEarlier, updates: SEALAND_RUNS.map((r) => r.finishedAt), runs: SEALAND_RUNS, now: MONDAY })!
    expect(earlier.columns.slice(4, 6)).toMatchObject([{ week: '2026-09-14', videos: null }, { week: '2026-09-21', videos: 301 }])
    // Before the migration the function returns no unchecked_comments: the week stays off, as on 5 Oct.
    const before = [row('2026-09-21', 301, 4990), row('2026-09-28', 266, 5029, { unchecked: 1 })]
    expect(homeWeeks({ ...base, rows: before, updates: SEALAND_RUNS.map((r) => r.finishedAt), runs: SEALAND_RUNS, now: MONDAY })).toBeNull()
  })

  it('Össur, 5 Oct: a change subreddit discovery made inside the 4 Oct run, before its searches, does not cut the week that run gathered', () => {
    const rows = [row('2026-09-21', 143, 2625), row('2026-09-28', 177, 3217)]
    const handles: OurChange = { id: 'h15', surface: 'handles', changedAt: '2026-09-15T07:22:47Z', note: null, affects: [] }
    // Had the 4 Oct probe moved the active set (production's did not: amputee, bionics and prosthetics before and after).
    const probe: OurChange = { id: 'p4', surface: 'subreddits', changedAt: '2026-10-04T11:46:25Z', note: null, affects: [], preGatherRunId: '555af400' }
    const updates = OSSUR_RUNS.map((r) => r.finishedAt)
    // The axis is 17 Aug to 5 Oct: 28 Sep alone is drawn, the seventh column (21 Sep, with no update in it, stays off).
    const w = homeWeeks({ ...base, rows, changes: [handles, probe], updates, runs: OSSUR_RUNS, now: MONDAY })
    expect(w!.columns.map((c) => c.videos)).toEqual([null, null, null, null, null, null, 177, null])
    expect(w!.columns[6]).toEqual({ week: '2026-09-28', label: '28 Sep', videos: 177, comments: 3217, settled: false })
    // The same change made by a person at that instant cuts the week of 28 Sep, and the block is the empty frame.
    const { preGatherRunId: _r, ...byHand } = probe
    expect(homeWeeks({ ...base, rows, changes: [handles, byHand], updates, runs: OSSUR_RUNS, now: MONDAY })).toBeNull()
    // And production's log as it stands (no probe change, the 15 Sep handles change): 28 Sep is drawn.
    const asLogged = homeWeeks({ ...base, rows, changes: [handles], updates, runs: OSSUR_RUNS, now: MONDAY })!
    expect(asLogged.columns.map((c) => c.videos)).toEqual([null, null, null, null, null, null, 177, null])
    expect(asLogged.columns[6]).toMatchObject({ week: '2026-09-28', videos: 177, comments: 3217 })
  })

  it('the loader counts checked videos only, and hands the runs to the cut as well as the cadence', () => {
    const src = readFileSync(resolve(__dirname, 'home.ts'), 'utf8')
    expect(src).toMatch(/pooledWeekVolumes\(checkedRows\(input\.rows\.map\(marketWeekRowOf\)\)/)
    expect(src).toMatch(/weekRules\(input\.changes, axis, input\.runs\)/)
  })
})

describe('the tiles', () => {
  it('Your market: the month’s market videos and the three biggest subjects, as the read printed them', () => {
    const t = overviewTile(HOME_READ)!
    expect(t).toMatchObject({ title: 'Your market', big: '852', sub: 'videos in September' })
    expect(t.rows).toEqual([
      { kind: 'bar', label: 'Buying & delivery', copy: null, pct: 23, value: '23%' },
      { kind: 'bar', label: 'Looks & style', copy: null, pct: 17, value: '17%' },
      { kind: 'bar', label: 'Comfort', copy: null, pct: 7, value: '7%' },
    ])
    expect(overviewTile({ ...HOME_READ, market: null })).toBeNull()
    expect(overviewTile(null)).toBeNull()
  })

  it('a subject that is not ready prints no figure, and a small base prints its count', () => {
    expect(standingLevel(HOME_READ.standing[5], HOME_READ.figures)).toBeNull()
    const small = { ...HOME_READ.standing[0] }
    expect(standingLevel(small, {
      subj_buying_delivery_level: { label: 'x', value: '12', kind: 'count' },
      subj_buying_delivery_n: { label: 'x', value: '80', kind: 'count' },
    })).toEqual({ pct: null, value: '12 of 80' })
  })

  it('This week: the findings’ count, the read’s dates and the first three headlines', () => {
    const t = weekTile(HOME_READ)!
    expect(t).toMatchObject({ title: 'This week', big: '4', sub: 'findings, 21 to 27 September' })
    expect(t.rows.map((r) => r.label)).toEqual([
      'Buyers compare bags by exact travel and carry needs',
      'Comfort is judged with weight in the bag',
      'Colour can decide whether someone wants the bag',
    ])
    expect(t.rows.every((r) => r.copy === 'finding')).toBe(true)
    expect(weekTile({ ...HOME_READ, findings: [] })).toBeNull()
    expect(weekTile({ ...HOME_READ, findings: HOME_READ.findings.slice(0, 1) })?.sub).toBe('finding, 21 to 27 September')
  })

  const theme = (registryId: string, label: string, k: number, makerShare: number | null = 0.1, noiseShare: number | null = 0): HomeTheme =>
    ({ registryId, label, k, makerShare, noiseShare })

  it('Conversation: this week’s count, then the month’s biggest three as the board ranks them', () => {
    const t = voiceTile({
      weekThemes: 40,
      categoryN: 814,
      monthThemes: [
        theme('a', 'Admiration for handmade bag design', 155, 0.8),
        theme('b', 'Ready to buy the bag', 92, 0.33),
        theme('c', 'Questions about shipping and availability', 34),
        theme('d', 'Curiosity about featured product details', 22),
        theme('e', 'Price and sale status questions', 21),
        theme('f', '', 50),
        theme('g', 'Below the floor', 9),
      ],
    })!
    expect(t).toMatchObject({ title: 'Conversation', big: '40', sub: 'conversations this week' })
    expect(t.rows).toEqual([
      { kind: 'bar', label: 'Ready to buy the bag', copy: 'theme', pct: 11, value: '11%' },
      { kind: 'bar', label: 'Questions about shipping and availability', copy: 'theme', pct: 4, value: '4%' },
      { kind: 'bar', label: 'Curiosity about featured product details', copy: 'theme', pct: 3, value: '3%' },
    ])
    expect(voiceTile({ weekThemes: 0, categoryN: 814, monthThemes: [] })).toBeNull()
    expect(voiceTile({ weekThemes: null, categoryN: 814, monthThemes: [] })).toBeNull()
    expect(voiceTile({ weekThemes: 3, categoryN: 80, monthThemes: [theme('b', 'Ready to buy the bag', 12)] })!.rows[0]).toMatchObject({ pct: null, value: '12 of 80' })
  })

  it('Competitive: the brands you track', () => {
    expect(competitiveTile(9)).toMatchObject({ title: 'Competitive', big: '9', sub: 'brands you track', rows: [] })
    expect(competitiveTile(1)?.sub).toBe('brand you track')
    expect(competitiveTile(0)).toBeNull()
    expect(competitiveTile(null)).toBeNull()
  })

  it('Competitive: the two brands named most in the page\'s month, off the page\'s own brand list (the backfill, 1 Oct)', () => {
    const list = {
      month: '2026-09-01',
      rows: [{ label: 'Cotopaxi', k: 21, you: false }, { label: 'Patagonia', k: 12, you: false }, { label: 'Sealand', k: 12, you: true }],
    }
    expect(competitiveTile(9, list)!.rows).toEqual([{ kind: 'text', label: 'Named most in September', copy: null, value: 'Cotopaxi, Patagonia' }])
    // One named brand prints one; none named, or no list read, prints the
    // tile with no row (Insufficient data). There is no week reading of who
    // was named and no source for "compared on": neither row is drawn.
    expect(competitiveTile(9, { month: '2026-09-01', rows: [{ label: 'Cotopaxi', k: 3, you: false }] })!.rows[0].value).toBe('Cotopaxi')
    expect(competitiveTile(9, { month: '2026-09-01', rows: [] })!.rows).toEqual([])
    expect(competitiveTile(9, null)!.rows).toEqual([])
    expect(tileInsufficient(competitiveTile(9, null)!)).toBe(true)
    expect(tileInsufficient(competitiveTile(9, list)!)).toBe(false)
  })

  it('Subjects: how many you follow, the biggest this month and the one added last', () => {
    const subjects = [
      { name: 'Comfort', named_at: '2026-09-10T10:00:00Z' },
      { name: 'Buying & delivery', named_at: '2026-09-24T09:00:00Z' },
      { name: 'Price', named_at: '2026-09-12T10:00:00Z' },
    ]
    const now = '2026-09-29T08:00:00Z'
    const t = subjectsTile({ subjects, read: HOME_READ, now })!
    expect(t).toMatchObject({ title: 'Subjects', big: '3', sub: 'subjects you follow' })
    expect(t.rows).toEqual([
      { kind: 'text', label: 'Biggest this month', copy: null, value: 'Buying & delivery, 23%' },
      { kind: 'text', label: 'Added most recently', copy: null, value: 'Buying & delivery, 24 Sep' },
    ])
    expect(subjectsTile({ subjects, read: null, now })!.rows.map((r) => r.label)).toEqual(['Added most recently'])
    expect(subjectsTile({ subjects: [], read: HOME_READ, now })).toBeNull()
  })

  it('Subjects: a read of an ended month names it, never "this month" (fresh review B2, the crossing week)', () => {
    // The week of 28 Sep to 4 Oct is restated against September and reaches
    // the page once Heinrich sends it on Monday 5 Oct.
    const crossing: WeekReadDataV2 = { ...HOME_READ, window: { from: '2026-09-27T04:03:00Z', to: '2026-10-04T04:02:00Z' }, monthComplete: true }
    const t = subjectsTile({ subjects: [{ name: 'Comfort', named_at: null }], read: crossing, now: '2026-10-05T07:00:00Z' })!
    expect(t.rows[0]).toEqual({ kind: 'text', label: 'Biggest in September', copy: null, value: 'Buying & delivery, 23%' })
  })

  it('Your moves: posts published in the month, the moves worth considering and the moves you dated', () => {
    const t = movesTile({ month: '2026-09-01', posts: 25, advice: 5, moves: 0 })!
    expect(t).toMatchObject({ title: 'Your moves', big: '25', sub: 'posts published in September' })
    expect(t.rows).toEqual([
      { kind: 'text', label: 'Moves worth considering', copy: null, value: '5' },
      { kind: 'text', label: 'Moves you dated', copy: null, value: MOVES_NONE },
    ])
    expect(movesTile({ month: '2026-09-01', posts: 25, advice: 5, moves: 2 })!.rows[1].value).toBe('2')
    expect(movesTile({ month: '2026-09-01', posts: 0, advice: 0, moves: 0 })).toBeNull()
    expect(movesTile({ month: '2026-09-01', posts: null, advice: 5, moves: 1 })).toBeNull()
  })

  it('are always all six, in the artboard’s order; one not read is its title alone, marked insufficient (Heinrich, 1 Oct)', () => {
    const tiles = homeTiles([
      movesTile({ month: '2026-09-01', posts: 25, advice: 5, moves: 0 }),
      competitiveTile(9),
      null,
      overviewTile(HOME_READ),
      weekTile(HOME_READ),
    ])
    expect(tiles.map((t) => t.title)).toEqual(['Your market', 'This week', 'Conversation', 'Competitive', 'Subjects', 'Your moves'])
    const conversation = tiles.find((t) => t.key === 'voice')!
    expect(conversation).toMatchObject({ href: '/dashboard/voice', big: '', rows: [] })
    expect(tileInsufficient(conversation)).toBe(true)
    // Competitive keeps its number and says the rest is insufficient.
    expect(tiles.find((t) => t.key === 'competitive')).toMatchObject({ big: '9', sub: 'brands you track', rows: [] })
    expect(tileInsufficient(tiles.find((t) => t.key === 'competitive')!)).toBe(true)
    expect(tileInsufficient(tiles.find((t) => t.key === 'overview')!)).toBe(false)
    expect(INSUFFICIENT).toBe('Insufficient data')
  })
})

describe('Moves worth considering', () => {
  const copy = (id: string, run: string, at: string, status = 'new'): RecCopy => ({
    id, lineage_id: id, title: `Advice ${id}`, type: 'Product', status, created_at: at, run_id: run,
  })

  it('counts what Your moves’ short list draws: the decided ideas and a handful of the current ones', () => {
    const latest = Array.from({ length: 7 }, (_, i) => copy(`n${i}`, 'run-2', `2026-09-27T05:0${i}:00Z`))
    const older = [copy('o1', 'run-1', '2026-09-20T05:00:00Z'), copy('o2', 'run-1', '2026-09-20T05:01:00Z', 'in_progress')]
    // Seven current undecided ideas draw five; the decided one from the earlier update is drawn on top.
    expect(adviceCount([...older, ...latest], [])).toBe(6)
    expect(adviceCount(latest.slice(0, 3), null)).toBe(3)
    expect(adviceCount([], null)).toBe(0)
  })
})
