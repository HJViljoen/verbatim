import { describe, expect, it } from 'vitest'

import { blockContext, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { overviewArrivals } from './arrivals'
import { marketArrivalsFixture, marketFrontFixture, ossurArrivalsFixture, overviewFixture, SEALAND_20_SEP_ARRIVALS, sealandWeeks } from './fixture'
import { OVERVIEW_BLOCKS } from '.'
import { WEEK_BY_WEEK_HREF } from './weeks'
import { DEFINITIONS } from '@/lib/settings/how-to-read'

// "With this update" (market-first WP2.7, plan §2.2 block 3), on staging's own
// updates (the fixture's header says which).

const MODES: RenderMode[] = ['app', 'print', 'email']
/** The list the loader read on staging before the deploy-3 review's
 *  heard-before rule (26 Sep): six named and three led by makers. Four of the
 *  six hold August rows, so the page no longer names them; the list stays
 *  here, real figures, only to exercise the five at most and the counted rest. */
const BEFORE_THE_RULE: typeof SEALAND_20_SEP_ARRIVALS = {
  ...SEALAND_20_SEP_ARRIVALS,
  newThemes: [
    { registryId: '2c7238b7-8152-4c33-9d44-e366eb0efdba', label: 'Interest in shipping and locations', k: 13, fromNewSearches: 8 },
    { registryId: '056a478a-ea54-4ab7-97d4-82681d263c82', label: 'Appreciation for smart packing tips', k: 12, fromNewSearches: 9 },
    { registryId: 'f329a7dd-7afe-4710-80e3-f4ba6e63b708', label: 'Confusion about airline size rules', k: 12, fromNewSearches: 11 },
    { registryId: '8285e151-7e5a-41b1-b0db-5941e027a20a', label: 'Praise for laptop carry features', k: 11, fromNewSearches: 6 },
    { registryId: '4f4bc420-8906-44ac-878d-2855c1011485', label: 'Laundry planning for travel', k: 10, fromNewSearches: 8 },
    { registryId: 'aed3a6d0-5fe9-456f-b8a9-f1cd096f062c', label: 'Preference for secondhand fashion', k: 10, fromNewSearches: null },
  ],
  grouped: { makers: 3, setAside: 0 },
}
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
      expect(t).toContain('With the 20 Sep update: 395 videos read in your market for the first time, and 11,999 more comments written in September came in.')
      // Your market says how This week counts the same update (the monthly,
      // which borrows the line, does not: slots-parity.test.tsx).
      expect(t).toContain('With the 20 Sep update: 395 videos read in your market for the first time, and 11,999 more comments written in September came in. This week counts only those written in the update’s days.')
      // The month in progress is the month read: no "so far" clause.
      expect(t).not.toContain('so far:')
    }
  })

  it('names the month in progress where it is another, and not for a paused tenant with no update in it', () => {
    const withOctober = { ...marketArrivalsFixture(), arrivals: { ...SEALAND_20_SEP_ARRIVALS, current: { month: '2026-10-01', videos: 118, updates: 2 } } }
    expect(text(withOctober)).toContain('October so far: 118 videos after 2 updates.')
    const t = text(ossurArrivalsFixture())
    expect(t).toContain('With the 13 Sep update: 139 videos read in your market for the first time, and 4,722 more comments written in September came in.')
    expect(t).not.toContain('October so far')
  })

  it('names the themes heard first at 10+ in the month (staging: the two Conversation flags New)', () => {
    for (const mode of MODES) {
      const t = text(marketArrivalsFixture(), mode)
      expect(t).toContain('Heard for the first time')
      expect(t).toContain('With 10+ videos in September:')
      expect(t).toMatch(/“\s*Laundry planning for travel\s*”: 8 of its 10 videos came from searches we added in September/)
      expect(t).toMatch(/“\s*Preference for secondhand fashion\s*”: 8 of its 10 videos/)
      // Minted by the update but held by August: not heard for the first time.
      expect(t).not.toContain('Interest in shipping and locations')
      expect(t).not.toContain('more.')
    }
  })

  it('names five at most, and counts the rest', () => {
    for (const mode of MODES) {
      const t = text({ ...marketArrivalsFixture(), arrivals: BEFORE_THE_RULE }, mode)
      expect(t).toMatch(/“\s*Interest in shipping and locations\s*”: 8 of its 13 videos came from searches we added in September/)
      expect(t).toMatch(/“\s*Laundry planning for travel\s*”: 8 of its 10 videos/)
      expect(t).not.toContain('Preference for secondhand fashion')
      expect(t).toContain('And 1 more.')
      // Led by makers: counted, never named (decision F).
      expect(t).toContain('3 more are led by makers.')
      expect(t).not.toContain('Admiration for handmade craftsmanship')
    }
  })

  it('says how many of a theme’s videos came from searches added in the month, one denominator a line', () => {
    const a = { ...SEALAND_20_SEP_ARRIVALS, newThemes: [
      BEFORE_THE_RULE.newThemes[0],
      { ...BEFORE_THE_RULE.newThemes[2], fromNewSearches: 0 },
      BEFORE_THE_RULE.newThemes[5],
    ] }
    const t = text({ ...marketArrivalsFixture(), arrivals: a })
    expect(t).toMatch(/“\s*Interest in shipping and locations\s*”: 8 of its 13 videos came from searches we added in September/)
    expect(t).toMatch(/“\s*Confusion about airline size rules\s*”: none of its 12 videos came from searches we added in September/)
    // Not measured: the count alone, never a zero.
    expect(t).toMatch(/“\s*Preference for secondhand fashion\s*”: 10 videos/)
  })

  it('counts the themes led by makers or set aside, never names them (decision F)', () => {
    const a = { ...SEALAND_20_SEP_ARRIVALS, newThemes: BEFORE_THE_RULE.newThemes.slice(0, 2), grouped: { makers: 2, setAside: 1 } }
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
    // The named themes: their videos, and those from searches added in the month.
    expect(Object.keys(f).filter((k) => k.startsWith('arrival_theme_') && k.endsWith('_videos'))).toHaveLength(2)
    expect(Object.keys(f).filter((k) => k.endsWith('_new_searches'))).toHaveLength(2)
    // Five at most.
    const five = overviewArrivals.figures!({ ...marketArrivalsFixture(), arrivals: BEFORE_THE_RULE })
    expect(Object.keys(five).filter((k) => k.startsWith('arrival_theme_') && k.endsWith('_videos'))).toHaveLength(5)
    expect(Object.keys(five).filter((k) => k.endsWith('_new_searches'))).toHaveLength(5)
  })
})

describe('week by week, inside With this update (WP2.9)', () => {
  const oct11 = () => ({ ...marketArrivalsFixture(), weeks: sealandWeeks('2026-10-11T06:00:00.000Z') })

  it('renders the bars inside the block, in all three modes, and the front page has no block of its own for them', () => {
    for (const mode of MODES) {
      const t = text(oct11(), mode)
      expect(t).toContain('Week by week')
      for (const n of ['244', '404', '318', '7,851']) expect(t).toContain(n)
      assertCopyContract(render(overviewArrivals.render(oct11(), mode, ctx)))
    }
    expect(OVERVIEW_BLOCKS.map((b) => b.key)).not.toContain('overview.weeks')
  })

  it('draws our changes on the weeks of 7 and 14 Sep, and the pending row due 18 Oct and 25 Oct', () => {
    const t = text(oct11())
    expect(t).toContain('Each week, as counts')
    for (const d of ['9 Sep', '13 Sep', '17 Sep']) expect(t).toContain(d)
    expect(t).toContain('We changed our searches on 9, 13 and 17 Sep')
    expect(t).toContain('Read at the same age')
    expect(t).toContain('due 18 Oct')
    expect(t).toContain('due 25 Oct')
  })

  it('draws no pending row for Össur, which keeps no same-age line', () => {
    const t = text(ossurArrivalsFixture())
    expect(t).toContain('Week by week')
    expect(t).not.toContain('Read at the same age')
    expect(t).not.toContain('due ')
  })

  it('puts no figure line or method note under the chart: the method is a link to How to read', () => {
    const t = text(oct11())
    expect(t).toContain('How to read: Week by week →')
    expect(t).not.toMatch(/follow our searches|counts in both|not counted|two updates old/i)
    expect(render(overviewArrivals.render(oct11(), 'app', ctx))).toContain('/dashboard/settings/how-to-read#week-by-week')
    // The link lands on a card that exists.
    expect(DEFINITIONS.map((d) => d.id)).toContain(WEEK_BY_WEEK_HREF.split('#')[1])
  })

  it('says no week has comments yet, rather than an empty chart', () => {
    const empty = { ...oct11(), weeks: { ...sealandWeeks('2026-10-11T06:00:00.000Z'), weeks: sealandWeeks('2026-10-11T06:00:00.000Z').weeks.map((w) => ({ ...w, state: 'none_gathered' as const, videos: 0, comments: 0 })) } }
    expect(text(empty)).toContain('No week has comments yet.')
  })
})
