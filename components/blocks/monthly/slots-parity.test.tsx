import { describe, it, expect } from 'vitest'

import { blockContext, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { buildCheckLines, recheckLines } from '@/lib/pages/overview-market'
import { monthlySlotsFrom } from '@/lib/reports/monthly-slots'
import { stagingBrandsRead } from '@/lib/test/brands-fixture'
import { RECHECK_BUYERS, RECHECK_READ_WITH, recheckRows, recheckRunFinish } from '@/lib/test/recheck-fixture'
import { FRONT_PAGE_BLOCKS } from '@/components/pages/overview/index'
import { FOR_YOU_NONE } from '@/components/pages/overview/foryou'
import { marketArrivalsFixture, ossurArrivalsFixture } from '@/components/pages/overview/fixture'
import { MONTHLY_BLOCKS } from './index'
import { monthlyFixture } from './fixture'

// THE PAGE AND THE MONTHLY PRINT ONE SENTENCE EACH (WP2.3, WP2.5, WP2.6, WP2.7):
// the monthly's change, you, brands and arrivals sections take their slots
// from the page's own blocks (`monthlySlotsFrom`), and print what the page
// prints.

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('https://app.verbatimintel.com', EMAIL)
const read = (node: Parameters<typeof renderText>[0]): string =>
  renderText(node).replace(/\s+([,.)”’:])/g, '$1').replace(/([“(])\s+/g, '$1')

function built() {
  const base = monthlyFixture()
  const overview = {
    ...base.overview,
    change: {
      ...base.overview.change!,
      checks: buildCheckLines({ rows: recheckRows(), month: '2026-09-01', runFinish: recheckRunFinish() }),
      recheck: 'read' as const,
      buyers: { prevMonth: '2026-08-01', month: '2026-09-01', prev: RECHECK_BUYERS.august, curr: RECHECK_BUYERS.september, readWith: RECHECK_READ_WITH },
    },
    brands: stagingBrandsRead(),
  }
  return { ...base, overview, slots: monthlySlotsFrom(overview) }
}

/** The front page with every deploy-3 block (staging's 20 Sep arrivals and
 *  weeks, the for-you and census blocks) under the monthly's clock. */
function builtFull(page = marketArrivalsFixture()) {
  const base = monthlyFixture()
  const overview = { ...page, change: built().overview.change, brands: stagingBrandsRead() }
  return { ...base, overview, slots: monthlySlotsFrom(overview) }
}

/** The page's block, drawn on paper (the app draws the questions line as two
 *  cells; paper and email print its sentence, as the monthly does). */
const pageText = (key: string, data: ReturnType<typeof builtFull>['overview'], mode: RenderMode = 'print'): string =>
  read(FRONT_PAGE_BLOCKS.find((b) => b.key === key)!.render(data, mode, ctx))

describe('the page and the monthly print one sentence each', () => {
  it('the re-check: every line the page prints, the monthly prints, in every mode', () => {
    const data = built()
    const lines = recheckLines(data.overview.change!)
    expect(lines.length).toBe(2)
    const page = read(FRONT_PAGE_BLOCKS.find((b) => b.key === 'overview.change')!.render(data.overview, 'app', ctx))
    for (const mode of MODES) {
      const monthly = read(MONTHLY_BLOCKS['monthly.change'].render(data, mode, ctx))
      for (const l of lines) {
        expect(page).toContain(l.sentence)
        expect(monthly, mode).toContain(l.sentence)
        if (l.tag) expect(monthly, mode).toContain(l.tag)
      }
      // Once: the slot's lines replace the page block's, never beside them.
      expect(monthly.split('Re-checked').length - 1, mode).toBe(1)
      assertCopyContract(render(MONTHLY_BLOCKS['monthly.change'].render(data, mode, ctx)))
    }
  })

  it('the brands: the name line and each brand, as the page prints them, in every mode', () => {
    const data = built()
    const page = read(FRONT_PAGE_BLOCKS.find((b) => b.key === 'overview.rivals')!.render(data.overview, 'app', ctx))
    for (const mode of MODES) {
      const monthly = read(MONTHLY_BLOCKS['monthly.brands'].render(data, mode, ctx))
      for (const words of [
        'In September your name came up in none of your market’s 654 videos. The 8 videos that name you are your own posts.',
        'not counted yet',
        'Without our',
      ]) {
        expect(page).toContain(words)
        expect(monthly, mode).toContain(words)
      }
      expect(monthly, mode).toMatch(/Patagonia\s*26\s*45/)
      assertCopyContract(render(MONTHLY_BLOCKS['monthly.brands'].render(data, mode, ctx)))
    }
  })

  it('the section is absent from an artefact where the page kept deploy 2’s line', () => {
    const base = monthlyFixture()
    expect(monthlySlotsFrom(base.overview).brands.state).toBe('stub')
    expect(MONTHLY_BLOCKS['monthly.brands'].absent?.({ ...base, slots: monthlySlotsFrom(base.overview) })).toBe(true)
  })

  it('every slot reads the page’s own block: change, arrivals, you and brands all filled from one Overview', () => {
    const data = builtFull()
    for (const key of ['change', 'arrivals', 'you', 'brands'] as const) expect(data.slots[key].state, key).toBe('filled')
    expect(data.slots.arrivals).toEqual({ state: 'filled', value: data.overview.arrivals })
    expect(data.slots.you).toEqual({ state: 'filled', value: { foryou: data.overview.foryou, published: data.overview.published } })
  })

  it('with this update: the page’s came-in and heard-first words, in every mode', () => {
    const data = builtFull()
    const page = pageText('overview.arrivals', data.overview, 'app')
    const words = [
      'With the 20 Sep update: 395 videos read in your market for the first time, and 11,999 more September comments came in.',
      'With 10+ videos in September:',
    ]
    for (const mode of MODES) {
      const monthly = read(MONTHLY_BLOCKS['monthly.arrivals'].render(data, mode, ctx))
      for (const w of words) {
        expect(page).toContain(w)
        expect(monthly, mode).toContain(w)
      }
      // The monthly carries no weekly volume bars (plan §2.9).
      expect(monthly, mode).not.toMatch(/week by week/i)
      assertCopyContract(render(MONTHLY_BLOCKS['monthly.arrivals'].render(data, mode, ctx)))
    }
  })

  it('what it means for you and what you published: the page’s sentences and census, in every mode', () => {
    const data = builtFull()
    const forYou = pageText('overview.foryou', data.overview)
    const census = pageText('overview.moves', data.overview)
    const sentence = 'Your market asked about it on 16 videos over the last 3 months. None of your 56 posts in that time shared two or more of its words.'
    expect(forYou).toContain(sentence)
    for (const mode of MODES) {
      const monthly = read(MONTHLY_BLOCKS['monthly.you'].render(data, mode, ctx))
      expect(monthly, mode).toContain(sentence)
      expect(monthly, mode).toContain('Waterproofing')
      for (const w of ['20 posts', 'in September', '30 the month before', '10 drew 5+', 'comments each', '9 carry a reading', '234 comments', 'Your followers talked most about', 'Moves: none dated yet']) {
        expect(census, w).toContain(w)
        expect(monthly, `${mode}: ${w}`).toContain(w)
      }
      assertCopyContract(render(MONTHLY_BLOCKS['monthly.you'].render(data, mode, ctx)))
    }
  })

  it('a month with no reading of your audience says so, as the page does, and never prints 0', () => {
    const page = marketArrivalsFixture()
    const unread = builtFull({ ...page, published: { ...page.published!, withReading: null, readingComments: null } })
    const census = pageText('overview.moves', unread.overview)
    expect(census).toContain('no reading yet')
    for (const mode of MODES) {
      const monthly = read(MONTHLY_BLOCKS['monthly.you'].render(unread, mode, ctx))
      expect(monthly, mode).toContain('no reading yet')
      expect(monthly, mode).toContain('nothing under your posts read for September')
      expect(monthly, mode).not.toMatch(/\b0\s*carry a reading/)
    }
  })

  it('one post is "post", on the page and in the monthly', () => {
    const page = marketArrivalsFixture()
    const one = builtFull({ ...page, published: { ...page.published!, posts: 1, drewFive: 0 } })
    expect(pageText('overview.moves', one.overview)).toMatch(/\b1\s*post\b/)
    for (const mode of MODES) expect(read(MONTHLY_BLOCKS['monthly.you'].render(one, mode, ctx)), mode).toMatch(/\b1\s*post\b(?!s)/)
  })

  it('where nothing lines up, the monthly prints the page’s one line', () => {
    const page = marketArrivalsFixture()
    const none = builtFull({ ...page, foryou: { month: '2026-09-01', lines: [] } })
    expect(pageText('overview.foryou', none.overview)).toContain(FOR_YOU_NONE)
    for (const mode of MODES) expect(read(MONTHLY_BLOCKS['monthly.you'].render(none, mode, ctx)), mode).toContain(FOR_YOU_NONE)
  })

  it('Össur: the lead line with no maker claim, and its census, as its page prints them', () => {
    const data = builtFull(ossurArrivalsFixture())
    const lead = 'The market’s second biggest conversation. None of your 109 posts from the month shared two or more of its words.'
    expect(pageText('overview.foryou', data.overview)).toContain(lead)
    for (const mode of MODES) {
      const monthly = read(MONTHLY_BLOCKS['monthly.you'].render(data, mode, ctx))
      expect(monthly, mode).toContain(lead)
      expect(monthly, mode).toContain('Admiration for personal resilience')
      expect(monthly, mode).toContain('109 posts')
    }
  })
})
