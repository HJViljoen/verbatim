import { describe, it, expect } from 'vitest'
import {
  BOOKKEEPING_COLUMNS,
  buildConfigSnapshot,
  isMissingBookkeepingColumn,
  isMissingClusteringKeyColumn,
  openRunBookkeeping,
  previousRunEnd,
  gatheredNothing,
  rowWindow,
  reconstructWindow,
  closingMessage,
  CONFIG_SNAPSHOT_COLUMNS,
} from './run-bookkeeping'
import { periodWindowDays } from '../config'
import type { RunWindow } from './window'

// The bookkeeping a run row carries about itself. Each of these was a decision
// living inside the Inngest function (and inside the backfill script) where no
// test could reach it: which rows count as windowed, what a snapshot compares,
// what a reconstructed window claims.

describe('rowWindow — which rows count as carrying a window', () => {
  it('reads a full row back as the window it stored', () => {
    expect(
      rowWindow({
        window_start: '2026-09-13T04:06:38.483Z',
        window_end: '2026-09-20T04:00:00.000Z',
        window_basis: 'anchored',
      }),
    ).toEqual({
      start: '2026-09-13T04:06:38.483Z',
      end: '2026-09-20T04:00:00.000Z',
      basis: 'anchored',
    })
  })

  it('keeps a baseline run, which has an end and a basis but no start', () => {
    expect(rowWindow({ window_start: null, window_end: '2026-09-20T04:00:00.000Z', window_basis: 'baseline' }))
      .toEqual({ start: null, end: '2026-09-20T04:00:00.000Z', basis: 'baseline' })
  })

  it('refuses a row with an end but no basis — an unlabelled bound is not a window', () => {
    // The gate that decides whether a resume keeps the window on the row or
    // computes a fresh one. A bound nothing can explain must not be presented
    // as a record of what the run gathered.
    expect(rowWindow({ window_start: '2026-09-13T04:06:38.483Z', window_end: '2026-09-20T04:00:00.000Z' })).toBeNull()
    expect(rowWindow({ window_end: '2026-09-20T04:00:00.000Z', window_basis: null })).toBeNull()
  })

  it('refuses a row with no end, and a row that is not there at all', () => {
    expect(rowWindow({ window_start: '2026-09-13T04:06:38.483Z', window_basis: 'anchored' })).toBeNull()
    expect(rowWindow(null)).toBeNull()
    expect(rowWindow(undefined)).toBeNull()
  })
})

describe('buildConfigSnapshot', () => {
  const full = {
    brand_keywords: ['össur'],
    competitor_keywords: ['ottobock'],
    industry_keywords: ['prosthetics'],
    exclude_terms: ['movie'],
    competitor_names: ['Ottobock'],
    own_handles: { instagram: 'ossur' },
    competitor_handles: { Ottobock: { instagram: 'ottobock' } },
    platforms: ['instagram', 'reddit'],
    subreddits: [{ name: 'amputee', status: 'active', probe: { at: '2026-09-01' } }],
    report_period: 'weekly',
    report_day: 'sunday',
    max_videos: 40,
    max_comments: 200,
    comment_depth: 2,
  }

  it('freezes exactly the fields the snapshot columns name, in a fixed shape', () => {
    const snap = buildConfigSnapshot(full)
    const named = CONFIG_SNAPSHOT_COLUMNS.split(',').map((c) => c.trim())
    expect(Object.keys(snap).sort()).toEqual([...named].sort())
  })

  it('keeps subreddits as name + status only — probe detail is churn', () => {
    expect(buildConfigSnapshot(full).subreddits).toEqual([{ name: 'amputee', status: 'active' }])
  })

  it('gives an absent config the empty shape rather than nulls', () => {
    // A run on a tenant with no config row still has to produce something two
    // runs can be compared on.
    const snap = buildConfigSnapshot(null)
    expect(snap.brand_keywords).toEqual([])
    expect(snap.own_handles).toEqual({})
    expect(snap.subreddits).toEqual([])
    expect(snap.report_period).toBeNull()
    expect(snap.max_videos).toBeNull()
  })

  it('strips what Postgres cannot store from model-touched text', () => {
    // Keyword text reaches tracking_configs from the discovery passes, so the
    // snapshot goes through dbSafeJson like any other model-authored write.
    const snap = buildConfigSnapshot({ brand_keywords: ['run\u0000ning blade'] })
    expect(snap.brand_keywords).toEqual(['running blade'])
  })
})

describe('previousRunEnd — what the next window anchors on', () => {
  it('takes the window a run covered, not when it closed', () => {
    // f9548a97 took 18 days to close a week: what the next run must pick up
    // from is where its gather stopped.
    expect(previousRunEnd(
      [{ id: 'a', window_end: '2026-07-03T10:31:23.000Z', completed_at: '2026-07-21T12:03:22.000Z' }],
      [],
    )).toBe('2026-07-03T10:31:23.000Z')
  })

  it('falls back to completed_at for a row with no window', () => {
    expect(previousRunEnd([{ id: 'a', window_end: null, completed_at: '2026-09-13T06:26:49.308Z' }], []))
      .toBe('2026-09-13T06:26:49.308Z')
  })

  it('is not fooled by a resumed run that closed later than the run after it', () => {
    // A covers 1-2 Sep, B covers 8-9 Sep, then A is resumed on the 10th — which
    // moves A.completed_at and leaves A.window_end where it belongs. Anchoring
    // on "the run that closed last" would open the next window on 1 Sep and
    // re-buy a week of per-video comment scrapes.
    const rows = [
      { id: 'a', window_end: '2026-09-01T04:00:00.000Z', completed_at: '2026-09-10T09:00:00.000Z' },
      { id: 'b', window_end: '2026-09-08T04:00:00.000Z', completed_at: '2026-09-09T06:00:00.000Z' },
    ]
    expect(previousRunEnd(rows, [])).toBe('2026-09-08T04:00:00.000Z')
  })

  it('never anchors on this run itself, or on the row a resume is reopening', () => {
    const rows = [
      { id: 'mine', window_end: '2026-09-20T04:00:00.000Z', completed_at: null },
      { id: 'prev', window_end: '2026-09-13T04:06:38.483Z', completed_at: '2026-09-13T06:26:49.308Z' },
    ]
    expect(previousRunEnd(rows, ['mine'])).toBe('2026-09-13T04:06:38.483Z')
  })

  it('is null when the client has nothing closed to anchor on', () => {
    expect(previousRunEnd([], [])).toBeNull()
    expect(previousRunEnd([{ id: 'a', window_end: null, completed_at: null }], [])).toBeNull()
    expect(previousRunEnd([{ id: 'a', window_end: 'not a date' }], [])).toBeNull()
  })

  it('never anchors on a fresh skipGather run — it gathered nothing', () => {
    // Sealand 2026-09-24: rehearsal e80e9347 ({skipGather:true}, its own row)
    // opened an anchored window 20 → 24 Sep, scraped nothing and closed
    // partial. Anchoring on it would start Sunday's run on the 24th.
    const rows = [
      { id: 'e80e9347', window_end: '2026-09-24T09:00:00.000Z', completed_at: '2026-09-24T10:00:00.000Z', options: { skipGather: true } },
      { id: 'b67b56de', window_end: '2026-09-20T04:02:57.874Z', completed_at: '2026-09-20T06:00:00.000Z', options: { sendReport: true, scheduledFor: '2026-09-20T04:00:00.000Z' } },
    ]
    expect(previousRunEnd(rows, [])).toBe('2026-09-20T04:02:57.874Z')
  })

  it('still anchors on a resumed run — its window is the gather it already did', () => {
    // {runId: <itself>, skipGather: true} is the resume lever; open-run
    // overwrites the row's options, but the window is the original gather's.
    const rows = [
      { id: '5a2ebc43', window_end: '2026-09-13T10:03:04.451Z', options: { runId: '5a2ebc43', skipGather: true } },
      { id: 'older', window_end: '2026-09-06T10:03:04.451Z', options: {} },
    ]
    expect(previousRunEnd(rows, [])).toBe('2026-09-13T10:03:04.451Z')
  })

  it('is null when the only closed runs gathered nothing', () => {
    expect(previousRunEnd([{ id: 'r', window_end: '2026-09-24T09:00:00.000Z', options: { skipGather: true } }], [])).toBeNull()
  })

  it('compares instants, not strings — PostgREST spells them with +00', () => {
    const rows = [
      { id: 'a', window_end: '2026-09-13 04:06:38.483+00' },
      { id: 'b', window_end: '2026-09-06T04:00:00.000Z' },
    ]
    expect(previousRunEnd(rows, [])).toBe('2026-09-13 04:06:38.483+00')
  })
})

describe('gatheredNothing — which closed runs cannot anchor a window', () => {
  it('a fresh skipGather run gathered nothing', () => {
    expect(gatheredNothing({ id: 'a', options: { skipGather: true } })).toBe(true)
    // A skipGather run naming ANOTHER row is not a resume of itself either.
    expect(gatheredNothing({ id: 'a', options: { skipGather: true, runId: 'b' } })).toBe(true)
  })

  it('a resume of itself, a gathering run and a row without options did gather', () => {
    expect(gatheredNothing({ id: 'a', options: { skipGather: true, runId: 'a' } })).toBe(false)
    expect(gatheredNothing({ id: 'a', options: { skipGather: false } })).toBe(false)
    expect(gatheredNothing({ id: 'a', options: { sendReport: true } })).toBe(false)
    expect(gatheredNothing({ id: 'a', options: null })).toBe(false)
    expect(gatheredNothing({ id: 'a' })).toBe(false)
  })
})

describe('openRunBookkeeping — what a resume may and may not rewrite', () => {
  const window: RunWindow = {
    start: '2026-09-13T04:06:38.483Z',
    end: '2026-09-20T04:00:00.000Z',
    basis: 'anchored',
  }
  const snapshot = { brand_keywords: ['össur'] }
  const clusteringKey = 'a=pass_a_v4.1;c=0.58;f=2;m=gpt-5.4;k=video_v1'

  it('writes the whole set on a fresh run, with the slot explicitly null when manual', () => {
    expect(openRunBookkeeping({ period: 'weekly', window, snapshot, clusteringKey })).toEqual({
      period: 'weekly',
      window_start: window.start,
      window_end: window.end,
      window_basis: 'anchored',
      clustering_key: clusteringKey,
      scheduled_for: null,
      config_snapshot: snapshot,
    })
  })

  it('writes the clustering regime on a resume too — the resume does the clustering', () => {
    // A resumed run keeps its id, its slot and its gathered configuration, but
    // it re-runs Step A2 and persist-themes under TODAY's constants. The themes
    // it writes came from this invocation's clustering, and the month rows
    // frozen from them have to say so.
    const w = openRunBookkeeping({
      period: 'weekly', window, snapshot, clusteringKey, resume: { hasConfigSnapshot: true },
    })
    expect(w.clustering_key).toBe(clusteringKey)
  })

  it('records the dispatcher slot a scheduled run served', () => {
    const w = openRunBookkeeping({
      period: 'weekly', window, snapshot, clusteringKey, scheduledFor: '2026-09-20T04:00:00.000Z',
    })
    expect(w.scheduled_for).toBe('2026-09-20T04:00:00.000Z')
  })

  it('leaves the slot alone on a resume that carries none', () => {
    // Sunday's run opens with scheduled_for = the 04:00 UTC slot and its
    // analysis half dies. The operator resumes it with {runId, skipGather:true},
    // which names no slot. Writing null there would read as "nobody started
    // Sunday's run" for a slot that was served.
    const w = openRunBookkeeping({
      period: 'weekly', window: { ...window, basis: 'resume' }, snapshot, clusteringKey,
      resume: { hasConfigSnapshot: true },
    })
    expect('scheduled_for' in w).toBe(false)
    expect(w.window_basis).toBe('resume')
  })

  it('leaves a config snapshot the row already carries alone', () => {
    // The snapshot's whole purpose is explaining the configuration the run
    // GATHERED under; today's config is a different fact.
    const w = openRunBookkeeping({
      period: 'weekly', window, snapshot, clusteringKey, resume: { hasConfigSnapshot: true },
    })
    expect('config_snapshot' in w).toBe(false)
  })

  it('does write a snapshot when the resumed row has none', () => {
    // A run opened before the columns existed. The resume's analysis half does
    // read today's config, so recording it beats recording nothing.
    const w = openRunBookkeeping({
      period: 'weekly', window, snapshot, clusteringKey, resume: { hasConfigSnapshot: false },
    })
    expect(w.config_snapshot).toBe(snapshot)
  })

  it('writes a slot on a resume that genuinely has one', () => {
    const w = openRunBookkeeping({
      period: 'weekly', window, snapshot, clusteringKey, scheduledFor: '2026-09-27T04:00:00.000Z',
      resume: { hasConfigSnapshot: true },
    })
    expect(w.scheduled_for).toBe('2026-09-27T04:00:00.000Z')
  })
})

describe('isMissingBookkeepingColumn — surviving a deploy that lands before its migration', () => {
  it('recognises 42703 on any bookkeeping column', () => {
    for (const column of BOOKKEEPING_COLUMNS) {
      expect(isMissingBookkeepingColumn({
        code: '42703',
        message: `column "${column}" of relation "pipeline_runs" does not exist`,
      })).toBe(true)
    }
  })

  it('recognises the PostgREST schema-cache miss too', () => {
    expect(isMissingBookkeepingColumn({
      code: 'PGRST204',
      message: "Could not find the 'window_basis' column of 'pipeline_runs' in the schema cache",
    })).toBe(true)
  })

  it('does not swallow a real write failure', () => {
    // Narrow on purpose: the point is to survive a deploy ordering, not to let
    // open-run pretend a broken insert worked.
    expect(isMissingBookkeepingColumn({ code: '23505', message: 'duplicate key value violates unique constraint' })).toBe(false)
    expect(isMissingBookkeepingColumn({ code: '23514', message: 'new row violates check constraint "pipeline_runs_window_basis_check"' })).toBe(false)
    expect(isMissingBookkeepingColumn({ code: '42703', message: 'column "videos_scraped" does not exist' })).toBe(false)
    expect(isMissingBookkeepingColumn(null)).toBe(false)
    expect(isMissingBookkeepingColumn('42703')).toBe(false)
  })

  it('leaves clustering_key out of the group, so a missing key never costs the window', () => {
    // The seven arrived in one migration; clustering_key arrived three days
    // later. If it joined the group, a database with the window columns and
    // without the key would re-issue the write as a bare row — no
    // window_start, no window_end, no basis — and every step after open-run
    // would fall back to the clock.
    const missingKey = { code: '42703', message: 'column "clustering_key" of relation "pipeline_runs" does not exist' }
    expect(isMissingBookkeepingColumn(missingKey)).toBe(false)
    expect(isMissingClusteringKeyColumn(missingKey)).toBe(true)
    expect(isMissingClusteringKeyColumn({
      code: 'PGRST204',
      message: "Could not find the 'clustering_key' column of 'pipeline_runs' in the schema cache",
    })).toBe(true)
    expect(isMissingClusteringKeyColumn({ code: '42703', message: 'column "window_basis" does not exist' })).toBe(false)
    expect(isMissingClusteringKeyColumn(null)).toBe(false)
  })

  it('omits the column rather than writing null when the narrow retry drops the key', () => {
    // What open-run re-issues on a 42703 for clustering_key alone: the same
    // row, window and all, minus one key.
    const window = { start: '2026-09-13T04:06:38.483Z', end: '2026-09-20T04:00:00.000Z', basis: 'anchored' as const }
    const w = openRunBookkeeping({ period: 'weekly', window, snapshot: { brand_keywords: ['össur'] } })
    expect('clustering_key' in w).toBe(false)
    expect(w.window_start).toBe(window.start)
    expect(w.window_end).toBe(window.end)
    expect(w.window_basis).toBe('anchored')
    expect(w.config_snapshot).toEqual({ brand_keywords: ['össur'] })
  })
})

describe('reconstructWindow — the backfill label', () => {
  it('is [started_at − periodWindowDays, started_at]', () => {
    // f9548a97 opened 2026-07-03 on a weekly cadence: the rule its own code
    // followed put the lower bound seven days back.
    const w = reconstructWindow('2026-07-03T10:31:23.000Z', 'weekly')
    expect(w).toEqual({ start: '2026-06-26T10:31:23.000Z', end: '2026-07-03T10:31:23.000Z' })
    expect(Date.parse(w.end) - Date.parse(w.start)).toBe(periodWindowDays('weekly') * 86_400_000)
  })

  it('follows the period, including the paused tenant’s seven days', () => {
    expect(Date.parse(reconstructWindow('2026-08-17T15:05:59.583Z', 'paused').start))
      .toBe(Date.parse('2026-08-17T15:05:59.583Z') - 7 * 86_400_000)
    expect(Date.parse(reconstructWindow('2026-08-17T15:05:59.583Z', 'monthly').start))
      .toBe(Date.parse('2026-08-17T15:05:59.583Z') - 30 * 86_400_000)
  })

  it('normalises the end to an ISO instant, whatever the row spelled', () => {
    // pipeline_runs.started_at comes back from PostgREST as '+00:00', not 'Z'.
    expect(reconstructWindow('2026-07-03 10:31:23+00', 'weekly').end).toBe('2026-07-03T10:31:23.000Z')
  })
})

describe('closingMessage — the epitaph on a stranded run', () => {
  it('is dated, names the status it was stuck at and the day it opened', () => {
    // Össur 06706296: 'analyzing' since 2026-06-13, closed by the operator
    // under D5. The message is the only record of a hand-made decision.
    expect(closingMessage('analyzing', '2026-06-13T08:20:25.805Z', new Date('2026-09-17T19:30:00.000Z')))
      .toBe('closed by operator on 2026-09-17: stranded at analyzing since 2026-06-13')
  })

  it('reads a PostgREST timestamp as happily as an ISO one', () => {
    // started_at comes back '2026-06-13 08:20:25.80529+00'; the day is the day
    // either way, and no parsing is involved — only the first ten characters.
    expect(closingMessage('running', '2026-06-13 08:20:25.80529+00', new Date('2026-09-17T00:00:00.000Z')))
      .toBe('closed by operator on 2026-09-17: stranded at running since 2026-06-13')
  })
})
