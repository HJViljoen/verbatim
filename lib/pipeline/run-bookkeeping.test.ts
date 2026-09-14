import { describe, it, expect } from 'vitest'
import {
  BOOKKEEPING_COLUMNS,
  buildConfigSnapshot,
  isMissingBookkeepingColumn,
  openRunBookkeeping,
  rowWindow,
  reconstructWindow,
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

describe('openRunBookkeeping — what a resume may and may not rewrite', () => {
  const window: RunWindow = {
    start: '2026-09-13T04:06:38.483Z',
    end: '2026-09-20T04:00:00.000Z',
    basis: 'anchored',
  }
  const snapshot = { brand_keywords: ['össur'] }

  it('writes the whole set on a fresh run, with the slot explicitly null when manual', () => {
    expect(openRunBookkeeping({ period: 'weekly', window, snapshot })).toEqual({
      period: 'weekly',
      window_start: window.start,
      window_end: window.end,
      window_basis: 'anchored',
      scheduled_for: null,
      config_snapshot: snapshot,
    })
  })

  it('records the dispatcher slot a scheduled run served', () => {
    const w = openRunBookkeeping({
      period: 'weekly', window, snapshot, scheduledFor: '2026-09-20T04:00:00.000Z',
    })
    expect(w.scheduled_for).toBe('2026-09-20T04:00:00.000Z')
  })

  it('leaves the slot alone on a resume that carries none', () => {
    // Sunday's run opens with scheduled_for = the 04:00 UTC slot and its
    // analysis half dies. The operator resumes it with {runId, skipGather:true},
    // which names no slot. Writing null there would read as "nobody started
    // Sunday's run" for a slot that was served.
    const w = openRunBookkeeping({
      period: 'weekly', window: { ...window, basis: 'resume' }, snapshot,
      resume: { hasConfigSnapshot: true },
    })
    expect('scheduled_for' in w).toBe(false)
    expect(w.window_basis).toBe('resume')
  })

  it('leaves a config snapshot the row already carries alone', () => {
    // The snapshot's whole purpose is explaining the configuration the run
    // GATHERED under; today's config is a different fact.
    const w = openRunBookkeeping({
      period: 'weekly', window, snapshot, resume: { hasConfigSnapshot: true },
    })
    expect('config_snapshot' in w).toBe(false)
  })

  it('does write a snapshot when the resumed row has none', () => {
    // A run opened before the columns existed. The resume's analysis half does
    // read today's config, so recording it beats recording nothing.
    const w = openRunBookkeeping({
      period: 'weekly', window, snapshot, resume: { hasConfigSnapshot: false },
    })
    expect(w.config_snapshot).toBe(snapshot)
  })

  it('writes a slot on a resume that genuinely has one', () => {
    const w = openRunBookkeeping({
      period: 'weekly', window, snapshot, scheduledFor: '2026-09-27T04:00:00.000Z',
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
