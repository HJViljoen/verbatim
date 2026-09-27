import { describe, expect, it } from 'vitest'
import {
  WEEKLY_BLOCK_KEYS,
  WEEKLY_RETIRED_KEYS,
  WEEKLY_TITLE,
  isMonthScopedFigure,
  monthScopedFigures,
  weeklyPeriod,
  weeklyStamp,
  weeklySubject,
} from './weekly'
import { WEEKLY_SNAPSHOT_VERSION } from './weekly-build'

describe('the weekly report’s arrangement (market-first WP3.7)', () => {
  it('holds the preview’s seven sections, and never reuses a retired key', () => {
    expect(WEEKLY_BLOCK_KEYS).toHaveLength(7)
    for (const key of WEEKLY_RETIRED_KEYS) expect(WEEKLY_BLOCK_KEYS as readonly string[]).not.toContain(key)
    expect(WEEKLY_RETIRED_KEYS).toEqual(['weekly.incoming', 'weekly.coverage'])
  })

  it('is version 3, so a Phase 1 row prints the stale line', () => {
    expect(WEEKLY_SNAPSHOT_VERSION).toBe(3)
  })

  it('is called what the preview calls it', () => {
    expect(WEEKLY_TITLE).toBe('Your market this week')
  })
})

describe('the subject line leads with the market', () => {
  it('names what the update brought into the market (Sealand, 20 Sep on staging)', () => {
    expect(weeklySubject('Sealand', { market: { videos: 436, comments: 9471 } })).toBe('Sealand · your market this week: 436 videos and 9,471 comments came in')
  })

  it('names the artefact alone where nothing was counted, never a gate', () => {
    expect(weeklySubject('Össur', null)).toBe('Össur · your market this week')
  })
})

describe('the masthead’s stamp', () => {
  it('is the month and the one line (25 Sep rulings)', () => {
    expect(weeklyStamp('2026-09-01', 'as at the 20 Sep update · next update Sun 27 Sep')).toBe('September 2026 · as at the 20 Sep update · next update Sun 27 Sep')
    expect(weeklyStamp('2026-09-01', null)).toBe('September 2026')
  })

  it('dates the snapshot by the update’s window, or the month where none is recorded', () => {
    expect(weeklyPeriod({ from: '2026-09-10', to: '2026-09-20' }, '2026-09-01')).toBe('10 Sep – 20 Sep')
    expect(weeklyPeriod(null, '2026-09-01')).toBe('September 2026')
  })
})

describe('which figures are a reading of the month', () => {
  it('files the front page’s under the month and the update’s own counts under none', () => {
    expect(isMonthScopedFigure('market_subject_s_looks_k')).toBe(true)
    expect(isMonthScopedFigure('weekly_market_videos')).toBe(true)
    for (const t of ['came_in_market_videos', 'heard_t_x_videos', 'objection_1_videos', 'rival_complaint_1_videos', 'reply_picked', 'weekly_subject_s_looks_added']) {
      expect(isMonthScopedFigure(t), t).toBe(false)
    }
    expect(Object.keys(monthScopedFigures({
      weekly_market_videos: { value: 654, unit: 'videos', label: 'videos in your market in September' },
      came_in_market_videos: { value: 436, unit: 'videos', label: 'videos this update brought into your market’s September' },
    }))).toEqual(['weekly_market_videos'])
  })
})
