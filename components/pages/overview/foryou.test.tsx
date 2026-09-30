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
    // Walkthrough B8: what a post did, not the test it passed; the words
    // looked for ride as a tooltip in the app.
    expect(t).toContain('0 of your 56 posts touched on it, in that time')
    expect(t).not.toContain('shared two or more of its words')
    expect(t).not.toContain('checked:')
    expect(render(overviewForYou.render(marketFrontFixture(), 'app', ctx))).toContain('We looked in your posts for: waterproofing, zippers, rain, coated, …')
  })

  it('writes the same line as a sentence on paper and in an email', () => {
    const t = text(overviewForYou.render(marketFrontFixture(), 'email', ctx))
    expect(t).toContain('Your market asked about it on 16 videos over the last 3 months. None of your 56 posts in that time shared two or more of its words.')
  })

  it('puts the lead conversation against the month\'s posts, and says what it checked', () => {
    const t = text(overviewForYou.render(stagingFixture(), 'app', ctx))
    expect(t).toMatch(/“ ?Price and sale questions ?”/)
    expect(t).toContain('The market’s biggest conversation with few makers. None of your 20 September posts touched on it.')
    expect(t).not.toContain('checked:')
    expect(render(overviewForYou.render(stagingFixture(), 'app', ctx))).toContain('We looked in your posts for: price, sale')
    // Paper keeps the sentence and the words it checked.
    const paper = text(overviewForYou.render(stagingFixture(), 'print', ctx))
    expect(paper).toContain('None of your 20 September posts shared two or more of its words.')
    expect(paper).toContain('checked: price · sale')
  })

  it('names the posts a line matched on, where one did', () => {
    const data = marketFrontFixture()
    const line = { ...data.foryou!.lines[0], sentenceKey: 'foryou.unanswered.some', matchedPosts: [{ id: 'p1', words: ['zippers', 'rain'], postedOn: '2026-09-03' }], figures: { ...data.foryou!.lines[0].figures, foryou_touched: { value: 1, unit: 'videos' as const, label: 'x' } } }
    const t = text(overviewForYou.render({ ...data, foryou: { ...data.foryou!, lines: [line] } }, 'app', ctx))
    expect(t).toContain('1 of your 56 posts')
    expect(t).toContain('your post of 3 Sep: zippers · rain')
    // A line stored before the posts carried their day still names its words.
    const stored = { ...line, matchedPosts: [{ id: 'p1', words: ['zippers', 'rain'] }] }
    expect(text(overviewForYou.render({ ...data, foryou: { ...data.foryou!, lines: [stored] } }, 'app', ctx))).toContain('a post of yours: zippers · rain')
  })

  it('lists at most three posts and counts the rest, as Your moves does (sw-3 item 1: 19 of 61 on Buying & delivery)', () => {
    // Production on 30 Sep: the post judge's phrases for 19 of Sealand's 61
    // posts printed as one run-on line under "19 of your 61 posts".
    const phrases = [
      ['Available online and in store'], ['Available online and in store now', 'Pop in and say hi', 'available both online and in physical stores'],
      ['Tickets are live (and selling fast!)'], ['TICKETS VIA QUICKET - LINK IN BIO'], ['Grab yours on Entry Ninja'], ['available online and in store'],
      ['Tickets available via the link'], ['Grab the last few tickets', 'via the link in our bio'], ['Shop the collection online', 'in store now'],
      ['3 stops at our Sealand stores'], ['Pop in and take a look or shop online'], ['store visit invitation'], ['now online and in store'],
      ['Donate your old bags at any of our stores'], ['shop Second Wave gear at our V&A and Sandton stores'], ['Shop Second Wave gear at our V&A and Sandton stores'],
      ['Donate any old Sealand gear to your nearest store'], ['Available to purchase with your entry'], ['Shop the collection online or in store now'],
    ]
    const days = ['2026-07-21', '2026-07-22', '2026-07-30', ...Array.from({ length: 16 }, (_, i) => `2026-08-${String(i + 1).padStart(2, '0')}`)]
    const f = buildForYou({
      month: '2026-09-01',
      questions: {
        subject: { id: 's-buying', name: 'Buying & delivery', calibration: 'provisional' },
        asked: 79,
        posts: 61,
        sharing: { checked: ['shipping', 'availability'], matched: phrases.map((words, i) => ({ id: `p${i}`, words, postedOn: days[i] })) },
      },
      lead: null,
      followers: null,
    })
    const data = { ...marketFrontFixture(), foryou: f }
    for (const mode of MODES) {
      const t = text(overviewForYou.render(data, mode, ctx))
      if (mode === 'app') expect(t, mode).toContain('19 of your 61 posts touched on it, in that time')
      else expect(t, mode).toContain('19 of your 61 posts in that time shared two or more of its words.')
      expect(t, mode).toContain('your post of 21 Jul: Available online and in store')
      expect(t, mode).toContain('your post of 22 Jul: Available online and in store now · Pop in and say hi · available both online and in physical stores')
      expect(t, mode).toContain('your post of 30 Jul: Tickets are live (and selling fast!)')
      expect(t, mode).toContain('and 16 more')
      expect(t, mode).not.toContain('19 posts on')
      expect(t, mode).not.toContain('TICKETS VIA QUICKET')
      assertCopyContract(render(overviewForYou.render(data, mode, ctx)))
    }
    expect(blockAnswers(overviewForYou, data).figures['unanswered_0_foryou_touched'].value).toBe(19)
  })

  it('Össur (no maker rule): its place among the biggest conversations, with nothing claimed about makers', () => {
    // Board row 1, "Audience identities and amputation types" (44), is a kind
    // never quoted, so the lead is row 2: never "the market's biggest".
    const t = text(overviewForYou.render(ossurFrontFixture(), 'app', ctx))
    expect(t).toContain('The market’s second biggest conversation. None of your 109 September posts touched on it.')
    expect(t).not.toContain('The market’s biggest')
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
  it('prints production\'s census (§2.2): 20 posts, 30 in August, 10 drew 5+, 9 carry a reading, 234 comments', () => {
    const t = text(overviewMoves.render(marketFrontFixture(), 'app', ctx))
    expect(t).toContain(PUBLISHED_TITLE)
    expect(t).toContain('20 posts in September · 30 in August')
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
