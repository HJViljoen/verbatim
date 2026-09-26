import { describe, expect, it } from 'vitest'

import { blockContext, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { overviewArrivals } from './arrivals'
import { marketArrivalsFixture, marketFrontFixture, ossurArrivalsFixture, overviewFixture, SEALAND_20_SEP_ARRIVALS } from './fixture'

// "With this update" (market-first WP2.7, plan §2.2 block 3), on staging's own
// updates (the fixture's header says which).

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('https://app.verbatimintel.com', EMAIL)
const text = (data: ReturnType<typeof marketArrivalsFixture>, mode: RenderMode = 'app') => renderText(overviewArrivals.render(data, mode, ctx))

describe('With this update (WP2.7)', () => {
  it('renders in every mode and state and keeps the copy contract', () => {
    for (const data of [marketArrivalsFixture(), ossurArrivalsFixture(), marketFrontFixture(), overviewFixture()]) {
      for (const mode of MODES) assertCopyContract(render(overviewArrivals.render(data, mode, ctx)))
    }
  })

  it('says what came in as counts that add to the month', () => {
    for (const mode of MODES) {
      const t = text(marketArrivalsFixture(), mode)
      expect(t).toContain('Came in')
      expect(t).toContain('With the 20 Sep update: 395 videos read in your market for the first time, and 11,999 more September comments came in.')
      // The month in progress is the month read: no "so far" clause.
      expect(t).not.toContain('so far:')
    }
  })

  it('names the month in progress where it is another, and not for a paused tenant with no update in it', () => {
    const withOctober = { ...marketArrivalsFixture(), arrivals: { ...SEALAND_20_SEP_ARRIVALS, current: { month: '2026-10-01', videos: 118, updates: 2 } } }
    expect(text(withOctober)).toContain('October so far: 118 videos after 2 updates.')
    const t = text(ossurArrivalsFixture())
    expect(t).toContain('With the 13 Sep update: 139 videos read in your market for the first time, and 4,722 more September comments came in.')
    expect(t).not.toContain('October so far')
  })

  it('names the themes heard first at 10+ in the month, five at most, and counts the rest', () => {
    for (const mode of MODES) {
      const t = text(marketArrivalsFixture(), mode)
      expect(t).toContain('Heard for the first time')
      expect(t).toContain('With 10+ videos in September:')
      expect(t).toMatch(/“\s*Admiration for handmade craftsmanship\s*”: 65 videos/)
      expect(t).toMatch(/“\s*Confusion about airline size rules\s*”: 12 videos/)
      expect(t).not.toContain('Laundry planning for travel')
      expect(t).toContain('And 4 more.')
    }
  })

  it('says how many of a theme’s videos came from searches added in the month, one denominator a line', () => {
    const a = { ...SEALAND_20_SEP_ARRIVALS, newThemes: [
      { ...SEALAND_20_SEP_ARRIVALS.newThemes[3], fromNewSearches: 4 },
      { ...SEALAND_20_SEP_ARRIVALS.newThemes[4], fromNewSearches: 0 },
    ] }
    const t = text({ ...marketArrivalsFixture(), arrivals: a })
    expect(t).toMatch(/“\s*Interest in shipping and locations\s*”: 4 of its 13 videos came from searches we added in September/)
    expect(t).toMatch(/“\s*Confusion about airline size rules\s*”: none of its 12 videos came from searches we added in September/)
  })

  it('counts the themes led by makers or set aside, never names them (decision F)', () => {
    const a = { ...SEALAND_20_SEP_ARRIVALS, newThemes: SEALAND_20_SEP_ARRIVALS.newThemes.slice(3, 5), grouped: { makers: 2, setAside: 1 } }
    const t = text({ ...marketArrivalsFixture(), arrivals: a })
    expect(t).toContain('2 more are led by makers.')
    expect(t).toContain('1 more is set aside as off-topic.')
    const none = text({ ...marketArrivalsFixture(), arrivals: { ...a, newThemes: [] } })
    expect(none).toContain('With 10+ videos in September: 2 led by makers, 1 set aside as off-topic.')
  })

  it('counts a re-grouping, and names nothing heard first, when the update opened a new clustering regime (WP1.9)', () => {
    const t = text({ ...marketArrivalsFixture(), arrivals: { ...SEALAND_20_SEP_ARRIVALS, newThemes: [], regrouped: 468 } })
    expect(t).toContain('Re-grouped with the 20 Sep update: 468 themes.')
    expect(t).not.toContain('Admiration')
  })

  it('says nothing was heard first at the floor, rather than drawing an empty list', () => {
    expect(text(ossurArrivalsFixture())).toContain('No theme heard for the first time reached 10 videos in September.')
  })

  it('is headed by its title alone and footed by a link alone (25 Sep rulings)', () => {
    for (const mode of MODES) {
      const el = overviewArrivals.render(marketArrivalsFixture(), mode, ctx) as { props: { title: string; meta?: unknown; footerNote?: unknown } }
      expect(el.props.title).toBe('With this update')
      expect(el.props.meta).toBeUndefined()
      expect(el.props.footerNote).toBeUndefined()
    }
    expect(text(marketArrivalsFixture())).toContain('Open This week →')
  })

  it('computes nothing over a week alone: no share, no arrow, no verdict word', () => {
    for (const mode of MODES) {
      const t = text(marketArrivalsFixture(), mode)
      expect(t).not.toMatch(/%|▲|▼/)
    }
  })

  it('says it is not counted, rather than printing a zero, where the arrivals could not be read', () => {
    expect(overviewArrivals.emptyState(marketFrontFixture())).toBe('What came in with the latest update is not counted here yet.')
    expect(overviewArrivals.emptyState(overviewFixture())).toContain('not on this copy')
    expect(overviewArrivals.emptyState(marketArrivalsFixture())).toBeNull()
  })

  it('declares the counts it prints as its figures', () => {
    const f = overviewArrivals.figures!(marketArrivalsFixture())
    expect(f.arrivals_videos_first_read.value).toBe(395)
    expect(f.arrivals_comments_captured.value).toBe(11999)
    expect(Object.keys(f).filter((k) => k.startsWith('arrival_theme_'))).toHaveLength(5)
  })
})
