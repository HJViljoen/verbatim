import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { alertDue, createWarningLog, parseRunWarnings, runWarning, warningSentence, WARNING_STEPS } from './run-warnings'
import {
  comparableHistory, historyFromRows, searchFound, searchVolumeCause, searchVolumeCollapse, searchVolumeJudged, windowDays,
  SEARCH_VOLUME_COLLAPSE_RATIO, SEARCH_VOLUME_FETCH_RUNS, SEARCH_VOLUME_HISTORY_RUNS, SEARCH_VOLUME_MIN_HISTORY, SEARCH_VOLUME_MIN_MEDIAN,
  SEARCH_VOLUME_WINDOW_FACTOR, type SearchHistoryRun,
} from './search-volume'

const PIPELINE = readFileSync(join(__dirname, '..', '..', 'inngest', 'functions', 'pipeline.ts'), 'utf8')

const run = (found: number, over: Partial<SearchHistoryRun> = {}): SearchHistoryRun => ({
  runId: `r${found}`, startedAt: null, windowDays: 7, capped: false, found, ...over,
})

describe('the thresholds', () => {
  it('are the ones the warning is documented with', () => {
    expect(SEARCH_VOLUME_HISTORY_RUNS).toBe(4)
    expect(SEARCH_VOLUME_MIN_HISTORY).toBe(3)
    expect(SEARCH_VOLUME_MIN_MEDIAN).toBe(50)
    expect(SEARCH_VOLUME_COLLAPSE_RATIO).toBe(0.25)
    expect(SEARCH_VOLUME_WINDOW_FACTOR).toBe(2)
    expect(SEARCH_VOLUME_FETCH_RUNS).toBeGreaterThanOrEqual(SEARCH_VOLUME_HISTORY_RUNS)
  })

  it('warns strictly under a quarter of the median, never at it', () => {
    expect(searchVolumeCollapse('instagram', 49, [200, 200, 200, 200])).toMatchObject({ found: 49, median: 200, runs: 4 })
    expect(searchVolumeCollapse('instagram', 50, [200, 200, 200, 200])).toBeNull()
    expect(searchVolumeCollapse('instagram', 0, [200, 200, 200])).toMatchObject({ found: 0, ratio: 0 })
  })

  it('says nothing on fewer than three comparable runs, or under a median of 50', () => {
    expect(searchVolumeCollapse('reddit', 0, [400, 400])).toBeNull()
    expect(searchVolumeCollapse('reddit', 0, [])).toBeNull()
    expect(searchVolumeCollapse('reddit', 0, null)).toBeNull()
    expect(searchVolumeCollapse('reddit', 0, undefined)).toBeNull()
    // A small tenant: 49 → 5 is a quarter-drop on a volume too small to judge.
    expect(searchVolumeCollapse('reddit', 5, [49, 49, 49, 49])).toBeNull()
    expect(searchVolumeCollapse('reddit', 5, [50, 50, 50, 50])).toMatchObject({ median: 50 })
  })

  it('takes the median, so one outlier in the history neither raises nor sinks it', () => {
    expect(searchVolumeCollapse('instagram', 54, [88, 559, 559, 481])?.median).toBe(520)
    expect(searchVolumeCollapse('tiktok', 50, [5000, 300, 320, 310])?.median).toBe(315)
    expect(searchVolumeCollapse('tiktok', 50, [300, 320, 310])?.median).toBe(310)
  })
})

describe('what counts as found, and as comparable', () => {
  it('found is each term’s distinct videos summed, a term’s variants together (keyword_performance.videos_found)', () => {
    const v = (...ids: string[]) => ids.map((video_id) => ({ video_id }))
    expect(searchFound([
      { keyword: 'amputee', videos: v('a', 'b', 'c') }, // reels
      { keyword: 'amputee', videos: v('c', 'd') }, // posts: c again, same term
      { keyword: 'prosthetics', videos: v('a') }, // a again, another term: counts for it too
      { keyword: 'bionics', videos: [] }, // a failed search
    ])).toBe(5)
    expect(searchFound([])).toBe(0)
  })

  it('a comparable run is uncapped, found something, and has a window within a factor of two; newest first, four at most', () => {
    const runs = [
      run(10, { capped: true }), // a capped test run
      run(0), // every search failed: an outage, not a level
      run(300, { windowDays: 21 }), // a catch-up run
      run(301, { windowDays: null }), // a baseline run
      run(302, { windowDays: 14 }), // within the factor
      run(303, { windowDays: 3.5 }), // within the factor
      run(304), run(305), run(306), // the fifth comparable one is not read
    ]
    expect(comparableHistory(runs, 7)).toEqual([302, 303, 304, 305])
    expect(comparableHistory(runs, 21)).toEqual([300, 302])
  })

  it('reads the embedded rows: found summed over the platform’s terms, capped off the options, the window in days', () => {
    expect(historyFromRows([
      { id: 'a', started_at: '2026-11-22T04:00:00Z', window_start: '2026-11-15T04:00:00Z', window_end: '2026-11-22T04:00:00Z', options: { sendReport: true }, keyword_performance: [{ videos_found: 10 }, { videos_found: 7 }] },
      { id: 'b', started_at: null, window_start: null, window_end: '2026-11-15T04:00:00Z', options: { maxVideos: 5 }, keyword_performance: null },
      { id: 'c', started_at: null, window_start: '2026-11-01T00:00:00Z', window_end: '2026-11-15T00:00:00Z', options: { videoLimit: 3 }, keyword_performance: [{ videos_found: null }] },
    ])).toEqual([
      { runId: 'a', startedAt: '2026-11-22T04:00:00Z', windowDays: 7, capped: false, found: 17 },
      { runId: 'b', startedAt: null, windowDays: null, capped: true, found: 0 },
      { runId: 'c', startedAt: null, windowDays: 14, capped: true, found: 0 },
    ])
  })

  it('a run is judged only when uncapped and windowed', () => {
    const week = { start: '2026-11-15T04:00:00Z', end: '2026-11-22T04:00:00Z' }
    expect(searchVolumeJudged({}, week)).toBe(true)
    expect(searchVolumeJudged({ sendReport: true, publish: false } as never, week)).toBe(true)
    expect(searchVolumeJudged({ maxVideos: 5 }, week)).toBe(false)
    expect(searchVolumeJudged({ videoLimit: 10 }, week)).toBe(false)
    expect(searchVolumeJudged({}, { start: null, end: week.end })).toBe(false)
    expect(searchVolumeJudged({}, null)).toBe(false)
    expect(windowDays('2026-11-22T04:00:00Z', '2026-11-15T04:00:00Z')).toBeNull()
    // Production's windows, to a tenth: a week ends seconds short of seven
    // days, Sealand's 18 Nov catch-up 13.986, Össur's 4 Oct 21.319.
    expect(windowDays('2026-11-15T04:00:30.305Z', '2026-11-22T04:00:24.132Z')).toBe(7)
    expect(windowDays('2026-11-04T14:18:36Z', '2026-11-18T13:58:36Z')).toBe(14)
  })
})

// ---- production, read-only, 24 Nov: Σ keyword_performance.videos_found per run and platform

type Row = { day: string; windowDays: number; found: Record<'instagram' | 'tiktok' | 'reddit' | 'youtube', number> }
const f = (instagram: number, tiktok: number, reddit: number, youtube: number) => ({ instagram, tiktok, reddit, youtube })
const OSSUR: Row[] = [
  { day: '2026-10-04', windowDays: 21, found: f(364, 278, 196, 466) },
  { day: '2026-10-12', windowDays: 7, found: f(255, 196, 196, 462) },
  { day: '2026-10-18', windowDays: 7, found: f(257, 261, 215, 453) },
  { day: '2026-10-28', windowDays: 7, found: f(265, 208, 233, 469) },
  { day: '2026-11-01', windowDays: 7, found: f(249, 244, 233, 457) },
  { day: '2026-11-08', windowDays: 7, found: f(242, 248, 233, 489) },
  { day: '2026-11-15', windowDays: 7, found: f(0, 0, 0, 479) }, // partial: those searches failed
  { day: '2026-11-22', windowDays: 7, found: f(17, 229, 233, 474) },
]
const SEALAND: Row[] = [
  { day: '2026-09-20', windowDays: 10, found: f(608, 774, 475, 1541) },
  { day: '2026-09-27', windowDays: 7, found: f(565, 367, 475, 1382) },
  { day: '2026-10-04', windowDays: 7, found: f(570, 363, 475, 1444) },
  { day: '2026-10-11', windowDays: 7, found: f(510, 452, 475, 1443) },
  { day: '2026-10-18', windowDays: 7, found: f(522, 537, 515, 1504) },
  { day: '2026-10-28', windowDays: 7, found: f(481, 596, 515, 1589) },
  { day: '2026-11-05', windowDays: 7, found: f(559, 485, 515, 1513) },
  { day: '2026-11-09', windowDays: 7, found: f(559, 657, 515, 1543) }, // failed in Pass A, its gather whole
  { day: '2026-11-18', windowDays: 14, found: f(88, 902, 515, 1723) },
  { day: '2026-11-22', windowDays: 7, found: f(54, 636, 515, 1555) },
]

/** Every warning the rule would have raised over a tenant's runs, each run
 *  judged against the runs before it, newest first. */
function replay(rows: Row[]): string[] {
  const out: string[] = []
  rows.forEach((r, i) => {
    for (const platform of ['instagram', 'tiktok', 'reddit', 'youtube'] as const) {
      const before = rows.slice(0, i).reverse().map((p) => run(p.found[platform], { windowDays: p.windowDays }))
      const c = searchVolumeCollapse(platform, r.found[platform], comparableHistory(before, r.windowDays))
      if (c) out.push(`${r.day} ${searchVolumeCause(c)}`)
    }
  })
  return out
}

describe('over production’s runs since 20 Sep', () => {
  it('Össur: the 15 Nov failed searches and the 22 Nov Instagram collapse, nothing else', () => {
    expect(replay(OSSUR)).toEqual([
      '2026-11-15 Instagram searches found 0 videos this update, 0% of their median of 253 over the last 4 comparable updates',
      '2026-11-15 TikTok searches found 0 videos this update, 0% of their median of 246 over the last 4 comparable updates',
      '2026-11-15 Reddit searches found 0 videos this update, 0% of their median of 233 over the last 4 comparable updates',
      '2026-11-22 Instagram searches found 17 videos this update, 7% of their median of 253 over the last 4 comparable updates',
    ])
  })

  it('Sealand: Instagram on 18 and 22 Nov, nothing else', () => {
    expect(replay(SEALAND)).toEqual([
      '2026-11-18 Instagram searches found 88 videos this update, 16% of their median of 541 over the last 4 comparable updates',
      '2026-11-22 Instagram searches found 54 videos this update, 10% of their median of 520 over the last 4 comparable updates',
    ])
  })
})

describe('the warning it raises', () => {
  const cause = searchVolumeCause({ platform: 'instagram', found: 17, median: 253, runs: 4, ratio: 17 / 253 })

  it('is stale-data, names the platform and the numbers, and sends the run’s one alert', () => {
    expect(WARNING_STEPS['search-volume'].kind).toBe('stale-data')
    const log = createWarningLog()
    log.note('search-volume', cause, { week: '2026-11-15T04:00:00Z', platform: 'instagram' })
    expect(log.recorded).toEqual([{
      step: 'search-volume',
      kind: 'stale-data',
      week: '2026-11-15',
      platform: 'instagram',
      cause: 'Instagram searches found 17 videos this update, 7% of their median of 253 over the last 4 comparable updates',
      stale: 'This update read far fewer Instagram videos than usual, so its Instagram figures, and every share that counts them, are thin and do not compare with the weeks before.',
    }])
    expect(alertDue(0, log)).toBe(true)
  })

  it('reads back with its platform and says itself on the ops page', () => {
    const w = runWarning('search-volume', cause, { week: '2026-11-15T04:00:00Z', platform: 'instagram' })
    expect(parseRunWarnings([w])).toEqual([w])
    expect(warningSentence(w)).toBe(
      'Stale data: the search volume for the week of 15 Nov 2026 fell far below its usual level (Instagram searches found 17 videos this update, 7% of their median of 253 over the last 4 comparable updates). This update read far fewer Instagram videos than usual, so its Instagram figures, and every share that counts them, are thin and do not compare with the weeks before.',
    )
    expect(runWarning('search-volume', cause).stale).toMatch(/^This update read far fewer videos than usual on one platform/)
  })
})

describe('the pipeline', () => {
  it('reads the history inside the platform’s own gate step, judged runs only, and adds no step', () => {
    const gate = PIPELINE.slice(PIPELINE.indexOf('const gate = await step.run(`gate:${platform}`'))
    const body = gate.slice(0, gate.indexOf('totalVideos += gate.videosKept'))
    expect(body).toContain('const gated = await gatePlatform(')
    expect(body).toContain('searchVolumeJudged(options, runWindow)')
    expect(body).toContain('await loadSearchHistory(createAdminClient(), { clientId, runId, platform, window: runWindow })')
    expect(body).toContain('return { ...gated, searchHistory }')
    expect(PIPELINE).not.toMatch(/\.run\(['`]search-volume/)
  })

  it('notes a warning off the memoised searches and the gate’s history, never an error', () => {
    const after = PIPELINE.slice(PIPELINE.indexOf('totalVideos += gate.videosKept'))
    const lines = after.slice(0, after.indexOf('const commentBatches'))
    expect(lines).toContain('searchVolumeCollapse(platform, searchFound(searches), gate.searchHistory ?? null)')
    expect(lines).toContain("noteWarning('search-volume', searchVolumeCause(searchCollapse), { week: runWindow?.start ?? null, platform })")
    expect(PIPELINE.match(/noteWarning\('search-volume'/g)).toHaveLength(1)
    expect(PIPELINE).not.toContain("noteError('search-volume'")
  })
})
