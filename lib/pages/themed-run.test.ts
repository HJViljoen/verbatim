import { describe, expect, it } from 'vitest'
import { pickThemedRunId } from './themed-run'

// The selection rule only (the fetch around it is I/O — AGENTS.md: pure logic).

describe('pickThemedRunId', () => {
  it('takes the newest update that has themes', () => {
    expect(pickThemedRunId([
      { run_id: 'older', created_at: '2026-08-16T00:00:00Z' },
      { run_id: 'newest', created_at: '2026-08-30T00:00:00Z' },
      { run_id: 'middle', created_at: '2026-08-23T00:00:00Z' },
    ])).toBe('newest')
  })

  it('falls back past an update whose theme pass produced nothing', () => {
    // The Sealand case: the latest update closed with zero theme rows, so it
    // is simply absent from the rows and the previous update still answers.
    expect(pickThemedRunId([
      { run_id: 'themed', created_at: '2026-08-23T00:00:00Z' },
    ])).toBe('themed')
  })

  it('never picks an in-flight update, even once it has written theme rows', () => {
    expect(pickThemedRunId([
      { run_id: 'closed', created_at: '2026-08-23T00:00:00Z' },
      { run_id: 'running', created_at: '2026-08-30T00:00:00Z' },
    ], ['running'])).toBe('closed')
  })

  it('ranks an undated update oldest and ignores rows with no run', () => {
    expect(pickThemedRunId([
      { run_id: 'dated', created_at: '2026-08-23T00:00:00Z' },
      { run_id: 'undated' },
      { run_id: null, created_at: '2026-09-01T00:00:00Z' },
    ])).toBe('dated')
    expect(pickThemedRunId([{ run_id: 'undated' }])).toBe('undated')
  })

  it('skips a theme row orphaned by a deleted update', () => {
    // themes.run_id is nullable with an ON DELETE SET NULL FK; the same one-row
    // read that makes this matter for videos makes it matter here.
    expect(pickThemedRunId([
      { run_id: null, created_at: '2026-09-10T00:00:00Z' },
      { run_id: 'real', created_at: '2026-09-06T00:00:00Z' },
    ])).toBe('real')
    expect(pickThemedRunId([{ run_id: null, created_at: '2026-09-10T00:00:00Z' }])).toBeNull()
  })

  it('breaks a tie on the caller’s own order', () => {
    expect(pickThemedRunId([
      { run_id: 'first', created_at: '2026-08-23' },
      { run_id: 'last', created_at: '2026-08-23' },
    ])).toBe('last')
  })

  it('is null when no update has ever produced themes', () => {
    expect(pickThemedRunId([])).toBeNull()
    expect(pickThemedRunId([{ run_id: 'running', created_at: '2026-08-30' }], ['running'])).toBeNull()
  })
})
