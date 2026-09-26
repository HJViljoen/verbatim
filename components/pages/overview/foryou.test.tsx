import { describe, expect, it } from 'vitest'

import { blockAnswers, blockContext, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { surface } from '@/lib/nav'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { buildForYou } from '@/lib/pages/overview-market/foryou'
import { postsSharing } from '@/lib/pages/subjects'
import { monthlySlotsFrom } from '@/lib/reports/monthly-slots'
import type { OverviewData } from '@/lib/pages/overview'
import { FOR_YOU_NONE, FOR_YOU_TITLE, overviewForYou } from './foryou'
import { overviewMoves, PUBLISHED_TITLE } from './moves'
import { marketFrontFixture, ossurFrontFixture, overviewFixture } from './fixture'
import { monthlyYou } from '@/components/blocks/monthly/you'
import { monthlyFixture } from '@/components/blocks/monthly/fixture'

// What it means for you, and what you published (market-first WP2.5; plan
// §2.2 blocks 7 and 8), on the front page and in the monthly.

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('https://app.verbatimintel.com', EMAIL)
const text = (node: React.ReactNode) => renderText(node).replace(/\s+/g, ' ')

/** Staging's page on 11 Oct (read with the 20 Sep update): Waterproofing's
 *  16 question videos against Sealand's 56 posts from July to September, and
 *  the lead "Price and sale questions" against its 20 September posts; none
 *  matched either. */
function stagingFixture(): OverviewData {
  const base = marketFrontFixture({ subjectsCalibration: 'staging' })
  return {
    ...base,
    foryou: buildForYou({
      month: '2026-09-01',
      questions: base.foryou!.lines[0] ? {
        subject: { id: 's-waterproofing', name: 'Waterproofing', calibration: 'ready' },
        asked: 16,
        posts: 56,
        sharing: { checked: ['waterproofing', 'zippers', 'rain', 'coated', 'canvas', 'cracking'], matched: [] },
      } : null,
      lead: { label: 'Price and sale questions', posts: 20, sharing: postsSharing('Price and sale questions', []) },
      followers: null,
    }),
  }
}

describe('What it means for you (overview.foryou)', () => {
  it('renders in all three modes on production\'s, staging\'s and Össur\'s pages, and keeps the copy contract', () => {
    for (const data of [marketFrontFixture(), stagingFixture(), ossurFrontFixture()]) {
      for (const mode of MODES) assertCopyContract(render(overviewForYou.render(data, mode, ctx)))
    }
  })

  it('prints Waterproofing, provisional, 16 videos over the last 3 months, and 0 of your 56 posts (GR F24)', () => {
    const t = text(overviewForYou.render(marketFrontFixture(), 'app', ctx))
    expect(t).toContain(FOR_YOU_TITLE)
    expect(t).toContain('Waterproofing provisional')
    expect(t).toContain('16 videos your market asked about it, over the last 3 months')
    expect(t).toContain('0 of your 56 posts shared two or more of its words, in that time')
    expect(t).toContain('checked: waterproofing · zippers · rain · coated · …')
  })

  it('writes the same line as a sentence on paper and in an email', () => {
    const t = text(overviewForYou.render(marketFrontFixture(), 'email', ctx))
    expect(t).toContain('Your market asked about it on 16 videos over the last 3 months. None of your 56 posts in that time shared two or more of its words.')
  })

  it('puts the lead conversation against the month\'s posts, and says what it checked', () => {
    const t = text(overviewForYou.render(stagingFixture(), 'app', ctx))
    expect(t).toMatch(/“ ?Price and sale questions ?”/)
    expect(t).toContain('The market’s biggest conversation with few makers. None of your 20 posts from the month shared two or more of its words.')
    expect(t).toContain('checked: price · sale')
  })

  it('names the posts a line matched on, where one did', () => {
    const data = marketFrontFixture()
    const line = { ...data.foryou!.lines[0], sentenceKey: 'foryou.unanswered.some', matchedPosts: [{ id: 'p1', words: ['zippers', 'rain'] }], figures: { ...data.foryou!.lines[0].figures, foryou_touched: { value: 1, unit: 'videos' as const, label: 'x' } } }
    const t = text(overviewForYou.render({ ...data, foryou: { ...data.foryou!, lines: [line] } }, 'app', ctx))
    expect(t).toContain('1 of your 56 posts')
    expect(t).toContain('1 post on zippers · rain')
  })

  it('Össur (no maker rule): the biggest conversation, with nothing claimed about makers', () => {
    const t = text(overviewForYou.render(ossurFrontFixture(), 'app', ctx))
    expect(t).toContain('The market’s biggest conversation. None of your 109 posts from the month shared two or more of its words.')
    expect(t).not.toContain('makers')
  })

  it('says one line where nothing lines up (no subject asked about, no lead)', () => {
    const data = ossurFrontFixture()
    expect(text(overviewForYou.render({ ...data, foryou: { month: '2026-09-01', lines: [] } }, 'app', ctx))).toContain(FOR_YOU_NONE)
  })

  it('prints no "you" column, no direction word and no advice; its footer names Your moves by its label', () => {
    const t = text(overviewForYou.render(marketFrontFixture(), 'app', ctx))
    expect(t).toContain(`Open ${surface('market').label} →`)
    for (const w of ['growing', 'fading', 'rising', 'you should', 'Add a']) expect(t.toLowerCase()).not.toContain(w.toLowerCase())
  })

  it('declares each line\'s figures under its own keys', () => {
    const f = blockAnswers(overviewForYou, stagingFixture()).figures
    expect(f['unanswered_0_foryou_posts'].value).toBe(56)
    expect(f['lead_touch_1_foryou_posts'].value).toBe(20)
  })
})

describe('What you published (overview.moves on the market page)', () => {
  it('prints production\'s census (§2.2): 20 posts, 30 the month before, 10 drew 5+, 9 carry a reading, 234 comments', () => {
    const t = text(overviewMoves.render(marketFrontFixture(), 'app', ctx))
    expect(t).toContain(PUBLISHED_TITLE)
    expect(t).toContain('20 posts in September · 30 the month before')
    expect(t).toContain('10 drew 5+ comments each')
    expect(t).toContain('9 carry a reading 234 comments')
    expect(t).toContain('Your followers talked most about')
    expect(t).toMatch(/Respect for Sealand’s mission 4 .*Support for clean-up initiatives 3 .*Keen to join events 2/)
    expect(t).toContain('Moves: none dated yet')
    expect(blockAnswers(overviewMoves, marketFrontFixture()).verdicts).toEqual([])
  })

  it('renders in all three modes and keeps the copy contract', () => {
    for (const data of [marketFrontFixture(), ossurFrontFixture()]) {
      for (const mode of MODES) assertCopyContract(render(overviewMoves.render(data, mode, ctx)))
    }
  })

  it('says "no reading yet" where the month holds no row for your audience, never "0 carry a reading"', () => {
    const data = marketFrontFixture()
    const t = text(overviewMoves.render({ ...data, published: { ...data.published!, withReading: null, readingComments: null } }, 'app', ctx))
    expect(t).toContain('no reading yet')
    expect(t).not.toContain('carry a reading')
  })

  it('lists no follower theme heard on one video (Össur: four themes, one video each)', () => {
    expect(text(overviewMoves.render(ossurFrontFixture(), 'app', ctx))).not.toContain('Your followers talked most about')
  })

  it('a page stored before WP2.5 prints OV5, as sent', () => {
    expect(text(overviewMoves.render(overviewFixture(), 'app', ctx))).not.toContain(PUBLISHED_TITLE)
  })
})

describe('the monthly\'s "What it means for you" section (monthly.you, WP2.5 fills the slot)', () => {
  it('is filled from the front page\'s two blocks, and stays a stub on a page built without them', () => {
    const slots = monthlySlotsFrom(marketFrontFixture())
    expect(slots.you.state).toBe('filled')
    expect(monthlySlotsFrom(overviewFixture()).you.state).toBe('stub')
  })

  it('prints the line\'s head, its sentence and the words checked, and the census', () => {
    const data = monthlyFixture()
    const filled = { ...data, slots: { ...data.slots, you: monthlySlotsFrom(marketFrontFixture()).you } }
    for (const mode of MODES) {
      const t = text(monthlyYou.render(filled, mode, ctx))
      expect(t, mode).toContain('Waterproofing · provisional')
      expect(t, mode).toContain('None of your 56 posts in that time shared two or more of its words.')
      expect(t, mode).toContain('waterproofing · zippers · rain · coated · …')
      expect(t, mode).toContain('234 comments')
      assertCopyContract(render(monthlyYou.render(filled, mode, ctx)))
    }
  })
})
