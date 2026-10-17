import { describe, expect, it } from 'vitest'
import { markupText, render, renderText } from '@/lib/test/render'
import { assertCopyContract, copyNodes } from '@/lib/test/copy-contract'
import { fixtureSubjectId, marketFixture, marketSubjectFixture, type FixtureOptions } from '@/lib/pages/v2/market-fixture'
import { OSSUR_SUBJECT_READS } from '@/lib/pages/v2/market-reads-fixture'
import { FAILED_EXPLAINED, SUBJECT_NOT_MEASURED } from '@/lib/subjects/calibration-state'
import type { MarketData } from '@/lib/pages/v2/market'
import { SubjectCardsView } from './analysis'
import { BACK_TO_MARKET, MarketSubjectPage, SUBJECT_MISSING } from './pages'
import { SubjectPageBody, subjectChangeGap, subjectNumbersLine, SUBJECT_NUMBERS_HELD, SUBJECT_WEEK_UNREAD } from './subject-page'

// A TRACKED SUBJECT'S PAGE (depth as pages, 17 Oct; F2-Market-Subject, its
// switcher and its phone board): from the page fixture through the page's own
// builders (`buildSubjectPanel`, `subjectDetailOf`), against the copy
// contract, decision 1 (a week figure beside its month) and ruling U6 (no
// figure, line or chip count on a subject whose check has not passed).

const FIT = marketSubjectFixture('fit')
const fit = OSSUR_SUBJECT_READS.find((r) => r.name === 'Fit & comfort')!
const page = (d: MarketData) => <MarketSubjectPage data={d} />
const body = (d: MarketData) => <SubjectPageBody page={d.subjectPage!} data={d} />

describe('a ready subject, this week', () => {
  const text = renderText(page(FIT))
  const html = render(page(FIT))

  it('its bar: "Market / Fit & comfort", the week beside its month, the period switch', () => {
    expect(text).toMatch(/^Market Market \/ Fit & comfort This week This month Over time 5 to 11 October · in 82 of 241 videos this week · 108 of 318 in October so far/)
    expect(html).toMatch(/<a (?=[^>]*aria-current="page")(?=[^>]*href="\/dashboard\/market\/subjects\/subj-fit")[^>]*>This week</)
    expect(html).toContain('href="/dashboard/market/subjects/subj-fit?period=month"')
  })

  it('its read first: the headline, what people are saying beside what it means, stored prose', () => {
    expect(text).toContain(`Our read · October so far ${fit.headline} What people are saying ${fit.saying.join(' ')} What it means ${fit.means} The numbers`)
    expect(html).toMatch(/<h2 id="subject-head" data-copy="stored" data-slot="week_read" class="[^"]*text-\[28px\]/)
  })

  it('the numbers: the four tiles, the week beside the month on one base, the change from its Verdict alone', () => {
    // The board's two shares, one base (17 Oct): 82 of 241 this week beside
    // 108 of 318 in the month, never the week's comment base (40) beside the
    // month's level.
    expect(text).toContain('The numbers This week’s 82 videos, beside October so far 34% 82 of 241 videos this week no clear change · +0.9 pts October so far against September, 33% 34% 108 of 318 videos in October so far 4 conversations inside it this week')
    expect(text).toContain('The parts below read the videos where a comment was about it: 40 of these 82 this week, and 64 of these 108 in October so far.')
    // The change is the one badge's, inside a verdict node.
    expect(html).toMatch(/data-copy="verdict"[^>]*><span class="text-xs font-medium text-muted-foreground"[^>]*>no clear change/)
  })

  it('week by week (three bare counts) and month by month: three months at every width, as the board draws them', () => {
    expect(text).toContain('Week by week · videos 21 33 40 21 Sep 28 Sep 5 Oct Month by month · share of your market’s videos 32% August 194 of 612 33% September 277 of 839 34% October so far · 108 of 318 32% August')
    expect(text).not.toContain('July')
    // The conversation's page keeps its four (`MARKET_PANEL_MONTHS`); a subject's three.
    expect(FIT.subjectPage!.panel.bars.map((b) => b.label)).toEqual(['August', 'September', 'October'])
  })

  it('prints the month\'s share one way: the tile\'s whole percent is the bar\'s (the fresh check, 17 Oct)', () => {
    expect(text).toContain('34% 108 of 318 videos in October so far')
    expect(text).toMatch(/34% October so far · 108 of 318/)
    expect(text).not.toMatch(/\d\.\d%/)
  })

  it('who is saying it, what people did and where, each "of N"; three comments; the Agent', () => {
    expect(text).toContain('Who’s saying it · of 64 in October so far New amputees in their first year 16 of 64 Caregivers and family 8 of 64 Active and athletic users 4 of 64 Each opens in Voices')
    expect(text).toContain('What people did · of 64 in October so far Complained about something 48 Asked a question 16')
    expect(text).toContain('Where · of 64 in October so far This week October so far TikTok 20 32 of 64 Instagram 10 16 of 64 YouTube 10 16 of 64')
    expect(html.match(/data-copy="quote"/g)).toHaveLength(3)
    expect(text).toContain('Ask the Agent about Fit & comfort')
    expect(html).toContain('href="/dashboard/voices?group=new-amputees#group-panel"')
  })

  it('the conversations inside it: the biggest three as pages, then all of them on the table', () => {
    expect(text).toContain('Conversations inside it The biggest this week. Each opens as its own page. Conversation About This week October so far How long a liner lasts → Össur 4 · others 19 23 35 Sweat under the liner →')
    expect(html).toContain('href="/dashboard/market?in=subj-fit#conversations"')
    expect(text).toContain('All 4 conversations in Fit & comfort →')
    expect(html.match(/<tbody>[\s\S]*?<\/tbody>/)![0].match(/<tr /g)).toHaveLength(3)
  })

  it('keeps the copy contract', () => {
    assertCopyContract(page(FIT))
  })
})

describe('a ready subject whose week could not be read on the level\'s base', () => {
  const d = marketSubjectFixture('fit', { subjectWeek: 'unread' })
  const text = renderText(page(d))
  const html = render(page(d))

  it('the week tile keeps its frame and says so in one line; no figure from another base anywhere', () => {
    expect(text).toContain(`The numbers October so far ${SUBJECT_WEEK_UNREAD} no clear change · +0.9 pts`)
    expect(html).toContain('data-tile-gap=""')
    expect(text).not.toMatch(/of 241 videos this week/)
    // The bar keeps the week's dates and the month's level, and no week figure.
    expect(text).toMatch(/^Market Market \/ Fit & comfort This week This month Over time 5 to 11 October · 108 of 318 in October so far This week/)
    // The one-base line names the blocks' week without a tile to set it against.
    expect(text).toContain('The parts below read the videos where a comment was about it: 40 this week, and 64 of these 108 in October so far.')
    assertCopyContract(page(d))
  })
})

describe('a ready subject with no change to print against last month (17 Oct)', () => {
  // Sealand's October: its pair with September is refused (our September
  // search change), so the standing facts carry no verdict and the badge drew
  // nothing; the tile printed its label over an empty slot. It now says so in
  // its frame, in the Dashboard week tile's words, and names no reason (the
  // one condition, plan §0a).
  const d = marketSubjectFixture('fit', { subjects: 'one_month' })
  const text = renderText(page(d))
  const html = render(page(d))

  it('the change tile keeps its frame and says so in one line; the other tiles as they were', () => {
    expect(d.subjectPage!.panel.verdict).toBeNull()
    expect(subjectChangeGap('September')).toBe('No comparison with September yet.')
    expect(text).toContain('The numbers This week’s 82 videos, beside October so far 34% 82 of 241 videos this week No comparison with September yet. 34% 108 of 318 videos in October so far')
    expect(html.match(/data-tile-gap=""/g)).toHaveLength(1)
    expect(text).not.toContain('October so far against September')
    assertCopyContract(page(d))
  })

  it('a refused verdict: the same line, no reason and no earlier figure; never "not read as a change"', () => {
    const fit = marketSubjectFixture('fit')
    const v = fit.subjectPage!.panel.verdict!
    const refused: MarketData = { ...fit, subjectPage: { ...fit.subjectPage!, prevPct: null, panel: { ...fit.subjectPage!.panel, verdict: { ...v, changePts: null, bandPts: null, state: 'refused', refusedReason: 'tracking_change', pair: { mode: 'refuse', cause: 'searches', changeMonth: '2026-09-01', checkWith: null } } } } }
    const t = renderText(page(refused))
    expect(t).toContain('82 of 241 videos this week No comparison with September yet. 34% 108 of 318')
    expect(t).not.toMatch(/not read as a change|refused|not compared|against September, 33%/)
  })

  it('a change that prints keeps its badge over its label', () => {
    expect(renderText(page(FIT))).toContain('no clear change · +0.9 pts October so far against September, 33%')
    expect(render(page(FIT))).not.toContain('data-tile-gap')
  })
})

describe('a ready subject, this month', () => {
  const d = marketSubjectFixture('cost', { period: 'month', subjectReads: 'v2' })
  const text = renderText(page(d))

  it('three tiles, no week figure and no week by week; its month line; a read stored before headlines', () => {
    expect(text).toMatch(/^Market Market \/ Cost & access This week This month Over time October so far · in 70 of 318 videos/)
    expect(text).toContain('Our read · October so far What people are saying People describe insurance refusals')
    expect(render(page(d))).not.toContain('id="subject-head"')
    expect(text).toContain('The numbers October so far ▲ 7 pts October so far against September, 15% 22% 70 of 318 videos in October so far 3 conversations inside it in October so far')
    expect(text).not.toContain('Week by week')
    expect(text).not.toContain('this week')
    assertCopyContract(page(d))
  })
})

describe('every state keeps its frame', () => {
  it('thin: code\'s one line in the read\'s card, the numbers as they are', () => {
    const d = marketSubjectFixture('choosing')
    const thin = OSSUR_SUBJECT_READS.find((r) => r.status === 'thin')!
    expect(renderText(body(d))).toMatch(new RegExp(`^Our read · October so far ${thin.saying[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} The numbers`))
    expect(render(body(d))).toContain('data-subject-read="thin"')
    assertCopyContract(page(d))
  })

  it('no read this month: its line; with the tenant\'s reads switched off, the week read\'s sentence under it', () => {
    expect(renderText(body(marketSubjectFixture('look', { subjects: 'states' })))).toMatch(/^Our read · October so far No read of Look & style in October yet\. The numbers/)
    expect(renderText(body(marketSubjectFixture('cost', { subjectReadsOff: true })))).toMatch(/^Our read · October so far No read of Cost & access in October yet\. People ask how to get a knee paid for, and what to do when a claim is refused\. The numbers/)
  })

  it('not measured yet (U6): its name, why, and the conversations inside it by name; no figure, line or chip count', () => {
    const d = marketSubjectFixture('cost', { flagged: false, noNew: true, subjects: 'provisional', brands: 'not_counted', weeks: 'insufficient', noGroups: true })
    const text = renderText(page(d))
    expect(text).toBe(`Market Market / Cost & access This week This month Over time 5 to 11 October This week This month Over time Our read · October so far ${SUBJECT_NOT_MEASURED} The numbers ${SUBJECT_NOT_MEASURED} Inside it Each opens as its own page. Insurance refusals for powered knees Paying out of pocket Medical aid and liners Ask the Agent about Cost & access`)
    expect(copyNodes(render(page(d))).filter((n) => n.kind === 'figure' || n.kind === 'level' || n.kind === 'verdict' || n.kind === 'quote')).toEqual([])
    assertCopyContract(page(d))
  })

  it('failed: why, said once on its page, then Inside it as an open one; no figure', () => {
    const d = marketSubjectFixture('community', { subjects: 'tracked' })
    const text = renderText(page(d))
    expect(text).toContain(`Our read · October so far ${FAILED_EXPLAINED} The numbers ${SUBJECT_NUMBERS_HELD} Inside it Each opens as its own page. Running-blade stories First steps after amputation Support from other amputees`)
    expect(text.split(FAILED_EXPLAINED).length - 1).toBe(1)
    expect(copyNodes(render(page(d))).filter((n) => n.kind === 'figure' || n.kind === 'level')).toEqual([])
  })

  it('a ready subject the month has no reading for yet: the numbers say so, never "until its check passes" (17 Oct)', () => {
    const d = marketSubjectFixture('fit', { subjects: 'unread' })
    expect(renderText(body(d))).toContain('What it means')
    expect(renderText(body(d))).toMatch(/ The numbers No reading in October so far yet\. Inside it /)
    expect(render(body(d))).toContain('data-numbers-gap="unread"')
    expect(renderText(body(d))).not.toContain(SUBJECT_NUMBERS_HELD)
  })

  it('the numbers\' line names each state\'s own reason: unread, not measured, failed', () => {
    expect(subjectNumbersLine({ state: 'unread', monthText: 'October so far' })).toBe('No reading in October so far yet.')
    expect(subjectNumbersLine({ state: 'unread', monthText: 'October' })).toBe('No reading in October yet.')
    expect(subjectNumbersLine({ state: 'provisional', monthText: 'October so far' })).toBe(SUBJECT_NOT_MEASURED)
    expect(subjectNumbersLine({ state: 'failed', monthText: 'October so far' })).toBe(SUBJECT_NUMBERS_HELD)
    // Each on its page, in the numbers card's frame.
    expect(render(body(marketSubjectFixture('function', { subjects: 'states' })))).toMatch(/data-numbers-gap="provisional"[^>]*><p[^>]*>Not measured yet<\/p>/)
    expect(render(body(marketSubjectFixture('community', { subjects: 'states' })))).toMatch(new RegExp(`data-numbers-gap="failed"[^>]*><p[^>]*>${SUBJECT_NUMBERS_HELD}</p>`))
  })

  it('an id Market does not follow: one calm line, and the way back', () => {
    const d = marketSubjectFixture('nope')
    expect(renderText(page(d))).toBe(`Market ${SUBJECT_MISSING} ${BACK_TO_MARKET} →`)
    expect(render(page(d))).toContain('href="/dashboard/market"')
  })

  it('before the first update: the top page\'s own line', () => {
    expect(renderText(page(null as never))).toBe('Market Your market’s first week will appear here after the first update.')
  })
})

describe('a subject\'s read prints on its page exactly where its card prints it (17 Oct)', () => {
  // ONE RULE (`subjectOwnRead`): the card on the top page prints a read if and
  // only if its page prints the same read, in every state. Until 17 Oct the
  // page printed a read only where the subject had a level, so Össur's six
  // (every check passed, none read in October yet) each had a read on its
  // card and "No reading in October so far yet" under its page's Our read.
  const CASES: [string, string, FixtureOptions][] = [
    ['ready, with a level', 'fit', {}],
    ['ready, no level this month', 'fit', { subjects: 'unread' }],
    ['thin', 'choosing', {}],
    ['thin, no level this month', 'choosing', { subjects: 'unread' }],
    ['a read stored before headlines', 'cost', { subjects: 'states' }],
    ['no read this month', 'look', { subjects: 'states' }],
    ['no read, no level this month', 'fit', { subjects: 'unread', subjectReads: 'none' }],
    ['not measured yet', 'function', { subjects: 'states' }],
    ['failed', 'community', { subjects: 'states' }],
    ['the tenant\'s reads switched off', 'fit', { subjectReadsOff: true }],
    ['reads off, no level this month', 'fit', { subjects: 'unread', subjectReadsOff: true }],
  ]
  const stored = (html: string) => copyNodes(html).filter((n) => n.kind === 'stored').map((n) => n.text)
  for (const [name, key, opts] of CASES) {
    it(name, () => {
      const card = marketFixture(opts).subjectCards!.find((c) => c.id === fixtureSubjectId(key))!
      const read = render(body(marketSubjectFixture(key, opts))).match(/<article id="subject-read"[\s\S]*?<\/article>/)![0]
      // The page's read card is in the card's state: written, thin, no read,
      // not measured or failed.
      expect(read.match(/data-subject-read="([a-z_]+)"/)?.[1] ?? 'read').toBe(card.state)
      const words = stored(render(<SubjectCardsView cards={[card]} />))
      if (card.state === 'read' || card.state === 'thin') {
        // The same read: every line the card prints, its page prints.
        expect(words.length).toBeGreaterThan(0)
        for (const w of words) expect(stored(read)).toContain(w)
      } else {
        // No read on either: the card's own line stands in its page's place.
        expect(words).toEqual([])
        expect(markupText(read)).toContain(card.note!)
      }
    })
  }

  it('Össur on 17 Oct: a ready subject read in no month yet prints its whole read, and no figure', () => {
    const d = marketSubjectFixture('fit', { subjects: 'unread' })
    const text = renderText(body(d))
    expect(text).toContain(`Our read · October so far ${fit.headline} What people are saying ${fit.saying.join(' ')} What it means ${fit.means} The numbers`)
    expect(copyNodes(render(page(d))).filter((n) => n.kind === 'figure' || n.kind === 'level' || n.kind === 'verdict')).toEqual([])
    assertCopyContract(page(d))
  })
})

describe('the switcher in its bar', () => {
  it('opens on the subject ticked, the ready ranked, the unready below a hairline in words', () => {
    const d = marketSubjectFixture('fit', { subjects: 'states' })
    const text = renderText(<MarketSubjectPage data={d} switcherOpen />)
    expect(text).toContain(`Your subjects Fit & comfort Cost & access Choosing the right device Little talk so far Look & style Community & encouragement ${SUBJECT_NOT_MEASURED} Function & movement ${SUBJECT_NOT_MEASURED}`)
    expect(render(<MarketSubjectPage data={d} switcherOpen />)).toContain(`href="/dashboard/market/subjects/${fixtureSubjectId('cost')}"`)
  })
})
