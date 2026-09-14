import { describe, it, expect } from 'vitest'
import {
  resolveRunWindow,
  windowSpanDays,
  tiktokRangeFor,
  redditTimeFor,
  isStalled,
  ENUM_WEEK_MAX_DAYS,
  type RunWindow,
} from './window'
import { periodWindowDays, MAX_ANCHOR_DAYS } from '../config'

// The window rule, locked against the production history it was written for.
// Dates below are the real Össur/Sealand runs from 2026-08/09 (research
// anchored-window.md §2), so a change in the rule shows up as a change in a
// window somebody can check against a run that actually happened.

const OPEN = '2026-09-20T04:00:00.000Z' // the Sunday 06:00 SAST slot

describe('resolveRunWindow — anchored', () => {
  it('anchors on the previous run window_end, healthy weekly cadence', () => {
    // d346b0f7 closed its window at 2026-09-13 04:06; the Sunday run picks up
    // exactly there rather than at "now minus seven days".
    const w = resolveRunWindow({
      now: OPEN,
      period: 'weekly',
      prevEnd: '2026-09-13T04:06:38.483Z',
      hasSummary: true,
    })
    expect(w).toEqual({
      start: '2026-09-13T04:06:38.483Z',
      end: OPEN,
      basis: 'anchored',
    })
  })

  it('caps the anchor at MAX_ANCHOR_DAYS after a long silence', () => {
    // Össur's real 37-day gap (f9548a97 03 Jul → ef1e28a3 09 Aug). Anchoring
    // unbounded would buy 37 days of comment scrapes.
    const w = resolveRunWindow({
      now: '2026-08-09T10:38:00.000Z',
      period: 'weekly',
      prevEnd: '2026-07-03T10:31:00.000Z',
      hasSummary: true,
    })
    expect(w.basis).toBe('anchored_capped')
    expect(windowSpanDays(w)).toBe(MAX_ANCHOR_DAYS)
  })

  it('anchors NARROWER than the rolling rule after a same-day rerun', () => {
    // The 2026-08-17 Sealand cluster: four runs in eight hours. The previous
    // run already covered everything before it, so the window is hours, not a
    // week — and the anchored answer is the honest one.
    const w = resolveRunWindow({
      now: '2026-08-17T15:05:59.583Z',
      period: 'paused',
      prevEnd: '2026-08-17T14:53:54.496Z',
      hasSummary: true,
    })
    expect(w.basis).toBe('anchored')
    expect(windowSpanDays(w)).toBeCloseTo(0.0084, 3)
  })

  it('never produces a window that runs backwards', () => {
    const w = resolveRunWindow({
      now: OPEN,
      period: 'weekly',
      prevEnd: '2026-09-21T00:00:00.000Z', // later than `now` (clock skew)
      hasSummary: true,
    })
    expect(w.start).toBe(OPEN)
    expect(windowSpanDays(w)).toBe(0)
  })
})

describe('resolveRunWindow — rolling, baseline, resume', () => {
  it('falls back to the rolling period window with nothing to anchor on', () => {
    const w = resolveRunWindow({ now: OPEN, period: 'weekly', prevEnd: null, hasSummary: true })
    expect(w.basis).toBe('rolling')
    expect(windowSpanDays(w)).toBe(periodWindowDays('weekly'))
  })

  it('rolls monthly at 30 days and paused at 7', () => {
    const monthly = resolveRunWindow({ now: OPEN, period: 'monthly', prevEnd: null, hasSummary: true })
    expect(windowSpanDays(monthly)).toBe(30)
    // 'paused' is a live report_period (Sealand); a manual run on it covers a
    // week, explicitly rather than by falling through a ternary.
    const paused = resolveRunWindow({ now: OPEN, period: 'paused', prevEnd: null, hasSummary: true })
    expect(windowSpanDays(paused)).toBe(7)
  })

  it('leaves a baseline run unwindowed', () => {
    // "The map exists" = an earlier run_summary. Without one the first run is
    // the map, not a period — and no start bound is written, because none was
    // applied.
    const w = resolveRunWindow({
      now: OPEN,
      period: 'weekly',
      prevEnd: '2026-09-13T04:06:38.483Z', // a run row exists, but no summary
      hasSummary: false,
    })
    expect(w).toEqual({ start: null, end: OPEN, basis: 'baseline' })
    expect(windowSpanDays(w)).toBeNull()
  })

  it('keeps the stored window on a resume, whatever today says', () => {
    const stored: RunWindow = {
      start: '2026-09-06T04:00:00.000Z',
      end: '2026-09-13T04:06:38.483Z',
      basis: 'anchored',
    }
    const w = resolveRunWindow({ now: OPEN, period: 'weekly', prevEnd: null, hasSummary: true, stored })
    expect(w).toEqual({ ...stored, basis: 'resume' })
  })

  it('keeps "reconstructed" visible when a resume inherits a backfilled window', () => {
    // WP12 runs the backfill before the D8 rehearsal, so the row the rehearsal
    // resumes carries a window the backfill LABELLED — "what the code of the
    // day would have used" — not one any run gathered under. Stamping plain
    // 'resume' over it would erase that from the only place it is recorded.
    const stored: RunWindow = {
      start: '2026-08-10T13:07:52.340Z',
      end: '2026-08-17T13:07:52.340Z',
      basis: 'reconstructed',
    }
    const w = resolveRunWindow({ now: OPEN, period: 'weekly', prevEnd: null, hasSummary: true, stored })
    expect(w).toEqual({ ...stored, basis: 'resume_reconstructed' })
    // And a second resume must not launder it back into a plain one.
    expect(
      resolveRunWindow({ now: OPEN, period: 'weekly', prevEnd: null, hasSummary: true, stored: w }).basis,
    ).toBe('resume_reconstructed')
  })

  it('computes a fresh window when the resumed row carries none', () => {
    // Every run row written before this shipped has no window; resuming one
    // must not strand it without a window at all.
    const w = resolveRunWindow({
      now: OPEN,
      period: 'weekly',
      prevEnd: '2026-09-13T04:06:38.483Z',
      hasSummary: true,
      stored: null,
    })
    expect(w.basis).toBe('anchored')
  })
})

describe('platform enum bounds', () => {
  const windowOf = (days: number): RunWindow => ({
    start: new Date(Date.parse(OPEN) - days * 86_400_000).toISOString(),
    end: OPEN,
    basis: 'anchored',
  })

  it('takes the week bucket up to and including the boundary', () => {
    expect(tiktokRangeFor(windowOf(7))).toBe('THIS_WEEK')
    expect(tiktokRangeFor(windowOf(ENUM_WEEK_MAX_DAYS))).toBe('THIS_WEEK')
    expect(redditTimeFor(windowOf(ENUM_WEEK_MAX_DAYS))).toBe('week')
  })

  it('takes the month bucket past it — a caught-up miss needs the wider one', () => {
    expect(tiktokRangeFor(windowOf(ENUM_WEEK_MAX_DAYS + 0.01))).toBe('THIS_MONTH')
    expect(tiktokRangeFor(windowOf(14))).toBe('THIS_MONTH')
    expect(redditTimeFor(windowOf(14))).toBe('month')
  })

  it('returns null with no frozen bound, so the caller keeps its own', () => {
    expect(tiktokRangeFor(undefined)).toBeNull()
    expect(tiktokRangeFor(null)).toBeNull()
    expect(redditTimeFor({ start: null, end: OPEN, basis: 'baseline' })).toBeNull()
  })
})

describe('isStalled', () => {
  it('is false for a run shorter than the window it covered', () => {
    // d346b0f7: 2.3 hours of run against a 7-day window.
    expect(
      isStalled({
        startedAt: '2026-09-13T04:06:38.483Z',
        completedAt: '2026-09-13T06:26:49.308Z',
        window: { start: '2026-09-06T04:00:00.000Z', end: '2026-09-13T04:06:38.483Z', basis: 'anchored' },
      }),
    ).toBe(false)
  })

  it('is true for a run that outlived its own window', () => {
    // f9548a97 took 18.06 days to close a 7-day window.
    expect(
      isStalled({
        startedAt: '2026-07-03T10:31:23.000Z',
        completedAt: '2026-07-21T12:03:22.000Z',
        window: { start: '2026-06-26T10:31:23.000Z', end: '2026-07-03T10:31:23.000Z', basis: 'rolling' },
      }),
    ).toBe(true)
  })

  it('is false when there is no window to measure against', () => {
    expect(
      isStalled({
        startedAt: '2026-07-03T10:31:23.000Z',
        completedAt: '2026-07-21T12:03:22.000Z',
        window: { start: null, end: '2026-07-03T10:31:23.000Z', basis: 'baseline' },
      }),
    ).toBe(false)
    expect(
      isStalled({ startedAt: '2026-07-03T10:31:23.000Z', completedAt: '2026-07-21T12:03:22.000Z' }),
    ).toBe(false)
  })
})
