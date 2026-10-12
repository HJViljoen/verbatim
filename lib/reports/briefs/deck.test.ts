import { describe, expect, it } from 'vitest'

import { briefFixture, finding, item, quote } from '../../../components/briefs/fixture'
import { PRINT_UNDRAWN_SECTIONS, UNDRAWN_SECTIONS, printsSection } from './canvas'
import {
  BODY_HEIGHT, chipRows, contentsOf, deckPages, findingPlan, fitItems, footnoteOf, heightOf, ideasArgued, inShortSizes, linesOf, pairColumn, productPhrases,
  quoteCite, subtitleOf, tagLine, writtenOn,
} from './deck'
import type { BriefRole, BriefSection, MonthlyBriefData } from './types'

// The deck's pages (pure): the canvas's page set and order for each role, the
// companions that share a sheet, the canvas's counts, the estimate that fits a
// page, a finding's fit, and the code-written lines (a quote's cite, the
// subtitles, the footnote). The pages themselves are
// components/briefs/brief-deck.test.tsx.

const eyebrows = (role: BriefRole, d: MonthlyBriefData = briefFixture(role)) => deckPages(d).map((p) => p.eyebrow)

describe('the canvas\'s page set, in its order', () => {
  it('Sales: cover, In short, the finding, Who is buying and its continuation, What stops them, What tips them, the rivals, Language', () => {
    expect(eyebrows('sales')).toEqual(['', 'In short', 'The finding', 'Who is buying', 'Who is buying, continued', 'What stops them', 'What tips them into buying', 'Who buyers compare you with', 'Language to handle with care'])
  })
  it('Marketing: cover, In short, two findings, Believes and doubts, In its own words, Says and hears, How rivals are heard', () => {
    expect(eyebrows('marketing')).toEqual(['', 'In short', 'Finding 1 of 2', 'Finding 2 of 2', 'Believes and doubts', 'In its own words', 'Says and hears', 'How rivals are heard'])
  })
  it('Content: cover, In short, the finding, the questions, hooks and formats, what viewers come for, what they want shown, the confusion', () => {
    expect(eyebrows('content')).toEqual(['', 'In short', 'The finding', 'The questions people ask', 'Hooks and formats', 'What viewers come for', 'What people want shown', 'Where the confusion starts'])
  })
  it('Leadership: where the market and the company stand, then the finding, what buyers weigh, the risks, what holds so far', () => {
    expect(eyebrows('leadership')).toEqual(['', 'In short', 'Where the market stands', 'Where Acme stands', 'The finding', 'What buyers weigh', 'The risks', 'What holds so far'])
  })

  it('Leadership\'s finding follows where the market stands when the company\'s standing does not print', () => {
    const d = briefFixture('leadership')
    d.sections = d.sections.filter((s) => s.key !== 'leadership.shares')
    expect(eyebrows('leadership', d)).toEqual(['', 'In short', 'Where the market stands', 'The finding', 'What buyers weigh', 'The risks', 'What holds so far'])
    d.sections = d.sections.filter((s) => s.key !== 'leadership.market')
    expect(eyebrows('leadership', d).slice(0, 3)).toEqual(['', 'In short', 'The finding'])
  })

  it('numbers every page once, in order', () => {
    const pages = deckPages(briefFixture('sales'))
    expect(pages.map((p) => p.n)).toEqual(pages.map((_p, i) => i + 1))
  })

  it('prints what they want settled first beside what stops them, and the questions for the business under the risks, never on pages of their own', () => {
    const sales = deckPages(briefFixture('sales'))
    const stops = sales.find((p) => p.body.kind === 'section' && p.body.section.key === 'sales.stops')!
    expect(stops.body.kind === 'section' && stops.body.companion?.key).toBe('sales.settle')
    expect(sales.some((p) => p.body.kind === 'section' && p.body.section.key === 'sales.settle')).toBe(false)
    const risks = deckPages(briefFixture('leadership')).find((p) => p.body.kind === 'section' && p.body.section.key === 'leadership.risks')!
    expect(risks.body.kind === 'section' && risks.body.companion?.key).toBe('leadership.decisions')
  })

  it('a section the canvas draws no page for is stored and never printed, behind the one switch', () => {
    expect(PRINT_UNDRAWN_SECTIONS).toBe(false)
    expect(UNDRAWN_SECTIONS).toEqual(['sales.deciders', 'marketing.recall', 'content.borrow'])
    for (const k of UNDRAWN_SECTIONS) expect(printsSection(k)).toBe(false)
    for (const role of ['sales', 'marketing', 'content'] as BriefRole[]) {
      const d = briefFixture(role)
      expect(d.sections.some((s) => UNDRAWN_SECTIONS.includes(s.key))).toBe(true)
      expect(deckPages(d).some((p) => p.body.kind === 'section' && UNDRAWN_SECTIONS.includes(p.body.section.key))).toBe(false)
    }
  })

  it('the contents use the canvas\'s short names: a finding\'s own, the sections\', and the one continuation', () => {
    expect(contentsOf(deckPages(briefFixture('sales'))).map((t) => t.title)).toEqual([
      'The route to buy', 'Who is buying', 'Who is buying, continued', 'What stops them', 'What tips them into buying', 'Who buyers compare you with', 'Language to handle with care',
    ])
    expect(contentsOf(deckPages(briefFixture('marketing'))).map((t) => t.title)).toEqual([
      'Proof in wear and origin', 'Community work, heard back', 'What the market believes and doubts', 'In its own words', 'What Acme says, and what comes back', 'How rivals are heard',
    ])
    expect(contentsOf(deckPages(briefFixture('leadership'))).map((t) => t.title)).toEqual([
      'Where the market stands', 'Where Acme stands against its rivals', 'Rivals own concrete jobs', 'What buyers weigh, and what makes them switch', 'The risks, in business terms', 'What holds so far',
    ])
    // A finding with no short name is listed by its headline.
    const d = briefFixture('content')
    d.findings = [{ ...d.findings[0], short: undefined }]
    expect(contentsOf(deckPages(d))[0].title).toBe('A distinctive shape needs use proof before it feels practical')
  })
})

describe('the canvas\'s counts: what does not fit stays in the stored brief', () => {
  const page = (d: MonthlyBriefData, key: BriefSection['key']) => deckPages(d).filter((p) => p.body.kind === 'section' && p.body.section.key === key)
  const shown = (d: MonthlyBriefData, key: BriefSection['key']) => page(d, key).flatMap((p) => (p.body.kind === 'section' ? p.body.section.groups.flatMap((g) => g.items) : []))

  it('two buyers a page, the page and its one continuation, never a third', () => {
    const d = briefFixture('sales')
    const buyers = d.sections.find((s) => s.key === 'sales.buyers')!
    buyers.groups[0].items = [...buyers.groups[0].items, ...buyers.groups[0].items.map((i) => ({ ...i }))]
    expect(page(d, 'sales.buyers')).toHaveLength(2)
    expect(shown(d, 'sales.buyers')).toHaveLength(4)
  })

  it('five objections, three rivals, five words to handle with care, eight questions', () => {
    const d = briefFixture('sales')
    const many = (key: BriefSection['key'], n: number) => {
      const s = d.sections.find((x) => x.key === key)!
      s.groups[0].items = Array.from({ length: n }, (_v, k) => ({ ...s.groups[0].items[0], title: `${s.groups[0].items[0].title} ${k}` }))
    }
    many('sales.stops', 8)
    many('sales.rivals', 5)
    many('sales.care', 9)
    expect(shown(d, 'sales.stops').length).toBeLessThanOrEqual(5)
    expect(shown(d, 'sales.rivals')).toHaveLength(3)
    expect(shown(d, 'sales.care').length).toBeLessThanOrEqual(5)
    expect(deckPages(d).filter((p) => p.eyebrow.includes('continued'))).toHaveLength(1)
    const c = briefFixture('content')
    const q = c.sections.find((s) => s.key === 'content.questions')!
    q.groups[0].items = [...q.groups[0].items, ...q.groups[0].items.map((i) => ({ ...i }))]
    expect(shown(c, 'content.questions').length).toBeLessThanOrEqual(8)
  })

  it('the subjects past the market page\'s room, with their level, are "Also following"; one with no level is left out, never a bare name', () => {
    const d = briefFixture('leadership')
    const market = page(d, 'leadership.market')[0]
    expect(market.body.kind === 'section' && market.body.section.also).toBe('Also following: Repair & warranty 3%.')
    const m = d.sections.find((s) => s.key === 'leadership.market')!
    m.groups[0].items.push(item('Bare', 'People mention it.', { measure: undefined }))
    const again = page(d, 'leadership.market')[0]
    expect(again.body.kind === 'section' && again.body.section.also).toBe('Also following: Repair & warranty 3%.')
  })

  it('a trigger moment\'s voice prints with it, three at most', () => {
    const d = briefFixture('sales')
    const quoted = shown(d, 'sales.triggers').filter((i) => i.quote)
    expect(quoted.map((i) => i.title)).toEqual(['Back to school', 'Money in hand', 'The design that lands'])
  })
})

describe('the estimate', () => {
  it('counts lines by the column\'s width and the type\'s size, words wrapping whole', () => {
    expect(linesOf('x'.repeat(40), 1000, 16)).toBe(1)
    expect(linesOf('x'.repeat(400), 300, 16)).toBeGreaterThan(9)
    expect(heightOf('x'.repeat(10), 1000, 20, 1.5)).toBe(30)
    expect(heightOf('', 1000, 20, 1.5)).toBe(0)
    // The italic of a quote runs narrower than the sans, a title wider.
    expect(linesOf('x'.repeat(300), 400, 17, 'italic')).toBeLessThanOrEqual(linesOf('x'.repeat(300), 400, 17))
    expect(linesOf('x'.repeat(300), 400, 17, 'bold')).toBeGreaterThanOrEqual(linesOf('x'.repeat(300), 400, 17))
  })

  it('takes items while they fit, always the first, never past the canvas\'s count', () => {
    expect(fitItems([100, 100, 100, 100], (x) => x, 250)).toEqual([100, 100])
    expect(fitItems([900], (x) => x, 100)).toEqual([900])
    expect(fitItems([10, 10, 10], (x) => x, 1000, 2)).toEqual([10, 10])
  })

  it('packs chips into rows by their width', () => {
    expect(chipRows([], 600)).toBe(0)
    expect(chipRows(['pack', 'bag'], 600)).toBe(1)
    expect(chipRows(Array.from({ length: 12 }, () => 'a long chip label'), 600)).toBeGreaterThan(2)
  })
})

describe('a finding\'s page', () => {
  it('a short finding keeps the canvas\'s type, its practice lines and its voice beside the reading', () => {
    expect(findingPlan(finding('Short headline'))).toEqual({ headline: 31, saw: 16, means: 17, practice: 2, quotes: ['right'] })
  })

  it('a long one steps its type down, and a voice that fits nowhere does not print: never a second page', () => {
    const long = 'Buyers ask about straps, pockets, laptop sleeves, rain covers, zips, warranty terms and the exact size of the main compartment before they order. '
    const f = finding('A long headline that runs well past seventy characters, as a writer may make one', {
      saw: [long.repeat(3).slice(0, 300), long.repeat(3).slice(0, 300), long.repeat(3).slice(0, 300)],
      means: long.repeat(3).slice(0, 450),
      practice: [long.slice(0, 200), long.slice(0, 200)],
      quotes: [quote(long.repeat(2).slice(0, 280)), quote(long.repeat(2).slice(0, 280), { platform: 'youtube' })],
    })
    const plan = findingPlan(f)
    expect(plan.headline).toBe(28)
    expect(plan.saw).toBeLessThan(16)
    expect(plan.quotes).toContain('none')
    const d = { ...briefFixture('sales'), findings: [f] }
    expect(deckPages(d).filter((p) => p.body.kind === 'finding')).toHaveLength(1)
  })

  it('Leadership\'s brand chips take their room under both columns', () => {
    const plain = briefFixture('leadership').findings[0]
    expect(findingPlan({ ...plain, heardFor: undefined }).quotes).toEqual(['right'])
    expect(findingPlan(plain).quotes).toEqual(['right'])
  })
})

describe('In short\'s type', () => {
  it('sets the summary as large as fits beside the contents', () => {
    expect(inShortSizes('A short summary.', ['One', 'Two']).summarySize).toBe(22)
    const long = inShortSizes('x '.repeat(350), Array.from({ length: 12 }, (_v, k) => `A section title that is long enough to wrap ${k}`))
    expect(long.summarySize).toBeLessThan(22)
    expect(long.tocSize).toBe(13)
    expect(BODY_HEIGHT).toBe(584)
  })
})

describe('the lines code writes', () => {
  it('cites a quote as the canvas does: platform and day, the brand where it is about one, own posts first, the translation last', () => {
    expect(quoteCite({ platform: 'youtube', date: '2026-09-23', about: 'market', ownPost: false, lang: 'ja', english: 'That colour is only for this season, right?' }, 'Acme')).toBe('YouTube · 23 Sep · translated from Japanese')
    expect(quoteCite({ platform: 'reddit', date: '2026-09-23', about: 'market', ownPost: false }, 'Acme')).toBe('Reddit · 23 Sep')
    expect(quoteCite({ platform: 'instagram', date: '2026-09-18', about: 'client', ownPost: true }, 'Sealand')).toBe('On a Sealand post · Instagram · 18 Sep')
    expect(quoteCite({ platform: 'instagram', date: '2026-09-18', about: 'client', ownPost: true }, 'Össur')).toBe('On an Össur post · Instagram · 18 Sep')
    expect(quoteCite({ platform: 'reddit', date: '2026-09-21', about: 'rival:Ridgeline', ownPost: false }, 'Acme')).toBe('Reddit · 21 Sep · about Ridgeline')
    // Under a label that names the brand ("On Ridgeline"), the cite does not.
    expect(quoteCite({ platform: 'reddit', date: '2026-09-21', about: 'rival:Ridgeline', ownPost: false }, 'Acme', { labelled: true })).toBe('Reddit · 21 Sep')
  })

  it('says what kinds of people talk about the product and how many of them buy', () => {
    const d = briefFixture('sales')
    const buyers = d.sections.find((s) => s.key === 'sales.buyers')!
    expect(subtitleOf(buyers, d)).toBe("Four kinds of people talk about packs like Acme's. Three of them buy.")
    expect(subtitleOf({ ...buyers, groups: [{ items: buyers.groups[0].items.slice(0, 2) }] }, d)).toBe("Two kinds of people talk about packs like Acme's.")
    expect(subtitleOf({ ...buyers, groups: [{ items: buyers.groups[0].items.slice(0, 1) }] }, { ...d, noun: null })).toBe("One kind of person talks about products like Acme's.")
    expect(productPhrases('Sealand', 'bags')).toEqual({ plural: "bags like Sealand's", one: "a bag like Sealand's", the: 'the bag' })
  })

  it('names what is argued in another brief at the foot of the page, and on a risk card', () => {
    const s: BriefSection = { key: 'sales.stops', title: 'x', groups: [{ items: [item('A story that feels off', 'x', { tag: 'Argued in the Marketing brief' }), item('Price', 'y'), item('Wear', 'z', { tag: 'Also in the Content brief' })] }] }
    expect(footnoteOf(s)).toBe('A story that feels off is argued in full in the Marketing brief. Wear is also in the Content brief.')
    expect(footnoteOf({ ...s, key: 'leadership.risks' })).toBeNull()
    expect(tagLine('Argued in the Sales brief')).toBe('Argued in full in the Sales brief')
  })

  it('lists the month\'s ideas with where each is argued, this brief\'s last', () => {
    const ideas = ideasArgued(briefFixture('leadership'))
    expect(ideas.map((x) => (x.own ? 'this' : x.brief))).toEqual(['sales', 'marketing', 'marketing', 'content', 'this'])
  })

  it('keeps each group of a two-column page in its column', () => {
    expect(pairColumn('What it doubts')).toBe(1)
    expect(pairColumn('What loses them')).toBe(1)
    expect(pairColumn('What moves them')).toBe(1)
    expect(pairColumn('What it believes')).toBe(0)
    expect(pairColumn('What holds them')).toBe(0)
    expect(pairColumn('What earns a response')).toBe(0)
  })

  it('dates the footer by the day the brief was written', () => {
    expect(writtenOn('2026-10-05T08:00:00.000Z')).toBe('5 October 2026')
  })
})
