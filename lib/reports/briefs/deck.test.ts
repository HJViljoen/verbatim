import { describe, expect, it } from 'vitest'

import { briefFixture, finding, item, quote } from '../../../components/briefs/fixture'
import {
  BODY_HEIGHT, acrossPages, contentsOf, deckPages, fillByHeight, findingPlan, heightOf, inShortSizes, linesOf, pairColumn, planSection, quoteCite, quotePage,
  whoLineOf, whoText, writtenOn,
} from './deck'
import type { BriefSection } from './types'

// The deck's pages (pure): their order, the pairs that share a sheet, the
// estimate that paginates them, a finding's fit, and the code-written lines
// (who the talk was about, where a quote was heard). The pages themselves are
// components/briefs/brief-deck.test.tsx.

describe('the page order', () => {
  it('cover, In short, the findings, then the role\'s sections; what they want settled first beside what stops them', () => {
    const pages = deckPages(briefFixture('sales'))
    expect(pages.map((p) => p.body.kind)).toEqual(['cover', 'in_short', 'finding', 'section', 'section', 'section', 'section', 'section', 'section'])
    const stops = pages.find((p) => p.body.kind === 'section' && p.body.section.key === 'sales.stops')!
    expect(stops.body.kind === 'section' && stops.body.companion?.key).toBe('sales.settle')
    expect(pages.some((p) => p.body.kind === 'section' && p.body.section.key === 'sales.settle')).toBe(false)
    expect(pages.map((p) => p.n)).toEqual(pages.map((_p, i) => i + 1))
  })

  it('Leadership opens on where the market and the company stand, then its finding (the design\'s order)', () => {
    const keys = deckPages(briefFixture('leadership')).map((p) => (p.body.kind === 'section' ? p.body.section.key : p.body.kind))
    expect(keys).toEqual(['cover', 'in_short', 'leadership.market', 'leadership.shares', 'finding', 'leadership.weigh', 'leadership.risks'])
  })

  it('the contents name each finding and section once, on its first page', () => {
    const pages = deckPages(briefFixture('content'))
    const toc = contentsOf(pages)
    expect(toc[0]).toEqual({ n: 3, title: 'The route to buy decides whether interest becomes an order' })
    expect(new Set(toc.map((t) => t.title)).size).toBe(toc.length)
  })

  it('what is settled first takes its own page where it would not fit beside what stops them', () => {
    const d = briefFixture('sales')
    const settle = d.sections.find((s) => s.key === 'sales.settle')!
    settle.groups[0].items = Array.from({ length: 6 }, () => item('', 'How hard is it to put on and take off, and what is it like with clothing, showering, shoes and moving around the home on a long working day?', { tag: 'Argued in the Content brief' }))
    const pages = deckPages(d)
    expect(pages.some((p) => p.body.kind === 'section' && p.body.section.key === 'sales.settle')).toBe(true)
  })
})

describe('the estimate', () => {
  it('counts lines by the column\'s width and the type\'s size, words wrapping whole', () => {
    expect(linesOf('x'.repeat(40), 1000, 16)).toBe(1)
    expect(linesOf('x'.repeat(400), 300, 16)).toBeGreaterThan(9)
    expect(heightOf('x'.repeat(10), 1000, 20, 1.5)).toBe(30)
    // The italic of a quote runs narrower than the sans.
    expect(linesOf('x'.repeat(300), 400, 17, 'italic')).toBeLessThanOrEqual(linesOf('x'.repeat(300), 400, 17))
  })

  it('fills pages by height, the first with less room, and always takes one', () => {
    expect(fillByHeight([100, 100, 100, 100], (x) => x, 150, 250)).toEqual([[100], [100, 100], [100]])
    expect(fillByHeight([900], (x) => x, 100)).toEqual([[900]])
  })

  it('sets as many across as fit, in at least the design\'s slots, widening one too tall for its slot', () => {
    // An item is taller in a narrower slot: more slots, taller.
    const h = (x: number, slots: number) => (x * slots) / 3
    expect(acrossPages([100, 100, 100, 100], 4, 3, h, 120)).toEqual([{ items: [100, 100, 100], slots: 3 }, { items: [100], slots: 3 }])
    expect(acrossPages([90, 90], 4, 3, h, 400)).toEqual([{ items: [90, 90], slots: 3 }])
    expect(acrossPages([500], 4, 3, h, 200)).toEqual([{ items: [500], slots: 1 }])
  })

  it('puts a section\'s voice on the first page with room for it, else where there is most', () => {
    expect(quotePage([200, 100], 150, 400)).toBe(0)
    expect(quotePage([300, 100], 150, 400)).toBe(1)
    // Room on neither: the page with the most.
    expect(quotePage([350, 300], 300, 400)).toBe(1)
  })

  it('cuts a long section into a page and its continuation, the lead and the voice on the first only', () => {
    const s: BriefSection = { key: 'sales.stops', title: 'What stops them', lead: 'Buyers hesitate.', quote: quote('Too dear for what it is.'), groups: [{ items: Array.from({ length: 10 }, (_, k) => item(`Objection ${k}`, 'Shoppers ask whether the pack is worth paying more for than one from a supermarket, and whether the straps hold up after a year of daily use.')) }] }
    const plan = planSection(s)
    expect(plan.slices.length).toBeGreaterThan(1)
    expect(plan.slices[0].section.lead).toBe('Buyers hesitate.')
    expect(plan.slices[1].section.lead).toBeUndefined()
    expect(plan.slices[1].section.quote).toBeUndefined()
    expect(plan.slices[1].continued).toBe(true)
    expect(plan.slices.flatMap((x) => x.section.groups.flatMap((g) => g.items)).length).toBe(10)
  })

  it('keeps a group\'s own lines with its last item, and the two columns apart', () => {
    expect(pairColumn('What it doubts')).toBe(1)
    expect(pairColumn('Criticised for')).toBe(1)
    expect(pairColumn('What moves them')).toBe(1)
    expect(pairColumn('What it believes')).toBe(0)
    expect(pairColumn('What keeps them')).toBe(0)
  })
})

describe('a finding\'s page', () => {
  it('a short finding keeps the design\'s type and both voices beside the reading', () => {
    expect(findingPlan(finding('Short headline'))).toEqual({ headline: 31, saw: 16, practice: 'left', means: 17, quotes: ['right', 'right'] })
  })

  it('a long one steps its type down and sends a voice that fits nowhere to its second page, never off the sheet', () => {
    const long = 'Buyers ask about straps, pockets, laptop sleeves, rain covers, zips, warranty terms and the exact size of the main compartment before they order. '
    // Every field at its writer's cap: what was heard 900, the reading 450,
    // the practice lines 200 each, the quotes 280.
    const f = finding('A long headline that runs well past seventy characters, as a writer may make one', {
      saw: [long.repeat(3).slice(0, 300), long.repeat(3).slice(0, 300), long.repeat(3).slice(0, 300)],
      means: long.repeat(3).slice(0, 450),
      practice: [long.slice(0, 200), long.slice(0, 200)],
      quotes: [quote(long.repeat(2).slice(0, 280)), quote(long.repeat(2).slice(0, 280), { platform: 'youtube' })],
    })
    const plan = findingPlan(f)
    expect(plan.headline).toBe(28)
    expect(plan.saw).toBeLessThan(16)
    expect(plan.quotes).toContain('next')
    const d = { ...briefFixture('sales'), findings: [f] }
    const pages = deckPages(d).filter((p) => p.body.kind === 'finding')
    expect(pages.map((p) => p.body.kind === 'finding' && p.body.part)).toEqual([1, 2])
    expect(pages[1].toc).toBeNull()
  })
})

describe('In short\'s type', () => {
  it('sets the summary as large as fits beside the contents', () => {
    expect(inShortSizes('A short summary.', ['One', 'Two']).summarySize).toBe(22)
    const long = inShortSizes('x '.repeat(350), Array.from({ length: 12 }, (_, k) => `A section title that is long enough to wrap ${k}`))
    expect(long.summarySize).toBeLessThan(22)
    expect(long.tocSize).toBe(13)
    expect(BODY_HEIGHT).toBe(584)
  })
})

describe('the lines code writes', () => {
  it('says what an item rests on and whose talk it was, most first', () => {
    const w = whoLineOf(14, [{ about: 'rival:Ridgeline', videos: 3 }, { about: 'market', videos: 9 }, { about: 'client', videos: 2 }], 'Acme', 'packs')
    expect(whoText(w)).toBe('14 videos · other packs in your market 9 · about Ridgeline 3 · about Acme 2')
    expect(whoText(whoLineOf(3, [{ about: 'market', videos: 3 }], 'Acme', null))).toBe('3 videos · others in your market')
    expect(whoLineOf(0, [], 'Acme', null)).toBeNull()
  })

  it('cites a quote by platform, day and whose talk it was, and says when it was translated', () => {
    expect(quoteCite({ platform: 'youtube', date: '2026-09-23', about: 'market', ownPost: false, lang: 'ja', english: 'That colour is only for this season, right?' }, 'Acme', 'packs')).toBe('YouTube · 23 Sep · other packs in your market · translated from Japanese')
    expect(quoteCite({ platform: 'instagram', date: '2026-09-18', about: 'client', ownPost: true }, 'Acme', null)).toBe("Instagram · 18 Sep · on Acme's own posts")
  })

  it('dates the footer by the day the brief was written', () => {
    expect(writtenOn('2026-10-05T08:00:00.000Z')).toBe('5 October 2026')
  })
})
