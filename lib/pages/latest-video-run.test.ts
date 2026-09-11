import { describe, expect, it } from 'vitest'
import { pickLatestVideoRun } from './latest-video-run'

// The selection rule only (the fetch around it is I/O — AGENTS.md: pure logic).

describe('pickLatestVideoRun', () => {
  it('takes the newest update that gathered videos', () => {
    expect(pickLatestVideoRun([
      { run_id: 'older', scraped_at: '2026-08-16T00:00:00Z' },
      { run_id: 'newest', scraped_at: '2026-08-30T00:00:00Z' },
      { run_id: 'middle', scraped_at: '2026-08-23T00:00:00Z' },
    ])).toEqual({ runId: 'newest', scrapedAt: '2026-08-30T00:00:00Z' })
  })

  it('falls back past an analysis-only update that gathered nothing', () => {
    // An analysis-only update re-reads the corpus and writes no video rows, so
    // it is simply absent from the rows and the previous update still answers.
    expect(pickLatestVideoRun([
      { run_id: 'gathered', scraped_at: '2026-08-23T00:00:00Z' },
    ])).toEqual({ runId: 'gathered', scrapedAt: '2026-08-23T00:00:00Z' })
  })

  it('never picks an in-flight update, even once it has written video rows', () => {
    expect(pickLatestVideoRun([
      { run_id: 'closed', scraped_at: '2026-08-23T00:00:00Z' },
      { run_id: 'running', scraped_at: '2026-08-30T00:00:00Z' },
    ], ['running'])?.runId).toBe('closed')
  })

  it('ranks an undated update oldest and ignores rows with no run', () => {
    expect(pickLatestVideoRun([
      { run_id: 'dated', scraped_at: '2026-08-23T00:00:00Z' },
      { run_id: 'undated' },
      { run_id: null, scraped_at: '2026-09-01T00:00:00Z' },
    ])?.runId).toBe('dated')
    expect(pickLatestVideoRun([{ run_id: 'undated' }])).toEqual({ runId: 'undated', scrapedAt: null })
  })

  it('skips a video orphaned by a deleted update', () => {
    // videos.run_id is nullable with an ON DELETE SET NULL FK, so deleting a
    // pipeline_runs row leaves its videos behind with no run. The query filters
    // these out (a .limit(1) read never reaches row two), and the picker states
    // the same rule for any caller holding rows already.
    expect(pickLatestVideoRun([
      { run_id: null, scraped_at: '2026-09-10T00:00:00Z' },
      { run_id: 'real', scraped_at: '2026-09-06T00:00:00Z' },
    ])?.runId).toBe('real')
    expect(pickLatestVideoRun([{ run_id: null, scraped_at: '2026-09-10T00:00:00Z' }])).toBeNull()
  })

  it('breaks a tie on the caller’s own order', () => {
    expect(pickLatestVideoRun([
      { run_id: 'first', scraped_at: '2026-08-23' },
      { run_id: 'last', scraped_at: '2026-08-23' },
    ])?.runId).toBe('last')
  })

  it('carries the scrape time out, which Content shows as the update’s date', () => {
    expect(pickLatestVideoRun([
      { run_id: 'r1', scraped_at: '2026-09-06T11:04:00Z' },
    ])?.scrapedAt).toBe('2026-09-06T11:04:00Z')
  })

  it('is null when no update has ever gathered videos', () => {
    expect(pickLatestVideoRun([])).toBeNull()
    expect(pickLatestVideoRun([{ run_id: 'running', scraped_at: '2026-08-30' }], ['running'])).toBeNull()
  })
})
