import { describe, it, expect } from 'vitest'
import { isValidElement, type ReactElement } from 'react'

import { blockAnswers, blockContext, figureCount, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { BlockFrame } from '@/components/blocks/frame'
import { NUMBER_BUDGET, type OverviewData } from '@/lib/pages/overview'
import { comparabilityOf, type PairRow } from '@/lib/reading/comparability'
import { withGatherFlags } from '@/lib/reading/gather-flags'
import { pairJudge } from '@/lib/reading/pairs'
import { WhatWeChangedLead } from '@/components/settings/record/what-we-changed'
import { LEAD_MAX_MAKER_SHARE, segmentOf, themeFigures, themeToken } from '@/lib/pages/overview-market'
import { septemberThemes } from '@/lib/test/market-fixture'
import { FRONT_PAGE_BLOCKS, MARKET_TITLES, OverviewPage } from './index'
import { overviewSentence } from './sentence'
import { overviewThemes } from './themes'
import { WHAT_WE_CHANGED_HREF, drawsStrip, stripMonths } from './change'
import { OCTOBER_ENDED_AT, OCTOBER_LEADS_AT, marketBeforeMakersFixture, marketFrontFixture, octoberLeadsFixture, ossurFrontFixture, overviewFixture } from './fixture'
import { prevCountTag } from './market-subjects'

// Your market (market-first WP1.6): the done-when checks that a render can
// make, on plan §2.2's print (production's figures as at the 24 Sep update).

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('https://app.verbatimintel.com', EMAIL)
/** Rendered text as a reader reads it: `renderText` spaces every node apart,
 *  so a quotation mark, a comma and a parenthesis are closed back up. */
const read = (node: Parameters<typeof renderText>[0]): string =>
  renderText(node).replace(/\s+([,.)”’:])/g, '$1').replace(/([“(])\s+/g, '$1')

/** The change block alone, on the front page's fixture, as the page draws it. */
const overviewChangeRender = () => FRONT_PAGE_BLOCKS.find((b) => b.key === 'overview.change')!.render(marketFrontFixture(), 'app', ctx)

const STATES: [string, () => OverviewData][] = [
  ['Sealand', marketFrontFixture],
  ['Sealand before MF1', marketBeforeMakersFixture],
  ['Sealand, staging calibration', () => marketFrontFixture({ subjectsCalibration: 'staging' })],
  ['Össur', ossurFrontFixture],
]

// ONCE OCTOBER LEADS (default M-e, 26 Sep): from the 18 Oct update the pair
// read is September against October and the first pair read the same way is
// October against November. The strip drew "Sep, Oct | Oct, Nov", October
// twice; it draws each month once, the bracket over Oct and Nov, and the "as
// at" in October (18 Oct) or, from the 1 Nov update, in November.
describe('the change strip once October leads: each month once', () => {
  const change = (data: OverviewData) => render(FRONT_PAGE_BLOCKS.find((b) => b.key === 'overview.change')!.render(data, 'app', ctx))

  it('stripMonths: the pairs as one row, oldest first, the bracket over the next pair', () => {
    expect(stripMonths(['2026-08-01', '2026-09-01'], ['2026-10-01', '2026-11-01'])).toEqual({
      months: [
        { month: '2026-08-01', read: true }, { month: '2026-09-01', read: true },
        { month: '2026-10-01', read: false }, { month: '2026-11-01', read: false },
      ],
      from: 2, span: 2,
    })
    expect(stripMonths(['2026-09-01', '2026-10-01'], ['2026-10-01', '2026-11-01'])).toEqual({
      months: [{ month: '2026-09-01', read: true }, { month: '2026-10-01', read: true }, { month: '2026-11-01', read: false }],
      from: 1, span: 2,
    })
    // November leads (from 16 Nov): the pair read IS the next pair.
    expect(stripMonths(['2026-10-01', '2026-11-01'], ['2026-10-01', '2026-11-01'])).toEqual({
      months: [{ month: '2026-10-01', read: true }, { month: '2026-11-01', read: true }],
      from: 0, span: 2,
    })
  })

  it('draws the strip only where its months touch: never "Jul | Aug | Oct Nov" on an earlier month (deploy 2 review)', () => {
    const sep = marketFrontFixture().change!
    expect(drawsStrip(sep)).toBe(true)
    expect(drawsStrip(octoberLeadsFixture(OCTOBER_LEADS_AT).change!)).toBe(true)
    expect(drawsStrip(octoberLeadsFixture(OCTOBER_ENDED_AT).change!)).toBe(true)
    // The August page, one click away through the month menu: the pair read
    // is July against August, the next pair October against November.
    const aug = { ...sep, prevMonth: '2026-07-01', month: '2026-08-01' }
    expect(drawsStrip(aug)).toBe(false)
    const markup = change({ ...marketFrontFixture(), change: aug })
    expect(markup).not.toContain('>Jul</span>')
    expect(markup).not.toContain('the first month-on-month comparison read the same way</span>')
    expect(read(FRONT_PAGE_BLOCKS.find((b) => b.key === 'overview.change')!.render({ ...marketFrontFixture(), change: aug }, 'app', ctx)))
      .toContain('The first month-on-month comparison read the same way: October against November')
  })

  it('18 Oct: the bar reads October, as at the 18 Oct update', () => {
    const text = read(<OverviewPage data={octoberLeadsFixture(OCTOBER_LEADS_AT)} />)
    expect(text).toContain('Sealand · October 2026 as at the 18 Oct update · next update Sun 25 Oct')
  })

  it('18 Oct: Sep, Oct and Nov once each, October solid, the bracket over Oct and Nov, the "as at" in October', () => {
    const markup = change(octoberLeadsFixture(OCTOBER_LEADS_AT))
    for (const [name, ground] of [['Sep', 'bg-inner'], ['Oct', 'bg-inner'], ['Nov', 'bg-tile']]) {
      expect(markup.match(new RegExp(`>${name}</span>`, 'g'))?.length, name).toBe(1)
      expect(markup).toContain(`<span class="relative z-[1] -mx-1 px-1 ${ground}">${name}</span>`)
    }
    expect(markup).not.toContain('>Aug</span>')
    expect(markup).toMatch(/class="grid gap-x-3 grid-cols-3 mt-5"/)
    expect(markup).toMatch(/<div class="col-start-2 col-span-2 flex flex-col">/)
    expect(markup).toMatch(/<span class="col-start-2 col-span-2 flex justify-center">/)
    // One "as at", on 18 Oct (17.5 of October's 31 days); the marks stay
    // under September (8.5, 12.5 and 16.5 of 30).
    expect(markup.match(/as at 18 Oct/g)?.length).toBe(1)
    expect(markup.match(/left:56\.45%/g)?.length).toBe(2)
    for (const x of ['28.33', '41.67', '55.00']) expect(markup).toContain(`left:${x}%`)
    expect(read(<OverviewPage data={octoberLeadsFixture(OCTOBER_LEADS_AT)} />)).toContain('from the 6 Dec update')
  })

  it('the "as at" words sit clear of the cell\'s top edge, and its rule stops at the cell\'s foot (deploy 2 review)', () => {
    for (const at of [OCTOBER_LEADS_AT, OCTOBER_ENDED_AT] as const) {
      const markup = change(octoberLeadsFixture(at))
      expect(markup).toContain('absolute -top-4 bottom-0 w-[1.5px]')
      expect(markup).not.toContain('-bottom-1 w-[1.5px]')
      expect(markup).toMatch(/absolute -top-5 whitespace-nowrap font-mono[^>]*>as at /)
    }
  })

  it('1 Nov: October, ended, and the "as at" in the dashed November, once', () => {
    const data = octoberLeadsFixture(OCTOBER_ENDED_AT)
    expect(read(<OverviewPage data={data} />)).toContain('Sealand · October 2026 as at the 1 Nov update · next update Sun 8 Nov')
    const markup = change(data)
    for (const name of ['Sep', 'Oct', 'Nov']) expect(markup.match(new RegExp(`>${name}</span>`, 'g'))?.length, name).toBe(1)
    expect(markup.match(/as at 1 Nov/g)?.length).toBe(1)
    expect(markup).toContain('left:1.67%')
    expect(markup).toMatch(/class="grid gap-x-3 grid-cols-3 mt-5"/)
  })

  it('prints no "moved", no arrow and no em dash at either clock', () => {
    for (const at of [OCTOBER_LEADS_AT, OCTOBER_ENDED_AT] as const) {
      const text = read(<OverviewPage data={octoberLeadsFixture(at)} />)
      expect(text).not.toMatch(/\bmoved\b/)
      expect(text).not.toMatch(/[▲▼]/)
      expect(text).not.toContain('\u2014')
    }
  })
})

// A CAPPED SUNDAY IN OCTOBER (R-c, deploy 2 review): from the 6 Dec update
// October against November is measured and read the same way on all four
// rules, and the 11 Oct update was capped. The judge flags the pair for run
// health only, which is not one of decision D's rules: the block still says the
// pair was read the same way, and does not offer it again as the first one.
describe('the change block at the 6 Dec update, with a capped October update', () => {
  const row: PairRow = {
    prevMonth: '2026-10-01', month: '2026-11-01',
    searchOutside: { prev: { k: 0, n: 700 }, curr: { k: 0, n: 720 } }, addedOnly: { k: 0, n: 720 },
    codeChanges: [], depth: { prevMedian: 20, currMedian: 19 }, gather: [], lateCapture: null,
    readThroughRun: 'run-6dec', methodVersion: 'mf1', computedAt: '2026-12-07T10:00:00.000Z',
  }
  const updates = ['2026-10-04', '2026-10-11', '2026-10-18', '2026-10-25', '2026-11-01', '2026-11-08', '2026-11-15', '2026-11-22', '2026-11-29', '2026-12-06']
    .map((d) => ({ id: d === '2026-12-06' ? 'run-6dec' : `run-${d}`, finishedAt: `${d}T08:00:00.000Z` }))
  const judge = withGatherFlags(
    pairJudge({ now: '2026-12-08T06:00:00.000Z', changes: [], rows: [row], updates, nextUpdateAfter: null }),
    [{ id: 'capped-1011', at: '2026-10-11T04:18:00.000Z', month: '2026-10-01', runId: 'run-2026-10-11' }],
  )
  const pair = judge('2026-10-01', '2026-11-01', 'market')
  const change: NonNullable<OverviewData['change']> = {
    prevMonth: '2026-10-01', month: '2026-11-01', pair,
    next: { prevMonth: '2026-10-01', month: '2026-11-01', sameAgeFrom: '2026-12-06T04:00:00.000Z', inFullExpected: '2027-01-03T04:00:00.000Z' },
    checks: [], readWith: '2026-12-06T08:00:00.000Z', paused: false, asAt: '2026-12-06T08:00:00.000Z', searchChanges: [],
  }

  it('prints "October and November were read the same way." and no next pair, in every mode', () => {
    expect(pair.mode).toBe('flag')
    for (const mode of MODES) {
      const text = read(FRONT_PAGE_BLOCKS.find((b) => b.key === 'overview.change')!.render({ ...marketFrontFixture(), change }, mode, ctx))
      expect(text, mode).toContain('October and November were read the same way.')
      expect(text, mode).not.toContain('The first month-on-month comparison read the same way')
    }
  })

  it('Settings › What we changed says the same, with nothing under "Why … is not compared"', () => {
    const text = read(<WhatWeChangedLead block={change} />)
    expect(text).toContain('October and November were read the same way.')
    expect(text).not.toContain('sit side by side')
    expect(text).not.toContain('is not compared')
    expect(text).not.toContain('The first month-on-month comparison read the same way')
  })
})

describe('Your market prints §2.2’s blocks on the 24 Sep figures', () => {
  const text = read(<OverviewPage data={marketFrontFixture()} />)

  it('the bar: the month selector and one line, and nothing else', () => {
    expect(text).toContain('Sealand · September 2026 as at the 24 Sep update · next update Sun 27 Sep')
    expect(text).not.toContain('so far, ')
    expect(text).not.toContain('still filling')
  })

  it('"The month": the size, then the three biggest conversations with one denominator, then August as levels and the chip', () => {
    expect(text).toContain('Your market in September so far: 655 videos and 16,233 comments.')
    expect(text).toContain(
      'Its three biggest conversations not led by makers, of the 626 category videos: “Ready to buy handmade bags” 69, “Love for stylish bag design” 60 and “Confusion over airline bag sizes” 21. About a third of each of the first two sits under makers’ own posts.',
    )
    expect(text).toContain('August: 7%, 7% and 3% of 351')
    expect(text).toContain('not read as a change: we changed our searches in September')
  })

  it('the voice is the lead theme’s own, and the lead is a quarter makers or fewer', () => {
    expect(text).toContain('One voice on “Confusion over airline bag sizes”')
    expect(text).toContain('from that theme’s own comments')
    const data = marketFrontFixture()
    expect(data.hero?.kind === 'themes' && data.hero.lead?.makerShare).toBeLessThanOrEqual(LEAD_MAX_MAKER_SHARE)
  })

  it('the board: ten rows not led by makers, the makers line, August as a share in its column', () => {
    expect(text).toContain('What your market talked about')
    expect(text).toContain('Sep of 626')
    expect(text).toContain('Aug of 351')
    expect(text).toContain('Makers and DIY, grouped: 7 themes at 10+, led by Admiration for upcycled bag creativity (71) and Respect for handmade craftsmanship (64)')
    expect(text).toContain('about a third makers')
    expect(text).toContain('a fifth makers')
    // A row `theme_maker_shares` did not answer for says so in its Makers cell.
    for (const mode of ['app', 'email'] as const) {
      const board = renderText(overviewThemes.render(marketFrontFixture(), mode, ctx))
      expect(board).toContain('Backpack brand and model comparisons')
      expect(board.split('not measured').length - 1).toBe(3)
    }
  })

  it('its footer names every theme at 10+ on Conversation (WP2.4), under the current label', () => {
    const data = marketFrontFixture()
    expect(data.themes?.atTen).toBe(21)
    expect(renderText(overviewThemes.render(data, 'app', ctx))).toContain('All 21 on Conversation →')
    expect(renderText(overviewThemes.render(data, 'email', ctx))).toContain('All 21 on Conversation →')
    expect(renderText(overviewThemes.render(data, 'app', ctx))).not.toContain('Voice')
  })

  it('wraps a long theme rather than cutting it with "…" (at 1024 the theme track is about 210px)', () => {
    const board = render(overviewThemes.render(marketFrontFixture(), 'app', ctx))
    expect(board).toContain('role="rowheader"')
    expect(board).not.toMatch(/role="rowheader" class="[^"]*truncate/)
  })

  it('declares every video count the makers line prints, on the board’s own theme tokens', () => {
    const data = marketFrontFixture()
    const figures = overviewThemes.figures?.(data) ?? {}
    const leads = data.themes?.makers?.lead ?? []
    expect(leads.map((t) => t.k)).toEqual([71, 64])
    for (const t of leads) expect(figures[themeToken(t.registryId, 'k')]).toMatchObject({ value: t.k, unit: 'videos' })
  })

  it('the kinds and the mood as levels, "Praising it" for praise, one chip', () => {
    expect(text).toContain('What people did in the comments')
    expect(text).toContain('Praising it')
    expect(text).not.toContain('Saying it worked')
    expect(text).toContain('under 10, a count only')
  })

  it('the asks, each list counting its own themes, with a real quote of its kind', () => {
    expect(text).toContain('What your market asked, complained about and wished for')
    expect(text).toContain('Confusion over airline bag sizes 21')
    expect(text).toContain('Interest in specific colors 11')
    expect(text).toContain('If you made it in pink and a bigger size I would buy it immediately')
  })

  it('the subjects on the market, each with its calibration word, and a subject never read says so and promises no date', () => {
    expect(text).toContain('The market by subject')
    expect(text).toContain('Looks & style provisional')
    expect(text).toContain('Buying & delivery no reading yet')
  })

  // THE MAKER TAG (§2.2 block 6, the approved Main artboard's "provisional ·
  // ▨ over a third makers"), at a fifth or more, as the Subjects rail prints
  // it: staging at the 11 Oct clock read Looks & style at 35 of 103 market
  // videos makers' (0.34), Durability 9 of 39 (0.23) and Price 3 of 25 (0.12).
  it('a subject a fifth or more makers carries the rail\'s maker tag; under a fifth, or not measured, none', () => {
    const base = marketFrontFixture()
    const share: Record<string, number> = { 's-looks': 35 / 103, 's-durability': 9 / 39, 's-price': 3 / 25 }
    const rows = base.subjects.rows.map((r) => (share[r.id] != null ? { ...r, makerShare: share[r.id] } : r))
    const data = { ...base, subjects: { ...base.subjects, rows } }
    const block = FRONT_PAGE_BLOCKS.find((b) => b.key === 'overview.subjects')!
    for (const mode of MODES) {
      const t = read(block.render(data, mode, ctx))
      expect(t, mode).toMatch(/Looks & style (· )?provisional (· )?about a third makers/)
      expect(t, mode).toMatch(/Durability (· )?provisional (· )?about a quarter makers/)
      expect(t, mode).not.toMatch(/Price[^\n]*makers/)
    }
    // A stored copy with no maker share draws no tag.
    expect(read(block.render(base, 'app', ctx))).not.toContain('makers')
  })

  // Default M-a: one wording for a subject the month was not read for on every
  // surface, which is the row's `unread` (`unreadWords`): "no reading yet"
  // while an update will still read the month, and "not read in August" once
  // none will (a month picked in the selector after it froze).
  it('a subject the month was not read for prints the row\'s own unread words, the ones every surface prints', () => {
    const base = marketFrontFixture()
    const rows = base.subjects.rows.map((r) => (r.id === 's-buying' ? { ...r, unread: 'not read in August' } : r))
    const frozen = { ...base, subjects: { ...base.subjects, rows } }
    const block = FRONT_PAGE_BLOCKS.find((b) => b.key === 'overview.subjects')!
    for (const mode of MODES) {
      const printed = read(block.render(frozen, mode, ctx))
      expect(printed).toContain('Buying & delivery')
      expect(printed).toContain('not read in August')
      expect(printed).not.toContain('Buying & delivery no reading yet')
      expect(printed).not.toContain('Buying & delivery · no reading yet')
    }
  })

  it('a measured month before under 10 prints as its count, never the "no reading" dot (§2.2: "Price … 23 (4%)  5")', () => {
    expect(text).toContain('Price provisional · August under 10, a count 23 4% 5')
    expect(text).not.toContain('Price provisional 23 4% ·')
    // Said on the row, so the count cannot read as a share (finish-list item 9).
    expect(prevCountTag(7, { month: '2026-08-01', n: 378 })).toBe('August under 10, a count')
    expect(prevCountTag(70, { month: '2026-08-01', n: 378 })).toBeNull()
    expect(prevCountTag(null, { month: '2026-08-01', n: 378 })).toBeNull()
  })

  it('prints no page footnote under the blocks (25 Sep rulings)', () => {
    const data = { ...marketFrontFixture(), notes: [{ kind: 'clustering_unrecorded' as const, text: 'We did not record how themes were grouped for Sep 2026.', months: ['2026-09-01'] }] }
    expect(read(<OverviewPage data={data as never} />)).not.toContain('We did not record how themes were grouped')
  })

  it('brands in one line, naming the brands page by its current label', () => {
    // "Brands" since deploy 5 (WP3.5).
    expect(text).toContain('Brands in your market, counted in every video they come up in, arrive with the 4 Oct update. Until then, Brands lists what was filed under each brand you track.')
  })

  it('what changed: the refusal, the first pair read the same way, and the link to the dated list', () => {
    expect(text).toContain('Not read as a change: we changed our searches in September.')
    expect(text).toContain('The first month-on-month comparison read the same way: October against November, from the 6 Dec update, if nothing we search changes.')
    expect(render(<OverviewPage data={marketFrontFixture()} />)).toContain(`href="${WHAT_WE_CHANGED_HREF}"`)
  })

  it('what changed, measured: WP1.8\u2019s one figure in the preview\u2019s sentence, over the market, never the strict count (the 26 Sep ruling)', () => {
    // Staging's (Aug, Sep) row as measure-comparability wrote it on 26 Sep,
    // read through the 20 Sep update.
    const row: PairRow = {
      prevMonth: '2026-08-01', month: '2026-09-01',
      searchOutside: { prev: { k: 148, n: 351 }, curr: { k: 376, n: 625 } }, addedOnly: { k: 356, n: 654 },
      codeChanges: [], depth: { prevMedian: 21, currMedian: 14 }, gather: [], lateCapture: null,
      readThroughRun: 'b67b56de', methodVersion: 'mf1_v1', computedAt: '2026-09-26T16:42:06.059Z',
    }
    const measured = comparabilityOf('2026-08-01', '2026-09-01', {
      row, view: 'market',
      changes: [{ id: 'terms-0913', surface: 'terms', changedAt: '2026-09-13T10:00:58.000Z', note: null, affects: ['market', 'themes', 'brands', 'lens'] }],
      later: { state: 'ended', readToEnd: true, latestUpdateRunId: 'b67b56de' },
    })
    const base = marketFrontFixture()
    const data = { ...base, change: { ...base.change!, pair: measured, readWith: '2026-09-20T08:33:47.358Z' } }
    const block = FRONT_PAGE_BLOCKS.find((b) => b.key === 'overview.change')!
    for (const mode of MODES) {
      const t = read(block.render(data, mode, ctx))
      expect(t).toContain('Not a change we can stand behind yet: about half of September came from searches we added in September (356 of 654, read with the 20 Sep update).')
      expect(t).not.toMatch(/\b376\b|\b625\b/)
      assertCopyContract(render(block.render(data, mode, ctx)))
    }
    // Without the figure (a row written before the columns), the refusal with no figure.
    const bare = comparabilityOf('2026-08-01', '2026-09-01', {
      row: { ...row, addedOnly: null }, view: 'market',
      changes: [{ id: 'terms-0913', surface: 'terms', changedAt: '2026-09-13T10:00:58.000Z', note: null, affects: ['market', 'themes', 'brands', 'lens'] }],
      later: { state: 'ended', readToEnd: true, latestUpdateRunId: 'b67b56de' },
    })
    const t = read(block.render({ ...data, change: { ...data.change, pair: bare } }, 'app', ctx))
    expect(t).toContain('Not read as a change: we changed our searches in September.')
    expect(t).not.toMatch(/\b376\b|\b356\b/)
  })

  it('what changed: the strip marks our search changes and the "as at", with its bracket words above the bracket (the approved preview)', () => {
    const markup = render(overviewChangeRender())
    expect(text).toContain('our search changes, 9, 13 and 17 Sep')
    expect(text).toContain('as at 24 Sep')
    // Three marks under September, placed on their days (8.5, 12.5 and 16.5
    // of 30), and the rule through 24 Sep (23.5 of 30).
    expect(markup.match(/left:28\.33%/g)?.length).toBe(1)
    expect(markup).toContain('left:41.67%')
    expect(markup).toContain('left:55.00%')
    expect(markup.match(/left:78\.33%/g)?.length).toBe(2)
    // The words sit above the bracket, not inside it.
    const words = markup.indexOf('the first month-on-month comparison read the same way</span>')
    const bracket = markup.indexOf('border-x border-t border-secondary-foreground')
    expect(words).toBeGreaterThan(0)
    expect(bracket).toBeGreaterThan(words)
    // The key is read; the drawing, which the sentences say in words, is not.
    expect(markup).toMatch(/<p class="[^"]*font-mono[^"]*"><svg[^>]*aria-hidden="true"[^>]*>.*?<\/svg>our search changes/)
    // The date under the bracket never breaks inside "6 Dec update" (at 390
    // the words once wrapped to leave "update" alone on a second line).
    expect(markup).toMatch(/whitespace-nowrap[^"]*">from the <span class="whitespace-nowrap">6 Dec update<\/span>/)
  })

  it('what changed: an "as at" in the dashed October clears the bracket, and its rule passes behind the month names', () => {
    // From the 4 Oct update to the switch, September is read as at a day in
    // October, which the strip marks in the dashed pair, under the bracket.
    const data = marketFrontFixture()
    const at = (asAt: string) => render(FRONT_PAGE_BLOCKS.find((b) => b.key === 'overview.change')!.render({ ...data, change: { ...data.change!, asAt } }, 'app', ctx))
    const oct = at('2026-10-11T08:30:00.000Z')
    expect(oct.match(/as at 11 Oct/g)?.length).toBe(1)
    expect(oct).toContain('left:33.87%')
    expect(oct).toMatch(/class="grid gap-x-3 grid-cols-4 mt-5"/)
    // Every month's name stands on its cell's ground, above the rule.
    for (const [name, ground] of [['Aug', 'bg-inner'], ['Sep', 'bg-inner'], ['Oct', 'bg-tile'], ['Nov', 'bg-tile']]) {
      expect(oct).toContain(`<span class="relative z-[1] -mx-1 px-1 ${ground}">${name}</span>`)
    }
    // The preview's state, an "as at" in the month read, keeps its spacing.
    expect(render(overviewChangeRender())).toMatch(/class="grid gap-x-3 grid-cols-4 mt-2\.5"/)
  })

  it('what changed: four months while September is read, the bracket over the last two', () => {
    const markup = render(overviewChangeRender())
    for (const name of ['Aug', 'Sep', 'Oct', 'Nov']) expect(markup.match(new RegExp(`>${name}</span>`, 'g'))?.length, name).toBe(1)
    expect(markup).toMatch(/<div class="col-start-3 col-span-2 flex flex-col">/)
  })

  it('what changed: a stored block without the strip’s fields draws the months and no mark', () => {
    const data = marketFrontFixture()
    const bare = { ...data, change: { ...data.change!, asAt: undefined, searchChanges: undefined } }
    const t = read(<OverviewPage data={bare} />)
    expect(t).toContain('the first month-on-month comparison read the same way')
    expect(t).not.toContain('our search change')
    expect(t).not.toContain('as at 24 Sep')
  })

  it('prints no "moved", no arrow and no direction word anywhere on the page', () => {
    expect(text).not.toMatch(/\bmoved\b/)
    expect(text).not.toMatch(/[▲▼]/)
  })
})

describe('the makers rule and the lead (decision F; §7.11)', () => {
  it('never puts a maker-led theme first on the board', () => {
    const board = marketFrontFixture().themes!
    expect(segmentOf(board.rows[0])).toBeNull()
  })

  it('never leads or quotes with a theme over a quarter makers: not "Ready to buy handmade bags" (its staging twin measured 36%)', () => {
    const data = marketFrontFixture()
    const lead = data.hero?.kind === 'themes' ? data.hero.lead : null
    expect(lead?.registryId).not.toBe('th-ready-to-buy')
    expect(renderText(overviewSentence.render(data, 'app', ctx))).not.toContain('voice on “Ready to buy')
  })

  it('before MF1 is applied groups nothing, names no lead, prints no voice and says makers are not marked yet', () => {
    const data = marketBeforeMakersFixture()
    const t = read(<OverviewPage data={data} />)
    expect(t).toContain('Makers’ videos are not marked yet; this list groups them once they are.')
    expect(t).not.toContain('voice on')
    expect(t).toContain('Its biggest conversations, of the 626 category videos:')
  })
})

describe('nothing skipped (§5.9)', () => {
  it('every theme at 10+ is a board row, grouped, or counted; the top ten not led by makers are all rows', () => {
    const board = marketFrontFixture().themes!
    const atTen = septemberThemes().filter((t) => t.k >= 10)
    expect(board.atTen).toBe(atTen.length)
    const onBoard = new Set(board.rows.map((r) => r.registryId))
    const notLed = atTen.filter((t) => segmentOf(t) == null).sort((a, b) => b.k - a.k || (b.prev?.k ?? 0) - (a.prev?.k ?? 0))
    for (const t of notLed.slice(0, 10)) expect(onBoard.has(t.registryId), t.label).toBe(true)
    for (const t of atTen) {
      const accounted = onBoard.has(t.registryId) || segmentOf(t) === 'makers' || segmentOf(t) === 'noise'
      expect(accounted || notLed.indexOf(t) >= 10, t.label).toBe(true)
    }
  })
})

describe('the first screen holds at most 30 numbers (decision B)', () => {
  it('the bar, "The month" and the board’s first five rows', () => {
    const data = marketFrontFixture()
    const board = data.themes!
    const firstScreen = [
      blockAnswers(overviewSentence, data).figures,
      themeFigures(board, board.rows.slice(0, 5)),
    ]
    const count = figureCount(firstScreen)
    expect(count).toBeLessThanOrEqual(NUMBER_BUDGET)
    // It is a real page's worth, not trivially under.
    expect(count).toBeGreaterThan(15)
  })

  it('no block prints more than 12 rows (decision B)', () => {
    const data = marketFrontFixture()
    expect(data.themes!.rows.length).toBeLessThanOrEqual(12)
    expect(data.category.market!.kinds.length).toBeLessThanOrEqual(12)
    expect(data.subjects.rows.length).toBeLessThanOrEqual(12)
  })
})

describe('the 25 Sep rulings on Your market (§5.12)', () => {
  const rootOf = (node: unknown): ReactElement<Record<string, unknown>> | null =>
    isValidElement(node) ? (node as ReactElement<Record<string, unknown>>) : null

  it('every block header is its title alone and every footer holds a link alone, in every mode and state', () => {
    for (const [name, make] of STATES) {
      const data = make()
      for (const block of FRONT_PAGE_BLOCKS) {
        for (const mode of MODES) {
          const root = rootOf(block.render(data, mode, ctx))
          expect(root?.type, `${name} ${block.key} ${mode}`).toBe(BlockFrame)
          expect(root?.props.meta, `${name} ${block.key} ${mode} meta`).toBeUndefined()
          expect(root?.props.footerNote, `${name} ${block.key} ${mode} footerNote`).toBeUndefined()
          expect(root?.props.title, `${name} ${block.key} title`).toBe(MARKET_TITLES[block.key])
          const footer = root?.props.footer
          if (mode === 'print') expect(footer, `${name} ${block.key} print footer`).toBeNull()
          else expect(render(<>{footer as never}</>), `${name} ${block.key} footer`).toMatch(mode === 'email'
            ? /^<a [^>]*href="[^"]+"[^>]*>[^<]+<\/a>$/
            // The app's link: its words in one span, its arrow in another
            // (`openLink`), and nothing else.
            : /^<a [^>]*href="[^"]+"[^>]*><span data-link-text=""[^>]*>[^<]+<\/span>(?: <span aria-hidden="true">→<\/span>)?<\/a>$/)
        }
      }
    }
  })

  it('titles the first block "The month"', () => {
    expect(MARKET_TITLES['overview.sentence']).toBe('The month')
  })

  it('prints no "how sound" string, and keeps the copy contract, in every block, mode and state', () => {
    for (const [name, make] of STATES) {
      const data = make()
      expect(renderText(<OverviewPage data={data} />).toLowerCase(), name).not.toContain('how sound')
      for (const block of FRONT_PAGE_BLOCKS) {
        for (const mode of MODES) {
          const markup = render(block.render(data, mode, ctx))
          expect(markup.toLowerCase(), `${name} ${block.key} ${mode}`).not.toContain('how sound')
          expect(markup, `${name} ${block.key} ${mode}`).not.toContain('[[')
          assertCopyContract(markup)
        }
      }
    }
  })
})

describe('Össur, paused, with no maker rule and no subjects (§2.13, §5.2)', () => {
  const text = read(<OverviewPage data={ossurFrontFixture()} />)

  it('reads September as at the 13 Sep update, updates paused', () => {
    expect(text).toContain('as at the 13 Sep update · updates paused')
  })

  it('states its biggest conversations as levels, with no makers line and no "buyer"', () => {
    expect(text).toContain('Its biggest conversations, of the 338 category videos:')
    expect(text).not.toContain('Makers and DIY')
    expect(text.toLowerCase()).not.toContain('buyer')
  })

  it('lists "Brand boycott over politics" at 16 on the board', () => {
    expect(read(overviewThemes.render(ossurFrontFixture(), 'app', ctx))).toContain('Brand boycott over politics 16')
  })

  // "AUG 0%" (the lead's ruling of 27 Sep): August did not read the theme, so
  // its August cell is the preview's "·", in every mode, never "0%".
  it('prints "·" in August for "Brand boycott over politics", which August did not read, never "0%"', () => {
    for (const mode of MODES) {
      const board = read(overviewThemes.render(ossurFrontFixture(), mode, ctx))
      expect(board, mode).toMatch(/Brand boycott over politics 16 5% ·/)
      expect(board, mode).not.toMatch(/(^|\s)0%/)
    }
    expect(Object.values(overviewThemes.figures?.(ossurFrontFixture()) ?? {}).filter((f) => f.value === 0)).toEqual([])
  })

  // NO NEW / NOW 10+ COLUMN ON THE FRONT PAGE'S BOARD (the lead's ruling of
  // 27 Sep): the preview's board has none; the flags live on Conversation.
  it('keeps the board without a New or Now 10+ flag: those live on Conversation', () => {
    for (const mode of MODES) {
      const board = read(overviewThemes.render(ossurFrontFixture(), mode, ctx))
      expect(board, mode).not.toMatch(/\bNew\b|Now 10\+|none in Aug/)
    }
  })

  it('says "No subjects named yet" in one line, and promises no update', () => {
    expect(text).toContain('No subjects named yet')
    expect(text).not.toContain('from the 6 Dec update')
    expect(text).toContain('are not read for this workspace yet')
  })

  it('draws the change block in one column: no next pair and no strip beside the refusal (deploy 2 review)', () => {
    const markup = render(FRONT_PAGE_BLOCKS.find((b) => b.key === 'overview.change')!.render(ossurFrontFixture(), 'app', ctx))
    expect(markup).not.toContain('xl:grid-cols-2')
    expect(read(FRONT_PAGE_BLOCKS.find((b) => b.key === 'overview.change')!.render(ossurFrontFixture(), 'app', ctx))).toContain('What changed, and what is ours')
    // Sealand's, with a next pair and its strip, keeps the two columns.
    expect(render(overviewChangeRender())).toContain('xl:grid-cols-2')
  })
})

describe('a stored copy from before WP1.6 renders as it was sent', () => {
  it('prints the Phase 1 blocks, under their Phase 1 titles', () => {
    const t = renderText(overviewSentence.render(overviewFixture(), 'app', ctx))
    expect(t).toContain('In one sentence')
    expect(t).not.toContain('The month')
  })
})
