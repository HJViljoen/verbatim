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
const readOf = (html: string) => html.match(/<article id="subject-read"[\s\S]*?<\/article>/)![0]
/** The figures row (the audit design: the board's strip, in the title block). */
const stripOf = (html: string) => html.slice(html.indexOf('<dl data-stat-strip'), html.indexOf('</dl>') + 5)
/** The share tile, where the change against last month lives now. */
const shareOf = (html: string) => html.match(/<article data-share=""[\s\S]*?<\/article>/)![0]
/** The words as a reader sees them: no space the markup's tags leave before
 *  a comma, a stop or a bracket, or after an opening bracket. */
const tight = (t: string): string => t.replace(/\s+([,.)])/g, '$1').replace(/\(\s+/g, '(')

describe('a ready subject, this week, in the board\'s order', () => {
  const text = renderText(page(FIT))
  const html = render(page(FIT))

  it('the path, then the title block: its name, the period switch, and the figures row (the week a count on the level\'s base beside its month)', () => {
    // The audit design (Market-Subject.dc.html): no tile and no "Subject"
    // label; the figures row's four cells; the month by its name.
    expect(tight(text)).toMatch(/^Market \/ Fit & comfort Market Fit & comfort This week October so far Over time Week 5 to 11 October This week 82 of 241 videos October so far 108 of 318 videos, 34% Conversations this week 4 /)
    expect(html).not.toContain('data-level-tile')
    expect(html).toMatch(/<a (?=[^>]*aria-current="page")(?=[^>]*href="\/dashboard\/market\/subjects\/subj-fit")[^>]*>This week</)
    expect(html).toContain('href="/dashboard/market/subjects/subj-fit?period=month"')
  })

  it('the order: our read, inside it, the numbers, in their words, the Agent', () => {
    const at = (s: string) => text.indexOf(s)
    const order = ['Our read of October so far', 'What people are saying', 'Inside Fit & comfort', 'The numbers', 'Videos, week by week', 'Share of your market’s videos', 'In their words', 'Ask what people say about Fit & comfort']
    for (let i = 1; i < order.length; i++) expect(at(order[i])).toBeGreaterThan(at(order[i - 1]))
  })

  it('the figures row, the read\'s heading, and the change in the share tile', () => {
    const strip = stripOf(html)
    // The week a COUNT on the level's base: never "34%" beside the month's.
    expect(strip).toMatch(/<span data-copy="level">82 of 241 videos<\/span>/)
    expect(strip).toMatch(/<span data-copy="level">108 of 318 videos<\/span>, <span data-copy="figure">34%<\/span>/)
    expect(markupText(strip).match(/\d+%/g)).toEqual(['34%'])
    // The headline as the read's 28px heading.
    expect(html).toMatch(/<h2 id="subject-head" data-copy="stored" data-slot="week_read" class="[^"]*text-\[28px\]/)
    // The change, from its Verdict alone, in the share tile: the badge's
    // word is the title, and the change it refused opens the line under it.
    const share = shareOf(html)
    expect(share).toMatch(/<div data-copy="verdict" title="moved \+0\.9 pts, inside the [\d.]+ pt margin of this measurement" class="[^"]*text-\[22px\][^"]*">No clear change<\/div>/)
    expect(share).toMatch(/<div class="[^"]*"><span data-copy="verdict" class="whitespace-nowrap">\+0\.9 pts<\/span> against September, <span data-copy="figure">33%<\/span><\/div>/)
    expect(markupText(share)).not.toMatch(/·\s*\+0\.9/)
  })

  it('our read: its headline, then what people are saying beside what it means, stored prose', () => {
    const read = readOf(html)
    expect(markupText(read)).toBe(`${fit.headline} Our read of October so far What people are saying ${fit.saying.join(' ')} What it means ${fit.means}`)
    expect(read).toContain('min-[1180px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]')
  })

  it('inside it: one list in a tile, no cards (the list holds them), the note in the head', () => {
    expect(text).toContain('Inside Fit & comfort Biggest this week first. Each opens as its own page. Conversation')
    expect(html).not.toContain('data-inside-card')
    // Week by week on the subject's own base: yellow, no accent.
    expect(html.match(/<section id="subject-numbers"[\s\S]*?<\/section>/)![0]).not.toContain('fill-orange')
  })

  it('then all four as a list: name and description, the brands named, this week, the month; the footnote; no three weeks', () => {
    const table = html.match(/<table[\s\S]*?<\/table>/)![0]
    expect(tight(markupText(table))).toContain('Conversation Brands named This week October so far How long a liner lasts People share how long their liners last before they lose grip, and when to replace one. Össur (4), others (19) 23 35 Sweat under the liner')
    expect(table.slice(table.indexOf('<tbody')).match(/<tr>/g)).toHaveLength(4)
    expect(table).not.toMatch(/Three weeks|·/)
    // The conversations' week counts (63) do not add up past the subject's 82:
    // the footnote says only what is so.
    expect(text).toContain('A video can sit in more than one conversation')
    expect(text).not.toContain('add up to more than')
  })

  it('the numbers: week by week on the level\'s base, the share month by month with its change, then the parts in tiles on their own base', () => {
    const t = tight(text)
    expect(t).toContain('The numbers Videos, week by week By the week people commented 74 70 82 21 Sep 28 Sep 5 Oct Share of your market’s videos Month by month No clear change +0.9 pts against September, 33% 277 of 839 in September 32% August 194 of 612 33% September 277 of 839 34% October so far, 108 of 318')
    expect(t).toContain('The parts below read the videos where a comment was about it: 40 of these 82 this week, and 64 of these 108 in October so far.')
    // Each tile's sub says its base once; the rows print bare counts and
    // bars against the list's largest (decisions 2 and 5).
    expect(t).toContain('Who’s saying it Videos in October so far, of 64. Each opens in Voices. New amputees in their first year 16 Caregivers and family 8 Active and athletic users 4')
    expect(t).toContain('What people did Videos in October so far, of 64 Complained about something 48 Asked a question 16')
    expect(t).toContain('Where it’s said Videos by platform. October so far counts are of 64. Platform This week October so far TikTok 20 32 Instagram 10 16 YouTube 10 16')
    const saying = html.match(/<article data-saying=""[\s\S]*?<\/article>/)![0]
    expect([...saying.matchAll(/bg-brand" style="width:([0-9.]+)%"/g)].map((x) => Math.round(Number(x[1])))).toEqual([100, 50, 25])
    expect(html).toContain('href="/dashboard/voices/groups/new-amputees"')
    expect(text).not.toMatch(/\d\.\d%/)
  })

  it('in their words: three comments, a tile each, labelled with its conversation, opening its page', () => {
    expect(html.match(/data-copy="quote"/g)).toHaveLength(3)
    expect(text).toContain('In their words Three comments, each from its conversation Sweat under the liner “Long walks are fine')
    expect(html.match(/data-quote-from=""/g)).toHaveLength(3)
    const from = html.match(/<a [^>]*data-quote-from=""[^>]*>/)![0]
    expect(from).toContain(`href="/dashboard/market/conversations/${fixtureId(2)}"`)
    // No glyph square before the conversation's name.
    expect(html.slice(html.indexOf(from), html.indexOf(from) + from.length + 10)).not.toContain('<svg')
  })

  it('the Agent: one tile and a link that says where it goes, at every width', () => {
    expect(html).toMatch(/<section aria-label="Ask the Agent" class="[^"]*"><p[^>]*>Ask what people say about Fit &amp; comfort, in your own words\.<\/p><a [^>]*href="\/dashboard\/agent\?ask=/)
    expect(html).not.toMatch(/<section aria-label="Ask the Agent" class="[^"]*max-sm:hidden/)
    expect(html.match(/href="\/dashboard\/agent\?ask=/g)).toHaveLength(1)
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
    expect(markupText(stripOf(render(page(d))))).toContain(`This week ${SUBJECT_WEEK_UNREAD} October so far 108 of 318 videos`)
    expect(text).not.toMatch(/of 241 videos/)
    // Week by week keeps the two weeks read; the newest draws nothing in
    // its column (no empty slot, decision 4).
    expect(text).toContain('Videos, week by week By the week people commented 74 70 21 Sep 28 Sep 5 Oct Share of')
    expect(text).toContain('The parts below read the videos where a comment was about it: 40 this week, and 64 of these 108 in October so far.')
    assertCopyContract(page(d))
  })
})

describe('a ready subject with no change to print against last month (17 Oct)', () => {
  it('the change keeps its frame and says so in one line; the other figures as they were', () => {
    const d = marketSubjectFixture('fit', { subjects: 'one_month' })
    expect(d.subjectPage!.panel.verdict).toBeNull()
    expect(subjectChangeGap('September')).toBe('No comparison with September yet.')
    // The share tile says it in the dashed box; the figures row as it was.
    expect(markupText(shareOf(render(page(d))))).toMatch(/^Share of your market’s videos Month by month No comparison with September yet\./)
    expect(markupText(stripOf(render(page(d))))).toContain('82 of 241 videos')
    expect(render(page(d)).match(/data-fig-gap=""/g)).toHaveLength(1)
    assertCopyContract(page(d))
  })

  it('a refused verdict: the same line, no reason and no earlier figure; never "not read as a change"', () => {
    const v = FIT.subjectPage!.panel.verdict!
    const refused: MarketData = { ...FIT, subjectPage: { ...FIT.subjectPage!, prevPct: null, panel: { ...FIT.subjectPage!.panel, verdict: { ...v, changePts: null, bandPts: null, state: 'refused', refusedReason: 'tracking_change', pair: { mode: 'refuse', cause: 'searches', changeMonth: '2026-09-01', checkWith: null } } } } }
    const share = shareOf(render(page(refused)))
    const t = markupText(share)
    expect(t).toContain('Month by month No comparison with September yet.')
    expect(t).not.toMatch(/not read as a change|refused|not compared|against September/)
    // The change's place holds the one line: no earlier figure beside it
    // (the month bars below still draw each month's own count).
    const gap = share.slice(share.indexOf('data-fig-gap'), share.indexOf('</div></div>', share.indexOf('data-fig-gap')))
    expect(markupText(`<div ${gap}`)).toBe('No comparison with September yet.')
  })
})

describe('the change figure in its other states (the lead\'s check, 17 Oct)', () => {
  const v = FIT.subjectPage!.panel.verdict!
  const withVerdict = (verdict: typeof v): MarketData => ({ ...FIT, subjectPage: { ...FIT.subjectPage!, panel: { ...FIT.subjectPage!.panel, verdict } } })

  it('a movement: its arrow and change are the title, one unit, then the comparison', () => {
    const t = markupText(shareOf(render(page(withVerdict({ ...v, state: 'moved', changePts: 4.2, bandPts: 2.1 })))))
    expect(t).toContain('Month by month ▲ 4.2 pts against September, 33% 277 of 839 in September')
    assertCopyContract(page(withVerdict({ ...v, state: 'moved', changePts: 4.2, bandPts: 2.1 })))
  })

  it('too few to compare: the word alone as the title, no change under it', () => {
    const t = markupText(shareOf(render(page(withVerdict({ ...v, state: 'too_little_data', changePts: -4.6, bandPts: 2 })))))
    expect(t).toContain('Month by month Too few to compare against September, 33%')
    expect(t).not.toContain('4.6')
  })
})

describe('the week\'s flag on a conversation inside it', () => {
  const d = marketSubjectFixture('cost')
  const html = render(page(d))

  it('"Unusual this week" on its row only, the conversation the check flagged (the cards are gone)', () => {
    expect(html).not.toContain('data-inside-card')
    const table = html.match(/<table[\s\S]*?<\/table>/)![0]
    expect(table.match(/data-flag="unusual"/g)).toHaveLength(1)
    expect(table).toMatch(/Insurance refusals for powered knees<\/span><\/a><span data-copy="verdict" data-flag="unusual"/)
    assertCopyContract(page(d))
  })
})

describe('a ready subject, this month', () => {
  const d = marketSubjectFixture('cost', { period: 'month', subjectReads: 'v2' })
  const text = renderText(page(d))
  const html = render(page(d))

  it('three figures, no week figure and no week by week; the list\'s month alone; a read stored before headlines leads with no sentence', () => {
    expect(tight(text)).toMatch(/^Market \/ Cost & access Market Cost & access This week October so far Over time October so far 70 of 318 videos, 22% Conversations in October so far 3 Our read of October so far /)
    expect(stripOf(html).match(/<dt/g)).toHaveLength(2)
    // A read stored before headlines: the read's heading is "Our read of
    // October so far", never a stored line.
    expect(html).not.toMatch(/data-copy="stored"[^>]*id="subject-head"|id="subject-head" data-copy="stored"/)
    expect(markupText(shareOf(html))).toContain('▲ 7 pts against September, 15% 126 of 839 in September')
    expect(markupText(html.match(/<table[\s\S]*?<\/table>/)![0])).toMatch(/^Conversation Brands named October so far Insurance refusals/)
    expect(text).not.toContain('Videos, week by week')
    expect(text).not.toContain('this week')
    assertCopyContract(page(d))
  })
})

describe('every state keeps its frame', () => {
  it('thin: code\'s one line in the read\'s card', () => {
    const d = marketSubjectFixture('choosing')
    const thin = OSSUR_SUBJECT_READS.find((r) => r.status === 'thin')!
    expect(markupText(readOf(render(body(d))))).toBe(`Our read of October so far What people are saying ${thin.saying[0]}`)
    expect(render(body(d))).toContain('data-subject-read="thin"')
    // A thin read has no headline: the read's heading is never stored.
    expect(readOf(render(body(d)))).not.toMatch(/<h2[^>]*data-copy="stored"/)
    assertCopyContract(page(d))
  })

  it('no read this month: its line; with the tenant\'s reads switched off, the week read\'s sentence under it', () => {
    expect(markupText(readOf(render(body(marketSubjectFixture('look', { subjects: 'states' })))))).toBe('Our read of October so far What people are saying No read of Look & style in October yet.')
    expect(markupText(readOf(render(body(marketSubjectFixture('cost', { subjectReadsOff: true })))))).toBe('Our read of October so far What people are saying No read of Cost & access in October yet. People ask how to get a knee paid for, and what to do when a claim is refused.')
  })

  it('not measured yet (U6): its state\'s line once in the figures row, its conversations by name, no figure, line, chip or quote', () => {
    const d = marketSubjectFixture('cost', { flagged: false, noNew: true, subjects: 'provisional', brands: 'not_counted', weeks: 'insufficient', noGroups: true })
    const text = renderText(page(d))
    expect(text).toBe(`Market / Cost & access Market Cost & access This week October so far Over time Week 5 to 11 October October so far ${SUBJECT_NOT_MEASURED} Our read of October so far What people are saying ${SUBJECT_READ_HELD} Inside Cost & access Each opens as its own page. Conversation Insurance refusals for powered knees Appeals, letters from a prosthetist and the knee insurers will not pay for. Paying out of pocket Medical aid and liners Insurance refusals for powered knees Paying out of pocket Medical aid and liners The numbers ${SUBJECT_NUMBERS_HELD} Ask what people say about Cost & access, in your own words. Ask the Agent about Cost & access`)
    expect(text.split(SUBJECT_NOT_MEASURED).length - 1).toBe(1)
    expect(copyNodes(render(page(d))).filter((n) => n.kind === 'figure' || n.kind === 'level' || n.kind === 'verdict' || n.kind === 'quote')).toEqual([])
    assertCopyContract(page(d))
  })

  it('failed: why, said once on its page, then its conversations as an open one\'s; no figure', () => {
    const d = marketSubjectFixture('community', { subjects: 'tracked' })
    const text = renderText(page(d))
    expect(text).toContain(`October so far ${FAILED_EXPLAINED} Our read of October so far What people are saying ${SUBJECT_READ_HELD} Inside Community & encouragement Each opens as its own page. Conversation Running-blade stories`)
    expect(text.split(FAILED_EXPLAINED).length - 1).toBe(1)
    expect(copyNodes(render(page(d))).filter((n) => n.kind === 'figure' || n.kind === 'level')).toEqual([])
  })

  it('a ready subject with no conversation this week keeps the section\'s frame and says so in one line', () => {
    const none: MarketData = { ...FIT, subjectPage: { ...FIT.subjectPage!, inside: [], insideTotal: 0 } }
    const text = renderText(body(none))
    expect(text).toContain(`Inside Fit & comfort ${insideNone('this week')} The numbers`)
    expect(insideNone('this week')).toBe('No conversation in it reached three videos this week.')
    expect(render(body(none))).toContain('data-inside-none=""')
    // The figures row's count says none.
    expect(markupText(stripOf(render(page(none))))).toMatch(/Conversations this week 0$/)
  })

  it('a ready subject the month has no reading for yet: no figure of its own, the month\'s line; its conversations\' own counts', () => {
    const d = marketSubjectFixture('fit', { subjects: 'unread' })
    const html = render(body(d))
    const strip = stripOf(render(page(d)))
    expect(markupText(strip)).toBe('Week 5 to 11 October October so far No reading in October so far yet. Conversations this week 4')
    expect(copyNodes(strip).filter((n) => n.kind === 'level' || n.kind === 'verdict')).toEqual([])
    expect(markupText(readOf(html))).toMatch(new RegExp(`^${fit.headline!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} Our read of October so far`))
    expect(renderText(body(d))).toMatch(/ The numbers No reading in October so far yet\. Ask what people say/)
    expect(html).toContain('data-numbers-gap="unread"')
    expect(renderText(body(d))).not.toContain(SUBJECT_NUMBERS_HELD)
    // Its check passed (U6 holds nothing back): each conversation's own
    // counts, the category's videos, print inside it.
    expect(renderText(body(d))).toContain('Inside Fit & comfort Biggest this week first. Each opens as its own page.')
    expect(renderText(body(d))).toMatch(/How long a liner lasts People share [^.]*\. Össur \( 4 \), others \( 19 \) 23 35/)
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
    expect(renderText(page(d))).toBe(`Market ${SUBJECT_MISSING} ${BACK_TO_MARKET}`)
    expect(render(page(d))).toContain('href="/dashboard/market"')
  })

  it('before the first update: the top page\'s own line', () => {
    expect(renderText(page(null as never))).toBe('Market Your market’s first week will appear here after the first update.')
  })
})

describe('on a phone (F3-Market-Subject-Phone)', () => {
  const html = render(page(FIT))

  it('the list is two lines a row: the name and this week, then its month', () => {
    expect(html.match(/data-phone-row=""/g)).toHaveLength(4)
    const first = html.slice(html.indexOf('data-phone-row=""'), html.indexOf('data-phone-row=""', html.indexOf('data-phone-row=""') + 1))
    expect(markupText(`<div ${first}`).replace(/ <div$/, '')).toBe('How long a liner lasts 23 35 in October so far')
  })

  it('the figures row stacks under 900px, four across from it', () => {
    expect(stripOf(html)).toMatch(/data-stat-strip="" class="[^"]*grid-cols-1[^"]*min-\[900px\]:grid-cols-4/)
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
        for (const w of words) expect(stored(read)).toContain(w)
      } else {
        // No read on either: the card's own line stands on its page, once.
        expect(words).toEqual([])
        // The state's own line stands on its page: in the figures row or the read.
        expect(markupText(render(page(marketSubjectFixture(key, opts))))).toContain(card.note!)
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
