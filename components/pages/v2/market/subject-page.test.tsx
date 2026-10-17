import { describe, expect, it } from 'vitest'
import { markupText, render, renderText } from '@/lib/test/render'
import { assertCopyContract, copyNodes } from '@/lib/test/copy-contract'
import { fixtureId, fixtureSubjectId, marketFixture, marketSubjectFixture, type FixtureOptions } from '@/lib/pages/v2/market-fixture'
import { OSSUR_SUBJECT_READS } from '@/lib/pages/v2/market-reads-fixture'
import { FAILED_EXPLAINED, SUBJECT_NOT_MEASURED } from '@/lib/subjects/calibration-state'
import type { MarketData } from '@/lib/pages/v2/market'
import { SubjectCardsView } from './analysis'
import { BACK_TO_MARKET, MarketSubjectPage, SUBJECT_MISSING } from './pages'
import { insideNone, SubjectPageBody, subjectChangeGap, subjectNumbersLine, SUBJECT_NUMBERS_HELD, SUBJECT_READ_HELD, SUBJECT_WEEK_UNREAD } from './subject-page'

// A TRACKED SUBJECT'S PAGE, THE HUB (F3-Market-Subject, 17 Oct; the board
// with the read first): from the page fixture through the page's own
// builders (`buildSubjectPanel`, `subjectDetailOf`, `insideConvsOf`), in the
// board's order, against the copy contract, decision 1 (a week figure beside
// its month, three weeks three bare counts, the week a count and never a
// percent) and ruling U6 (no figure on a subject whose check has not passed).

const FIT = marketSubjectFixture('fit')
const fit = OSSUR_SUBJECT_READS.find((r) => r.name === 'Fit & comfort')!
const page = (d: MarketData) => <MarketSubjectPage data={d} />
const body = (d: MarketData) => <SubjectPageBody page={d.subjectPage!} data={d} />
const hubOf = (html: string) => html.match(/<article id="subject-hub"[\s\S]*?<\/article>/)![0]
const readOf = (html: string) => html.match(/<article id="subject-read"[\s\S]*?<\/article>/)![0]

describe('a ready subject, this week, in the board\'s order', () => {
  const text = renderText(page(FIT))
  const html = render(page(FIT))

  it('the path, then the title block: "Subject", its name, the week beside its month as counts, the period switch', () => {
    expect(text).toMatch(/^Market \/ Fit & comfort Market Subject Fit & comfort 5 to 11 October · 82 of 241 videos this week · 108 of 318 in October so far This week This month Over time Our read/)
    expect(html).toMatch(/<a (?=[^>]*aria-current="page")(?=[^>]*href="\/dashboard\/market\/subjects\/subj-fit")[^>]*>This week</)
    expect(html).toContain('href="/dashboard/market/subjects/subj-fit?period=month"')
  })

  it('the order: the header card, our read, inside it, the numbers, in their words, the Agent', () => {
    const at = (s: string) => text.indexOf(s)
    const order = ['Our read · October so far', 'What people are saying', 'Inside Fit & comfort', 'All 4 conversations', 'The numbers', 'Week by week', 'In their words', 'Ask what people say about Fit & comfort']
    for (let i = 1; i < order.length; i++) expect(at(order[i])).toBeGreaterThan(at(order[i - 1]))
  })

  it('the header card: the eyebrow, the stored headline as its lead, and the four figures inside the card', () => {
    const hub = hubOf(html)
    expect(markupText(hub)).toBe(`Our read · October so far ${fit.headline} 34% of your market’s videos 108 of 318 in October so far No clear change +0.9 pts against September, 33% 277 of 839 in September 82 of 241 videos this week 5 to 11 October 4 conversations inside it this week See them below ↓`)
    expect(hub).toMatch(/<h2 id="subject-head" data-copy="stored" data-slot="week_read" class="[^"]*text-\[32px\]/)
    // The level's bar, the change from its Verdict alone, and the week a
    // COUNT on the level's base: never "34%" beside the month's "34%".
    expect(hub).toMatch(/style="width:34%"/)
    // The badge's word is the figure's title, as the board draws it, and
    // the change it refused opens the line under it: no line opens on a "·"
    // (the lead's check, 17 Oct).
    expect(hub).toMatch(/<div data-copy="verdict" title="moved \+0\.9 pts, inside the [\d.]+ pt margin of this measurement" class="[^"]*text-\[22px\][^"]*">No clear change<\/div>/)
    expect(hub).toMatch(/<div class="[^"]*"><span data-copy="verdict" class="whitespace-nowrap">\+0\.9 pts<\/span> against September, <span data-copy="figure">33%<\/span><\/div>/)
    expect(markupText(hub)).not.toMatch(/·\s*\+0\.9/)
    expect(hub).toMatch(/<div data-copy="level" class="flex flex-col gap-1.5"><div class="[^"]*">82<\/div><div class="[^"]*">of 241 videos this week<\/div><\/div>/)
    expect(markupText(hub).match(/\d+%/g)).toEqual(['34%', '33%'])
    expect(hub).toContain('href="#inside"')
    expect(hub.match(/data-fig=""/g)).toHaveLength(4)
  })

  it('our read: what people are saying beside what it means, stored prose, with no headline of its own', () => {
    const read = readOf(html)
    expect(markupText(read)).toBe(`What people are saying ${fit.saying.join(' ')} What it means ${fit.means}`)
    expect(read).not.toContain('<h2')
  })

  it('inside it: "4 conversations this week", the three biggest as cards (description, the week beside its month, three bare bars, who, Open)', () => {
    expect(text).toContain('Inside Fit & comfort 4 conversations this week · the three biggest, then all four')
    const cards = html.match(/<article data-inside-card=""[\s\S]*?<\/article>/g)!
    expect(cards).toHaveLength(3)
    expect(markupText(cards[0])).toBe('How long a liner lasts People share how long their liners last before they lose grip, and when to replace one. 23 this week 35 in October so far 9 14 23 21 Sep 28 Sep 5 Oct Össur 4 · others 19 Open →')
    expect(cards[0]).toContain(`href="/dashboard/market/conversations/${fixtureId(1)}"`)
    // The description is Pass B's, in its slot; the bars draw three bare
    // counts in the market's yellow (the accent is the flag's, below).
    expect(cards[0]).toMatch(/<span data-copy="subject" data-slot="pass_b_theme" class="[^"]*">People share how long/)
    expect(cards[0]).not.toContain('fill-orange')
    // Week by week on the subject's own base: yellow, all three.
    expect(html.match(/<section id="subject-numbers"[\s\S]*?<\/section>/)![0]).not.toContain('fill-orange')
    // No flag this week inside Fit & comfort: no chip on any card.
    for (const c of cards) expect(c).not.toContain('data-flag=')
  })

  it('then all four as a list, the three included: name and description, who, three weeks, this week, the month; the footnote', () => {
    const table = html.match(/<table[\s\S]*?<\/table>/)![0]
    expect(markupText(table)).toContain('Conversation About Three weeks to 5 Oct This week October so far How long a liner lasts People share how long their liners last before they lose grip, and when to replace one. Össur 4 · others 19 9 · 14 · 23 23 35 Sweat under the liner')
    expect(table.match(/<tr /g)).toHaveLength(4)
    expect(text).toContain('All 4 conversations Biggest this week first. Each opens as its own page.')
    // The conversations' week counts (63) do not add up past the subject's 82:
    // the footnote says only what is so.
    expect(text).toContain('A video can sit in more than one conversation')
    expect(text).not.toContain('add up to more than')
  })

  it('the numbers: week by week on the level\'s base (three bare counts, the week beside its month), month by month, then the parts on their own base', () => {
    expect(text).toContain('The numbers Fit & comfort’s videos, this week beside October so far Week by week · videos 74 70 82 21 Sep 28 Sep 5 Oct 74 70 82 21 Sep 28 Sep 5 Oct 82 this week · 108 in October so far Month by month · share of your market’s videos 32% August 194 of 612 33% September 277 of 839 34% October so far · 108 of 318')
    expect(text).toContain('The parts below read the videos where a comment was about it: 40 of these 82 this week, and 64 of these 108 in October so far.')
    expect(text).toContain('Who’s saying it · of 64 in October so far New amputees in their first year 16 of 64 Caregivers and family 8 of 64 Active and athletic users 4 of 64 Each opens in Voices')
    expect(text).toContain('What people did · of 64 in October so far Complained about something 48 Asked a question 16')
    expect(text).toContain('Where · of 64 in October so far This week October so far TikTok 20 32 of 64 Instagram 10 16 of 64 YouTube 10 16 of 64')
    expect(html).toContain('href="/dashboard/voices?group=new-amputees#group-panel"')
    expect(text).not.toMatch(/\d\.\d%/)
  })

  it('in their words: three comments, each labelled with its conversation, opening its page', () => {
    expect(html.match(/data-copy="quote"/g)).toHaveLength(3)
    expect(text).toContain('In their words · 3 comments, each from its conversation Sweat under the liner “Long walks are fine')
    expect(html.match(/data-quote-from=""/g)).toHaveLength(3)
    expect(html).toMatch(new RegExp(`<a data-quote-from="" class="[^"]*" href="/dashboard/market/conversations/${fixtureId(2)}"><svg`))
  })

  it('the Agent: the board\'s card from 640, a full-width button on a phone', () => {
    expect(html).toMatch(/<section aria-label="Ask the Agent" class="[^"]*max-sm:hidden"><p[^>]*>Ask what people say about Fit &amp; comfort, in your own words\.<\/p><a class="[^"]*" href="\/dashboard\/agent\?ask=/)
    expect(html).toMatch(/justify-center sm:hidden" href="\/dashboard\/agent\?ask=[^"]*"><svg[^>]*>[\s\S]*?<\/svg>Ask the Agent about Fit &amp; comfort<\/a>/)
  })

  it('keeps the copy contract, and prints no dash', () => {
    assertCopyContract(page(FIT))
    expect(text).not.toMatch(/[–—]/)
  })
})

describe('a ready subject whose week could not be read on the level\'s base', () => {
  const d = marketSubjectFixture('fit', { subjectWeek: 'unread' })
  const text = renderText(page(d))

  it('the week\'s figure keeps its frame and says so in one line; no figure from another base anywhere', () => {
    expect(markupText(hubOf(render(page(d))))).toContain(`277 of 839 in September ${SUBJECT_WEEK_UNREAD} 4 conversations inside it this week`)
    expect(text).not.toMatch(/of 241 videos this week/)
    expect(text).toMatch(/^Market \/ Fit & comfort Market Subject Fit & comfort 5 to 11 October · 108 of 318 in October so far This week/)
    // Week by week keeps the two weeks read and the newest's empty slot (the
    // chart drawn twice: from 640, and at the phone's size).
    expect(text).toContain('Week by week · videos 74 70 21 Sep 28 Sep 5 Oct 74 70 21 Sep 28 Sep 5 Oct 108 in October so far')
    expect(text).toContain('The parts below read the videos where a comment was about it: 40 this week, and 64 of these 108 in October so far.')
    assertCopyContract(page(d))
  })
})

describe('a ready subject with no change to print against last month (17 Oct)', () => {
  it('the change keeps its frame and says so in one line; the other figures as they were', () => {
    const d = marketSubjectFixture('fit', { subjects: 'one_month' })
    expect(d.subjectPage!.panel.verdict).toBeNull()
    expect(subjectChangeGap('September')).toBe('No comparison with September yet.')
    expect(markupText(hubOf(render(page(d))))).toContain('108 of 318 in October so far No comparison with September yet. 82 of 241 videos this week')
    expect(render(page(d)).match(/data-fig-gap=""/g)).toHaveLength(1)
    assertCopyContract(page(d))
  })

  it('a refused verdict: the same line, no reason and no earlier figure; never "not read as a change"', () => {
    const v = FIT.subjectPage!.panel.verdict!
    const refused: MarketData = { ...FIT, subjectPage: { ...FIT.subjectPage!, prevPct: null, panel: { ...FIT.subjectPage!.panel, verdict: { ...v, changePts: null, bandPts: null, state: 'refused', refusedReason: 'tracking_change', pair: { mode: 'refuse', cause: 'searches', changeMonth: '2026-09-01', checkWith: null } } } } }
    const t = markupText(hubOf(render(page(refused))))
    expect(t).toContain('108 of 318 in October so far No comparison with September yet. 82 of 241')
    expect(t).not.toMatch(/not read as a change|refused|not compared|against September|277 of 839/)
  })
})

describe('the change figure in its other states (the lead\'s check, 17 Oct)', () => {
  const v = FIT.subjectPage!.panel.verdict!
  const withVerdict = (verdict: typeof v): MarketData => ({ ...FIT, subjectPage: { ...FIT.subjectPage!, panel: { ...FIT.subjectPage!.panel, verdict } } })

  it('a movement: its arrow and change are the title, one unit, then the comparison', () => {
    const t = markupText(hubOf(render(page(withVerdict({ ...v, state: 'moved', changePts: 4.2, bandPts: 2.1 })))))
    expect(t).toContain('108 of 318 in October so far ▲ 4.2 pts against September, 33% 277 of 839 in September')
    assertCopyContract(page(withVerdict({ ...v, state: 'moved', changePts: 4.2, bandPts: 2.1 })))
  })

  it('too few to compare: the word alone as the title, no change under it', () => {
    const t = markupText(hubOf(render(page(withVerdict({ ...v, state: 'too_little_data', changePts: -4.6, bandPts: 2 })))))
    expect(t).toContain('108 of 318 in October so far Too few to compare against September, 33%')
    expect(t).not.toContain('4.6')
  })
})

describe('the week\'s flag on a conversation inside it', () => {
  const d = marketSubjectFixture('cost')
  const html = render(page(d))

  it('"Unusual this week" on its card and its row only, the conversation the check flagged', () => {
    const cards = html.match(/<article data-inside-card=""[\s\S]*?<\/article>/g)!
    expect(cards[0]).toMatch(/data-flag="unusual"[^>]*>Unusual this week</)
    expect(cards[0]).toContain('Insurance refusals for powered knees')
    // Its newest week in the accent, as the board draws the flagged card's.
    expect(cards[0]).toMatch(/fill-orange[^"]*" data-week="newest"/)
    expect(cards.slice(1).some((c) => c.includes('fill-orange'))).toBe(false)
    expect(cards.slice(1).some((c) => c.includes('data-flag='))).toBe(false)
    const table = html.match(/<table[\s\S]*?<\/table>/)![0]
    expect(table.match(/data-flag="unusual"/g)).toHaveLength(1)
    assertCopyContract(page(d))
  })
})

describe('a ready subject, this month', () => {
  const d = marketSubjectFixture('cost', { period: 'month', subjectReads: 'v2' })
  const text = renderText(page(d))
  const html = render(page(d))

  it('three figures, no week figure and no week by week; the list\'s month alone; a read stored before headlines leads with no sentence', () => {
    expect(text).toMatch(/^Market \/ Cost & access Market Subject Cost & access October so far · 70 of 318 videos This week This month Over time/)
    expect(markupText(hubOf(html))).toBe('Our read · October so far 22% of your market’s videos 70 of 318 in October so far ▲ 7 pts against September, 15% 126 of 839 in September 3 conversations inside it in October so far See them below ↓')
    expect(hubOf(html)).not.toContain('id="subject-head"')
    expect(hubOf(html).match(/data-fig=""/g)).toHaveLength(3)
    expect(markupText(html.match(/<table[\s\S]*?<\/table>/)![0])).toMatch(/^Conversation About October so far Insurance refusals/)
    expect(text).not.toContain('Week by week')
    expect(text).not.toContain('this week')
    assertCopyContract(page(d))
  })
})

describe('every state keeps its frame', () => {
  it('thin: code\'s one line in the read\'s card', () => {
    const d = marketSubjectFixture('choosing')
    const thin = OSSUR_SUBJECT_READS.find((r) => r.status === 'thin')!
    expect(markupText(readOf(render(body(d))))).toBe(`What people are saying ${thin.saying[0]}`)
    expect(render(body(d))).toContain('data-subject-read="thin"')
    // A thin read has no headline: the header card leads with none.
    expect(hubOf(render(body(d)))).not.toContain('<h2')
    assertCopyContract(page(d))
  })

  it('no read this month: its line; with the tenant\'s reads switched off, the week read\'s sentence under it', () => {
    expect(markupText(readOf(render(body(marketSubjectFixture('look', { subjects: 'states' })))))).toBe('What people are saying No read of Look & style in October yet.')
    expect(markupText(readOf(render(body(marketSubjectFixture('cost', { subjectReadsOff: true })))))).toBe('What people are saying No read of Cost & access in October yet. People ask how to get a knee paid for, and what to do when a claim is refused.')
  })

  it('not measured yet (U6): its state\'s line once in the header card, its conversations by name, no figure, line, chip or quote', () => {
    const d = marketSubjectFixture('cost', { flagged: false, noNew: true, subjects: 'provisional', brands: 'not_counted', weeks: 'insufficient', noGroups: true })
    const text = renderText(page(d))
    expect(text).toBe(`Market / Cost & access Market Subject Cost & access 5 to 11 October This week This month Over time Our read · October so far ${SUBJECT_NOT_MEASURED} What people are saying ${SUBJECT_READ_HELD} Inside Cost & access Insurance refusals for powered knees Appeals, letters from a prosthetist and the knee insurers will not pay for. Open → Paying out of pocket Open → Medical aid and liners Open → Every conversation inside it Each opens as its own page. Each opens as its own page. Conversation Insurance refusals for powered knees Appeals, letters from a prosthetist and the knee insurers will not pay for. Paying out of pocket Medical aid and liners Insurance refusals for powered knees Paying out of pocket Medical aid and liners The numbers ${SUBJECT_NUMBERS_HELD} Ask what people say about Cost & access, in your own words. Ask the Agent about Cost & access Ask the Agent about Cost & access`)
    expect(text.split(SUBJECT_NOT_MEASURED).length - 1).toBe(1)
    expect(copyNodes(render(page(d))).filter((n) => n.kind === 'figure' || n.kind === 'level' || n.kind === 'verdict' || n.kind === 'quote')).toEqual([])
    assertCopyContract(page(d))
  })

  it('failed: why, said once on its page, then its conversations as an open one\'s; no figure', () => {
    const d = marketSubjectFixture('community', { subjects: 'tracked' })
    const text = renderText(page(d))
    expect(text).toContain(`Our read · October so far ${FAILED_EXPLAINED} What people are saying ${SUBJECT_READ_HELD} Inside Community & encouragement Running-blade stories Open →`)
    expect(text.split(FAILED_EXPLAINED).length - 1).toBe(1)
    expect(copyNodes(render(page(d))).filter((n) => n.kind === 'figure' || n.kind === 'level')).toEqual([])
  })

  it('a ready subject with no conversation this week keeps the section\'s frame and says so in one line', () => {
    const none: MarketData = { ...FIT, subjectPage: { ...FIT.subjectPage!, inside: [], insideTotal: 0 } }
    const text = renderText(body(none))
    expect(text).toContain(`Inside Fit & comfort ${insideNone('this week')} The numbers`)
    expect(insideNone('this week')).toBe('No conversation in it reached three videos this week.')
    expect(render(body(none))).toContain('data-inside-none=""')
    // The header card's count says none, and offers no link down.
    expect(markupText(hubOf(render(body(none))))).toMatch(/0 conversations inside it this week$/)
  })

  it('a ready subject the month has no reading for yet: no figure of its own, the month\'s line; its conversations\' own counts', () => {
    const d = marketSubjectFixture('fit', { subjects: 'unread' })
    const html = render(body(d))
    expect(markupText(hubOf(html))).toBe(`Our read · October so far ${fit.headline} No reading in October so far yet.`)
    expect(copyNodes(hubOf(html)).filter((n) => n.kind === 'figure' || n.kind === 'level' || n.kind === 'verdict')).toEqual([])
    expect(renderText(body(d))).toMatch(/ The numbers No reading in October so far yet\. Ask what people say/)
    expect(html).toContain('data-numbers-gap="unread"')
    expect(renderText(body(d))).not.toContain(SUBJECT_NUMBERS_HELD)
    // Its check passed (U6 holds nothing back): each conversation's own
    // counts, the category's videos, print inside it.
    expect(renderText(body(d))).toContain('Inside Fit & comfort 4 conversations this week · the three biggest, then all four')
    assertCopyContract(page(d))
  })

  it('the numbers\' line names each state\'s own reason: unread, not measured, failed', () => {
    expect(subjectNumbersLine({ state: 'unread', monthText: 'October so far' })).toBe('No reading in October so far yet.')
    expect(subjectNumbersLine({ state: 'unread', monthText: 'October' })).toBe('No reading in October yet.')
    expect(subjectNumbersLine({ state: 'provisional', monthText: 'October so far' })).toBe(SUBJECT_NUMBERS_HELD)
    expect(subjectNumbersLine({ state: 'failed', monthText: 'October so far' })).toBe(SUBJECT_NUMBERS_HELD)
    expect(render(body(marketSubjectFixture('function', { subjects: 'states' })))).toMatch(new RegExp(`data-numbers-gap="provisional"[^>]*><p[^>]*>${SUBJECT_NUMBERS_HELD}</p>`))
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

describe('on a phone (F3-Market-Subject-Phone)', () => {
  const html = render(page(FIT))

  it('the list is two lines a row: the name and this week, then its month and its three weeks', () => {
    const rows = html.match(/<div data-phone-row=""[\s\S]*?<\/span><\/span><\/div>/g)!
    expect(rows).toHaveLength(4)
    expect(markupText(rows[0])).toBe('How long a liner lasts 23 35 in October so far 9 · 14 · 23')
    expect(html).toContain('This week, then October so far. The three weeks to 5 Oct, oldest first.')
  })

  it('the strip is two to a row, and the header card\'s gutters are the phone\'s', () => {
    expect(hubOf(html)).toMatch(/class="-mx-\[34px\] mt-1.5 grid grid-cols-2 [^"]*max-sm:-mx-\[18px\]/)
  })
})

describe('a subject\'s read prints on its page exactly where its card prints it (17 Oct)', () => {
  // ONE RULE (`subjectOwnRead`): the card on the top page prints a read if and
  // only if its page prints the same read, in every state.
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
      const html = render(body(marketSubjectFixture(key, opts)))
      const read = readOf(html)
      const words = stored(render(<SubjectCardsView cards={[card]} />))
      if (card.state === 'read' || card.state === 'thin') {
        // The same read: every line the card prints, its page prints (the
        // headline in the header card, the rest in our read).
        expect(read.match(/data-subject-read="([a-z_]+)"/)?.[1] ?? 'read').toBe(card.state)
        expect(words.length).toBeGreaterThan(0)
        for (const w of words) expect([...stored(hubOf(html)), ...stored(read)]).toContain(w)
      } else {
        // No read on either: the card's own line stands on its page, once.
        expect(words).toEqual([])
        expect(markupText(hubOf(html) + read)).toContain(card.note!)
      }
    })
  }
})

describe('the switcher in its row', () => {
  it('opens on the subject ticked, the ready ranked, the unready below a hairline in words', () => {
    const d = marketSubjectFixture('fit', { subjects: 'states' })
    const text = renderText(<MarketSubjectPage data={d} switcherOpen />)
    expect(text).toContain(`Your subjects Fit & comfort Cost & access Choosing the right device Little talk so far Look & style Community & encouragement ${SUBJECT_NOT_MEASURED} Function & movement ${SUBJECT_NOT_MEASURED}`)
    expect(render(<MarketSubjectPage data={d} switcherOpen />)).toContain(`href="/dashboard/market/subjects/${fixtureSubjectId('cost')}"`)
  })
})
